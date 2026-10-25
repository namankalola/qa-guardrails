# Team overrides

Put only the values that differ from [`defaults.yml`](../packages/guardrails/defaults.yml) in
`guardrails.config.yml` at the repo root. CI validates the file on every PR, and so does
`npx acme-guardrails validate` locally.

## What teams can change

| Setting                                                           | Default                                                 | Allowed range                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `codeQuality.maxWarnings`                                         | 0                                                       | 0–50                                                      |
| `codeQuality.maxComplexity`                                       | 15                                                      | 10–25                                                     |
| `codeQuality.typeSafety`                                          | strict                                                  | strict, standard (unsafe-any rules become warnings)       |
| `codeQuality.formatCheck` / `conventionalCommits`                 | true                                                    | boolean                                                   |
| `framework.enforcePom`                                            | true                                                    | boolean                                                   |
| `framework.appsDir` / `coreDir` / `specGlobs` / `pageObjectGlobs` | `src/apps`, `src/core`, `**/*.spec.ts`, `**/*.page.ts`  | paths                                                     |
| `testQuality.allowedTags`                                         | smoke, regression, sanity, api, e2e, visual, quarantine | `@tag` list                                               |
| `testQuality.assertFunctionPatterns`                              | `^expect`, `^assert[A-Z]`, `^verify[A-Z]`               | regex list                                                |
| `testQuality.maxRetries`                                          | 2                                                       | 0–2                                                       |
| `testQuality.flakeRateBudgetPct`                                  | 2                                                       | 0–10                                                      |
| `testQuality.quarantine.maxDays` / `maxPct`                       | 30 / 5                                                  | 1–60 / 0–10                                               |
| `security.vulnerabilities.failOn`                                 | high                                                    | critical, high, moderate, low                             |
| `security.vulnerabilities.ignore[]`                               | –                                                       | id + reason + expiry ≤ 90 days; **critical never**        |
| `security.licenses.additionalAllow[]` / `exceptions[]`            | –                                                       | no copyleft/source-available licences                     |
| `security.sast.semgrep` / `codeql` / `failOn`                     | true / false / error                                    |                                                           |
| `security.dast.*`                                                 | disabled                                                | target must be in `authorizedHosts`                       |
| `security.container.*`                                            | disabled                                                | `failOn`: critical, high, medium (critical always blocks) |
| `supplyChain.pinnedActions`                                       | warn                                                    | warn, block                                               |

## What teams cannot change (hard floors)

`codeQuality.typecheck`, `codeQuality.lintErrors`, `security.secretScanning`,
`security.vulnerabilities.blockCritical` and `security.licenses.allow` (owned by Legal).
Ruleset review rules sit outside the file. To request a floor exception, open an issue in
this repo with the `governance-exception` label. AppSec and the QA platform lead must both
approve it, and it must have an expiry date.

## Examples

```yaml
# Legacy repo: tolerate some warnings while paying down debt, block on high CVEs only
version: 1
team: payments-qa
codeQuality:
  maxWarnings: 25
  typeSafety: standard
security:
  vulnerabilities:
    ignore:
      - id: GHSA-xxxx-xxxx-xxxx
        reason: dev-only transitive of exceljs; no fixed release yet (PAY-881)
        expires: 2026-12-15
```
