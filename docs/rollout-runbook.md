# Rollout runbook

## Phase 0: platform setup (QA platform + AppSec, about 1 day)

1. Create `ariseqa/qa-guardrails` (internal or public; it contains no secrets) and push.
2. Create the `release` environment with required reviewers `@ariseqa/qa-platform`.
3. Settings → Actions → _Access_: allow other org repos to use workflows from this repo.
   If the repo is private, create a GitHub App with `contents:read` on it and give consumers its
   token as the `guardrails-token` secret.
4. Tag `v1.0.0`. `release.yml` publishes `@ariseqa/*` to GitHub Packages and creates the `v1` tag.
5. Create the custom repository property `guardrails` (values: `enforced`, `onboarding`).

## Phase 1: pilot, warn mode (2 weeks, 1–2 repos)

- Onboard the pilot repos ([README → Onboarding](../README.md#onboarding-a-repository-about-30-minutes)).
- Apply `governance/rulesets/default-branch.json`, but leave `guardrails / gate` out of the
  required checks for now (edit a copy, or set `"enforcement": "evaluate"` on GitHub Enterprise).
- Track: gate pass rate, median gate duration (target ≤ 10 min without tests), false positives per rule.
- Tune the defaults and cut `v1.1.0`.

## Phase 2: enforce on pilots, onboard by wave (4–6 weeks)

- Pilots: ruleset fully active, with `guardrails / gate` required.
- Waves of 5–10 repos. Each repo gets one onboarding PR, ideally made with `scripts/link-local.sh` before publishing.
- Legacy repos start with `maxWarnings` > 0 and `typeSafety: standard`, plus a dated plan to tighten.

## Phase 3: org enforcement

- Set the `guardrails=enforced` property on onboarded repos.
- Activate `governance/rulesets/org-required-workflow.json` at org level. Fill in the
  `repository_id` of this repo (`gh api repos/ariseqa/qa-guardrails --jq .id`).
- Flip `supplyChain.pinnedActions` default to `block` in the next minor release.

## Operating

| Event                                | Action                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| New guardrail rule                   | Ship as `warn` (or behind a policy flag) in a minor release, then promote to error in the next                    |
| Breaking default change              | Major version (`v2`); consumers move with Dependabot plus release notes                                           |
| False positive                       | Fix the rule centrally. Teams add a narrow, reviewed exception meanwhile (never `eslint-disable` for floor rules) |
| Critical advisory with no fix        | Not ignorable. Remove or replace the dependency, or raise a governance exception (AppSec)                         |
| Guardrails incident (broken release) | Consumers are SHA-pinned, so revert the `v1` tag to the last good release and publish a patch                     |

## KPIs for leadership

- % of repos onboarded / enforced
- Gate pass rate on first push; median and p95 gate duration
- Flake rate trend; number and age of quarantined tests
- Open high/critical advisories, and mean time to remediate
- Exceptions open past their expiry (target: 0)
