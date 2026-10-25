/**
 * Helpers over Playwright's JSON reporter format, shared by the quarantine
 * gate (`playwright test --list --reporter=json`) and the flake gate (a real
 * run's JSON report).
 */

/** The JSON reporter strips the leading `@` from tags; normalise back. */
const normaliseTag = (tag) => (tag.startsWith('@') ? tag : `@${tag}`);

/**
 * @typedef {{
 *   key: string, title: string, file: string, line: number, tags: string[],
 *   projects: string[], annotations: Array<{ type: string, description?: string }>,
 *   statuses: string[], expectedStatus: string, retries: number
 * }} TestEntry
 */

/** Flatten a JSON report into one entry per spec (merged across projects). */
export function collectTests(report) {
  /** @type {Map<string, TestEntry>} */
  const byKey = new Map();

  const visit = (suite, titlePath) => {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      const key = `${spec.file}:${spec.line}:${spec.title}`;
      const entry = byKey.get(key) ?? {
        key,
        title: [...path, spec.title].join(' › '),
        file: spec.file,
        line: spec.line,
        tags: (spec.tags ?? []).map(normaliseTag),
        projects: [],
        annotations: [],
        statuses: [],
        expectedStatus: 'passed',
        retries: 0,
      };
      for (const test of spec.tests ?? []) {
        entry.projects.push(test.projectName ?? '');
        entry.annotations.push(...(test.annotations ?? []));
        if (test.status) entry.statuses.push(test.status);
        if (test.expectedStatus === 'skipped') entry.expectedStatus = 'skipped';
        entry.retries = Math.max(entry.retries, (test.results?.length ?? 1) - 1);
      }
      byKey.set(key, entry);
    }
    for (const child of suite.suites ?? []) visit(child, path);
  };

  for (const suite of report.suites ?? []) visit(suite, []);
  return [...byKey.values()];
}

/** Merge several reports (one per Playwright config / shard). */
export function collectFromReports(reports) {
  const merged = new Map();
  for (const report of reports) {
    for (const entry of collectTests(report)) {
      const existing = merged.get(entry.key);
      if (existing) {
        existing.projects.push(...entry.projects);
        existing.annotations.push(...entry.annotations);
        existing.statuses.push(...entry.statuses);
        existing.retries = Math.max(existing.retries, entry.retries);
        if (entry.expectedStatus === 'skipped') existing.expectedStatus = 'skipped';
      } else {
        merged.set(entry.key, entry);
      }
    }
  }
  return [...merged.values()];
}
