# Task Dashboard — Card Adaptor Source Drift Fix

- Owner: Kacey
- Status: completed
- Priority: high
- Scope: Fix CSR stale-candidate mechanism so run-all detects live source drift before closing as no production delta.

## Tasks

1. Detect issuer/source drift
   - Status: completed
   - Deliverable: `live-source-check.json` + QA warning/reason when candidate disagrees with current issuer snapshot.
   - Acceptance: CSR 150k→100k mismatch is flagged as source drift even when production still matches candidate.

2. Surface drift in review artifacts
   - Status: completed
   - Deliverable: review-report/apply-plan sections for source drift vs production drift.
   - Acceptance: report clearly separates "source drift" from "production drift".

3. Verify on CSR run
   - Status: completed
   - Deliverable: rerun/review of latest CSR artifact.
   - Acceptance: latest CSR report no longer looks like a clean `close_no_production_delta` when issuer text disagrees.

## Progress Log

- 2026-06-20: Identified mechanism gap: run-all only compares candidate vs production; it needs issuer/live snapshot verification first.
- 2026-06-20: Implemented issuer live-source check, surfaced drift in QA/apply-plan/review-report, and verified CSR now reports `source_drift_detected`.
- 2026-06-21: Applied minimal CSR production patch: welcome offer restored from 150,000 to 100,000 Ultimate Rewards points, spend/time unchanged at $6,000/3 months; `npm run validate` passed.
