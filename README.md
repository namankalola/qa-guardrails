# qa-guardrails

Central, versioned guardrails for every AriseQA Playwright + TypeScript repository. One
policy and one pipeline cover all five guardrail areas. Teams tune values within
bounds, and nobody can switch off the hard floors.

| #   | Guardrail                   | Enforced by                                                                                                                                                                                                             |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Code quality**            | `@namankalola/eslint-config` (typescript-eslint type-checked rules, complexity), `tsc --noEmit`, Prettier, commitlint                                                                                                   |
| 2   | **Automation framework**    | `ariseqa` ESLint plugin: no raw `page`/locators in specs, private readonly locators, WebActions-only interactions, app isolation, fixtures-only imports                                                                 |
| 3   | **Automated test quality**  | Playwright lint rules (no hard waits, no `.only`, assertions required), required tags, `withGuardrails()` (retry cap, forbidOnly, quarantine exclusion), quarantine + flake-rate gates                                  |
| 4   | **Security & dependencies** | gitleaks (floor), Semgrep enterprise rules, optional CodeQL, npm/pnpm audit gate (critical = floor), licence gate, OSV, CycloneDX SBOM, ZAP baseline (opt-in, authorised hosts only), Hadolint + Trivy for images       |
| 5   | **CI/CD & pull requests**   | Reusable `workflow_call` pipeline with one required check (`guardrails / gate`), branch rulesets as code, CODEOWNERS, PR template, SHA-pinned actions, Dependabot, OpenSSF Scorecard, cosign signing + build provenance |

## Layout

```
packages/
  guardrails/             @namankalola/guardrails            policy engine + CLI gates (validate, audit, licenses, quarantine, flakes, pinned-actions, dast-target)
  eslint-config/          @namankalola/eslint-config         flat config + ariseqa plugin + floor config
  playwright-guardrails/  @namankalola/playwright-guardrails withGuardrails() + quarantine()
  tsconfig/               @namankalola/tsconfig              base.json / strictest.json
  prettier-config/        @namankalola/prettier-config
  commitlint-config/      @namankalola/commitlint-config
.github/
  workflows/guardrails.yml          reusable PR/push pipeline (the gate)
  workflows/dast.yml                reusable ZAP baseline
  workflows/container.yml           reusable image lint/build/scan/sign/attest
  workflows/required-guardrails.yml org-level required workflow
  actions/setup-project             lockfile-detecting install (npm/pnpm/yarn)
  actions/setup-guardrails          installs the central tooling from this repo
security/                 semgrep rules, gitleaks base config, hadolint, ZAP rules
governance/rulesets/      branch + org rulesets as code
templates/consumer/       files a team copies when onboarding
docker/playwright-runner/ hardened non-root runner image template
docs/                     architecture, controls matrix, overrides, rollout runbook, ADRs
```

## Onboarding a repository (about 30 minutes)

1. Copy `templates/consumer/` into the repo. Adjust `test-command` in
   `.github/workflows/guardrails.yml` and `team` in `guardrails.config.yml`.
2. `npm i -D @namankalola/eslint-config @namankalola/playwright-guardrails @namankalola/commitlint-config eslint@^10 husky lint-staged @commitlint/cli`
3. Replace the legacy `.eslintrc*` with the template `eslint.config.mjs`, and wrap the Playwright config:
   `export default withGuardrails(defineConfig({...}), { name: 'my-app' })`.
4. `npx eslint . --fix`, then fix what remains. `npm run typecheck`.
5. Apply the ruleset: `scripts/apply-rulesets.sh ariseqa/<repo>`.

Details: [docs/rollout-runbook.md](docs/rollout-runbook.md). The first consumer was
`playwright-web-api-framework`; see its `chore/qa-guardrails-onboarding` branch.

## Developing the guardrails

```bash
corepack enable && pnpm install
pnpm test          # policy, gates, ESLint rules, withGuardrails
pnpm lint && pnpm format:check
scripts/link-local.sh ../some-consumer   # try unreleased packages in a consumer without touching its lockfile
```

Releases: tag `vX.Y.Z` (all packages share one version). `release.yml` publishes to GitHub
Packages, attests build provenance and moves the floating `v1` tag.
