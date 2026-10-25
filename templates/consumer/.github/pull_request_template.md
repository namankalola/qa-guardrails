## What and why

<!-- Ticket: ABC-123. One paragraph on the change. -->

## Test evidence

- [ ] New/changed tests are tagged (`@smoke`, `@regression`, ...) and pass locally
- [ ] No `test.only`, hard waits (`waitForTimeout`), or raw `page` / locators in specs
- [ ] Test data comes from the data layer (Excel/config), not literals in specs
- [ ] Any skip or quarantine names a ticket and an expiry (`quarantine('ABC-123', 'YYYY-MM-DD')`)

## Risk

- [ ] Touches shared framework code (`src/core/**`) - reviewed by framework owners
- [ ] Adds or upgrades a dependency - licence and advisories checked by the guardrails
- [ ] Handles credentials or tokens - secrets come from the CI secret store only
