/**
 * A test is flaky when it failed at least once and then passed on retry
 * (Playwright status `flaky`). The flake rate is measured over executed tests,
 * so skipped and quarantined tests do not dilute it.
 *
 * @param {import('./playwright-report.mjs').TestEntry[]} tests
 * @param {number} budgetPct
 */
export function evaluateFlakes(tests, budgetPct) {
  const executed = tests.filter((t) => t.statuses.some((s) => s !== 'skipped'));
  const flaky = executed.filter((t) => t.statuses.includes('flaky'));
  const failed = executed.filter((t) => t.statuses.includes('unexpected'));
  const rate = executed.length === 0 ? 0 : (flaky.length / executed.length) * 100;
  return { executed: executed.length, flaky, failed, rate, overBudget: rate > budgetPct };
}
