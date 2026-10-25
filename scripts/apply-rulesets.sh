#!/usr/bin/env bash
# Apply the guardrails branch ruleset to one repository (idempotent: creates or updates by name).
#
#   scripts/apply-rulesets.sh acme-org/playwright-web-api-framework [--dry-run]
#
# Requires the GitHub CLI authenticated as a repository admin.
set -euo pipefail

repo="${1:?usage: apply-rulesets.sh <owner/repo> [--dry-run]}"
dry_run="${2:-}"
ruleset="$(dirname "$0")/../governance/rulesets/default-branch.json"
name="$(jq -r .name "$ruleset")"

existing_id="$(gh api "repos/$repo/rulesets" --paginate --jq ".[] | select(.name == \"$name\") | .id" || true)"

if [ "$dry_run" = "--dry-run" ]; then
  echo "Would ${existing_id:+update ruleset $existing_id}${existing_id:-create ruleset} \"$name\" on $repo:"
  jq . "$ruleset"
  exit 0
fi

if [ -n "$existing_id" ]; then
  gh api --method PUT "repos/$repo/rulesets/$existing_id" --input "$ruleset" --jq '"updated ruleset \(.id) \(.name)"'
else
  gh api --method POST "repos/$repo/rulesets" --input "$ruleset" --jq '"created ruleset \(.id) \(.name)"'
fi
