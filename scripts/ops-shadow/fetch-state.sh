#!/usr/bin/env bash
# Read-only load of a pinned ops-state commit for the shadow-with-state workflow (offer|audit).
# Anonymous fetch of one public commit -> git archive into runner temp -> MANIFEST.json verified -> copy to work dirs.
# Disables pushing for this checkout and records the remote ops-state head to detect concurrent movement.
set -euo pipefail
TODAY="$(TZ=America/Los_Angeles date +%F)"
part="${1:?offer|audit}"
sha="${OPS_STATE_SHA_INPUT:-$OPS_STATE_PINNED_SHA}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "ops-state sha must be 40 hex chars" >&2; exit 2; }
if git config --get-regexp '^http\..*\.extraheader' >/dev/null; then echo "credentials are persisted in git config; refusing" >&2; exit 1; fi
git remote set-url --push origin "no-push://ops-shadow-is-read-only"
git ls-remote origin refs/heads/ops-state | cut -f1 > "$RUNNER_TEMP/ops-state-head-before"
git fetch --no-tags --depth=1 origin "$sha"
git fetch --no-tags origin +refs/heads/ops-state:refs/remotes/origin/ops-state
if ! git merge-base --is-ancestor "$sha" origin/ops-state; then
  echo "ops-state sha is not an ancestor of origin/ops-state" >&2
  exit 2
fi
git cat-file -e "$sha^{commit}"
rm -rf "$RUNNER_TEMP/ops-state" && mkdir -p "$RUNNER_TEMP/ops-state" "$RUNNER_TEMP/out/state-after"
git archive "$sha" | tar -x -C "$RUNNER_TEMP/ops-state"
if [ "$part" = offer ]; then
  npx tsx scripts/ops-shadow/load-state.ts --src "$RUNNER_TEMP/ops-state" --today "$TODAY" --offer-out "$RUNNER_TEMP/offer-state"
  cp -r "$RUNNER_TEMP/offer-state" "$RUNNER_TEMP/offer-state-before"
else
  npx tsx scripts/ops-shadow/load-state.ts --src "$RUNNER_TEMP/ops-state" --today "$TODAY" --audit-out "$RUNNER_TEMP/audit"
fi
cp "$RUNNER_TEMP/ops-state/MANIFEST.json" "$RUNNER_TEMP/out/ops-state-MANIFEST.json"
{ echo "sha=$sha"; echo "today=$TODAY"; } >> "$GITHUB_OUTPUT"
