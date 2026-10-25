# Architecture

## Principles

1. **One policy, many enforcement points.** `guardrails.config.yml` (team) is merged onto
   `packages/guardrails/defaults.yml` (enterprise), validated and bounds-checked. The same
   resolved policy drives local lint, pre-commit hooks, the Playwright config wrapper and every
   CI gate, so "works on my machine" and "passes CI" can't drift apart.
2. **Configurable within limits, floors are not configurable.** Teams tune thresholds (retries
   0–2, flake budget 0–10 %, warnings 0–50...). Floors (secrets, critical CVEs, zero lint/type
   errors, review rules) are literals in the schema, and an attempt to set them fails the
   `policy` job with a pointer to the exception process.
3. **Central tooling, pinned per consumer.** Consumers call the reusable workflow by commit SHA
   (Dependabot bumps it). The tools that gate a repo are installed from _this_ repo's lockfile,
   never from the team's dependency tree, so a team can't weaken a gate by pinning an old plugin.
4. **Defence in depth against bypass.** Lint runs twice: once with the team config, once with
   the enterprise floor config using `--no-inline-config`, so `eslint-disable` can't silence a
   floor rule. Rulesets require the single `guardrails / gate` check. The org-level required
   workflow still runs if a team deletes its caller.
5. **Fail closed.** An unknown audit severity counts as critical. A missing report fails the gate.
   A floor job that is skipped or cancelled fails the gate.

## Flow of a pull request

```
PR opened
  └─ guardrails.yml (caller, 20 lines)  ──uses──▶  acme-qa-guardrails/.github/workflows/guardrails.yml@<sha>
        policy ─────────────┬──────────────┬──────────────┬──────────────┬─────────────┐
        (validate + output) │              │              │              │             │
        secrets (FLOOR)   quality        tests        dependencies      sast       supply-chain
        gitleaks          tsc (FLOOR)    quarantine    audit (crit=FLOOR) semgrep    pinned actions
                          eslint team    playwright    licences          codeql*
                          eslint floor   flake budget  osv, sbom
                          prettier*, PR title*
                                                   └──────────────▶ gate (required check)
```

`*` = enabled by policy.

## Enforcement matrix

| Control                         | Local (pre-commit / IDE) | PR gate                       | Nightly / main                     | Floor?                                    |
| ------------------------------- | ------------------------ | ----------------------------- | ---------------------------------- | ----------------------------------------- |
| Type errors                     | IDE, `npm run typecheck` | `quality`                     |                                    | ✅                                        |
| Lint errors                     | lint-staged              | `quality` (team + floor pass) |                                    | ✅                                        |
| POM / layering rules            | lint-staged              | `quality`                     |                                    | team can disable (`framework.enforcePom`) |
| Conventional commits / PR title | commit-msg hook          | `quality`                     |                                    |                                           |
| Tags, assertions, hard waits    | lint-staged              | `quality`                     |                                    |                                           |
| Retry cap, forbidOnly           | `withGuardrails()`       | `tests`                       |                                    | cap ≤ 2                                   |
| Quarantine hygiene              |                          | `tests`                       | quarantine suite                   |                                           |
| Flake budget                    |                          | `tests`                       | trend artefact                     |                                           |
| Secrets                         | (optional gitleaks hook) | `secrets`                     |                                    | ✅                                        |
| Critical advisories             |                          | `dependencies`                |                                    | ✅                                        |
| High/moderate advisories        |                          | `dependencies`                |                                    | threshold configurable                    |
| Licences                        |                          | `dependencies`                |                                    | Legal-owned allow list                    |
| SAST                            |                          | `sast`, `codeql`              |                                    |                                           |
| Pinned actions                  |                          | `supply-chain`                | Scorecard                          | warn → block                              |
| DAST                            |                          |                               | `dast.yml` (authorised hosts only) |                                           |
| Image CVEs / Dockerfile         |                          |                               | `container.yml`                    | critical ✅                               |
| Signing / provenance            |                          |                               | `container.yml`, `release.yml`     |                                           |
| Review rules                    |                          | ruleset                       |                                    | ✅                                        |

## Why these tools (open source)

| Need              | Choice                                                               | Why not the alternative                                                                                  |
| ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Lint              | ESLint 10 flat config + typescript-eslint + eslint-plugin-playwright | eslint-plugin-sonarjs is LGPL-3.0 and our licence policy denies it, so core `complexity` is used instead |
| Secrets           | gitleaks binary (checksum-verified)                                  | gitleaks-action needs a paid licence for orgs                                                            |
| SAST              | Semgrep CE with org rules (+ CodeQL when GHAS exists)                | CodeQL alone needs GHAS for private repos                                                                |
| Dependencies      | npm/pnpm audit (GitHub advisory DB) as the gate, OSV as wider signal | dependency-review-action needs GHAS on private repos                                                     |
| SBOM / image scan | Trivy (CycloneDX)                                                    |                                                                                                          |
| DAST              | OWASP ZAP baseline (passive)                                         | an active scan needs a dedicated, owned environment                                                      |
| Signing           | Sigstore cosign keyless + GitHub build provenance                    | no key management                                                                                        |
