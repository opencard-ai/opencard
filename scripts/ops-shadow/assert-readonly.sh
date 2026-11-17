#!/usr/bin/env bash
# Shadow-with-state guard: the job wrote nothing outside runner temp and pushed nothing.
set -euo pipefail
git diff --exit-code -- data/cards artifacts/audit
test -z "$(git status --porcelain)"
for f in ledger.json history.jsonl daily-state.json; do test ! -e "artifacts/offer-watch/$f"; done
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
if git config --get-regexp '^http\..*\.extraheader' >/dev/null; then echo "credentials appeared in git config" >&2; exit 1; fi
if [ -f "$RUNNER_TEMP/ops-state-head-before" ]; then
  if [ "$(git ls-remote origin refs/heads/ops-state | cut -f1)" != "$(cat "$RUNNER_TEMP/ops-state-head-before")" ]; then
    echo "::notice ::ops-state head moved during the run (another writer may have updated it)"
  fi
fi
echo "read-only assertions passed"
