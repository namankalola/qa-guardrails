const DAY_MS = 24 * 60 * 60 * 1000;
const UNTIL = /until[=:\s]+(\d{4}-\d{2}-\d{2})/i;

/**
 * Quarantine contract (see docs/adr/0003-quarantine-policy.md):
 *
 *   test('...', {
 *     tag: '@quarantine',
 *     annotation: { type: 'quarantine', description: 'QA-123 until=2026-11-30' },
 *   }, async () => { ... });
 *
 * Quarantined tests are excluded from blocking runs by withGuardrails() and
 * run in the nightly quarantine job instead. Every quarantine needs an owner
 * ticket and an expiry inside the policy window, and the quarantined share of
 * the suite is capped.
 *
 * @param {import('./playwright-report.mjs').TestEntry[]} tests
 * @param {import('../policy.mjs').Policy['testQuality']} testPolicy
 */
export function evaluateQuarantine(tests, testPolicy, now = new Date()) {
  const { quarantine, requireSkipReason } = testPolicy;
  const ticket = new RegExp(quarantine.ticketPattern);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const problems = [];
  const quarantined = [];

  for (const t of tests) {
    const location = { file: t.file, line: t.line };
    if (t.tags.includes(quarantine.tag)) {
      quarantined.push(t);
      const note = t.annotations.find((a) => a.type === 'quarantine')?.description ?? '';
      if (!ticket.test(note)) {
        problems.push({
          ...location,
          message: `${t.title}: quarantine annotation must reference a ticket (${quarantine.ticketPattern})`,
        });
      }
      const until = note.match(UNTIL)?.[1];
      if (!until) {
        problems.push({
          ...location,
          message: `${t.title}: quarantine annotation needs an expiry, e.g. "until=YYYY-MM-DD"`,
        });
      } else {
        const expiry = Date.parse(`${until}T00:00:00Z`);
        if (Number.isNaN(expiry) || expiry < today) {
          problems.push({
            ...location,
            message: `${t.title}: quarantine expired on ${until} - fix the test or delete it`,
          });
        } else if (expiry - today > quarantine.maxDays * DAY_MS) {
          problems.push({
            ...location,
            message: `${t.title}: quarantine expiry ${until} exceeds the ${quarantine.maxDays}-day limit`,
          });
        }
      }
      continue;
    }

    // A static test.skip() adds its own description-less annotation, so accept a ticket on any
    // skip/fixme/issue annotation (`{ annotation: { type: 'issue', description: 'QA-1' } }`).
    const isSkipped =
      t.expectedStatus === 'skipped' || t.annotations.some((a) => a.type === 'skip' || a.type === 'fixme');
    const reasons = t.annotations
      .filter((a) => ['skip', 'fixme', 'issue'].includes(a.type))
      .map((a) => a.description ?? '');
    if (requireSkipReason && isSkipped && !reasons.some((r) => ticket.test(r))) {
      problems.push({
        ...location,
        message: `${t.title}: skipped without a ticket - use test.skip(title, ...) with a reason naming a ticket, or quarantine it`,
      });
    }
  }

  const pct = tests.length === 0 ? 0 : (quarantined.length / tests.length) * 100;
  if (pct > quarantine.maxPct) {
    problems.push({
      message: `${quarantined.length}/${tests.length} tests (${pct.toFixed(1)}%) are quarantined - limit is ${quarantine.maxPct}%`,
    });
  }

  return { total: tests.length, quarantined, pct, problems };
}
