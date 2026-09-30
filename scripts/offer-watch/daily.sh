#!/bin/bash
# Cron entry point for the offer-watch daily loop. Prints only the summary (or NO_REPLY); details in
# artifacts/offer-watch/daily-<PT date>.log. Exit 1 if a step failed.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_NO_WARNINGS=1
cd "$(dirname "$0")/../.." || exit 1
exec npx tsx scripts/offer-watch/daily.ts "$@"
