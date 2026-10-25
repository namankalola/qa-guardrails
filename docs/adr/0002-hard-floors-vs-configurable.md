# ADR 0002: Hard floors plus bounded team configuration

**Status:** accepted · **Date:** 2026-10-25

## Context

Teams have different maturity (legacy suites versus greenfield). A single strict profile blocks
adoption, while a fully configurable one guarantees nothing.

## Decision

- A small set of **floors** that are literal in the schema and can't be overridden: zero type errors,
  zero lint errors, secret scanning, critical advisories, the Legal licence list, and review rules.
- Everything else is **bounded**: retries 0–2, flake budget ≤ 10 %, warnings ≤ 50, vulnerability
  ignores ≤ 90 days, quarantine ≤ 60 days and ≤ 10 % of the suite.
- Strict schema (unknown keys fail), so a typo can't silently disable a gate.
- Floor ESLint rules run in a second pass with `--no-inline-config`.

## Consequences

- Exceptions to floors go through governance, with an owner and an expiry.
- Teams can tighten past the defaults but can't drop below the floors.
