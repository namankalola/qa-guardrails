# ADR 0001: Central reusable workflows and shared packages, not copied templates

**Status:** accepted · **Date:** 2026-10-25

## Context

Guardrails copied into each repo drift within weeks, and nobody can prove they are still in
place. Pure org-level required workflows can't run repo-specific tests.

## Decision

- One reusable `workflow_call` pipeline in this repo. Consumers keep a ~20-line caller pinned by SHA.
- Shared config as versioned npm packages (`@acme/eslint-config`, `@acme/playwright-guardrails`, ...).
- The gating tools are installed from this repo's lockfile at the pinned ref, not from the consumer's dependencies.
- An org-level required workflow (rulesets) runs as a backstop if a caller is removed.

## Consequences

- One change rolls out everywhere through Dependabot. Rollback means re-pointing a tag.
- `guardrails-ref` must stay on the same release as the `uses:` SHA (reusable workflows can't
  discover their own ref). The release notes call this out.
- The packages must be published to GitHub Packages before consumers can `npm ci`.
