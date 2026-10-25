#!/usr/bin/env bash
# Dev helper: pack every package and install the tarballs into a consumer repo
# without touching its package.json / lockfile (for trying unreleased changes).
#
#   scripts/link-local.sh ../playwright-web-api-framework
set -euo pipefail
consumer="${1:?usage: link-local.sh <consumer-repo-dir>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$root/dist" && mkdir -p "$root/dist"
for pkg in "$root"/packages/*/; do (cd "$pkg" && pnpm pack --pack-destination "$root/dist" >/dev/null); done
(cd "$consumer" && npm install --no-save --no-audit --no-fund "$root"/dist/*.tgz)
