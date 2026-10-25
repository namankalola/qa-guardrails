# Security policy

Report vulnerabilities in the guardrails tooling privately via **GitHub Security Advisories**
on this repository, or to `appsec@acme.example`. Do not open a public issue.

- Acknowledgement within 2 business days, triage within 5.
- A compromised guardrail is treated as a supply-chain incident: consumers pin
  this repository by commit SHA, so fixes ship as a new release and Dependabot PRs.

Requests to weaken a hard floor are not security reports. Raise a governance
exception instead (see `docs/team-overrides.md`).
