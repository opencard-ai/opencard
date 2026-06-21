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

---

# Task Dashboard — High-Priority Card Adaptor Expansion

- Owner: Kacey
- Status: in_progress
- Priority: high
- Scope: Execute KC-approved next steps from offer watcher review: keep CSR personal at 100k, add missing high-priority adaptor coverage, and defer lower-priority issuers.

## Tasks

1. CSR personal cleanup
   - Status: completed
   - Deliverable: production + adaptor candidate at 100k / $6k / 3mo, with prior 150k offer marked ended 2026-06-15.
   - Acceptance: future adaptor runs should no longer propose stale 150k as current.

2. Delta Platinum personal adaptor
   - Status: completed
   - Deliverable: confirm `amex-delta-platinum` adaptor exists.
   - Acceptance: no duplicate config; existing 100k / $6k / 6mo through 2026-07-15 remains tracked.

3. Hilton deadline adaptors
   - Status: completed
   - Deliverable: add `amex-hilton-honors-aspire` and `amex-hilton-honors-biz` adaptor configs.
   - Acceptance: both include issuer sources and 2026-07-29 deadline metadata.

4. Business high-priority adaptors
   - Status: completed
   - Deliverable: add `chase-sapphire-reserve-biz`, `amex-biz-platinum`, `capital-one-venture-x-biz`, `amex-biz-gold`, `chase-ink-biz-preferred` adaptor configs.
   - Acceptance: each has issuer source, candidate offer, citations, community/watch metadata.

5. CSR Business production update
   - Status: completed
   - Deliverable: update production `chase-sapphire-reserve-biz` from 150k / $5k / 3mo to verified 200k / $30k / 6mo.
   - Acceptance: external live check found Chase official `reservebusiness0626` offer page plus secondary corroboration.

6. Deferred issuer expansion
   - Status: completed
   - Deliverable: leave Wells Fargo, Bank of America, British Airways, Alaska, JetBlue, Aer Lingus, Hawaiian untouched.
   - Acceptance: no files for these issuers/cards added in this batch.

## Progress Log

- 2026-06-21: Confirmed `amex-delta-platinum` adaptor already exists; no duplicate needed.
- 2026-06-21: Added Hilton Aspire / Hilton Business adaptor configs with 2026-07-29 expiry tracking.
- 2026-06-21: Added high-priority business adaptor configs for CSR Business, Amex Business Platinum, Venture X Business, Amex Business Gold, and Ink Business Preferred.
- 2026-06-21: Live search confirmed CSR Business 200k is supported by Chase official `reservebusiness0626` page; updated production card accordingly.
