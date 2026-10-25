# ADR 0003: Quarantine instead of skip or retry-until-green

**Status:** accepted · **Date:** 2026-10-25

## Context

Flaky tests get "fixed" by raising retries or adding `test.skip`. Both hide real defects, and
skipped tests are never revisited.

## Decision

- Retries are capped by policy (≤ 2) inside `withGuardrails()`, whatever the config file says.
- A test that passes only on retry counts as _flaky_. The PR fails when the flake rate exceeds the
  team budget.
- A known-flaky test is **quarantined**, not skipped:
  `test('...', quarantine('QA-123', '2026-11-30', 'reason'), async () => {})`.
  It carries the `@quarantine` tag and an annotation `QA-123 until=2026-11-30`.
- Quarantined tests are excluded from blocking runs and run nightly (`GUARDRAILS_QUARANTINE=only`).
- The quarantine gate fails on a missing ticket, a missing or expired expiry, an expiry past
  `maxDays`, a quarantined share over `maxPct`, or a `skip`/`fixme` without a ticket
  (`{ annotation: { type: 'issue', description: 'QA-1' } }` counts).

## Consequences

- Every non-running test has an owner and a deadline, visible in the job summary.
- Expiry forces a decision: fix it, or delete it.
