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

---

# Task Dashboard — Pending Queue Cleanup + Confirmed Drift Refresh

- Owner: Kacey
- Status: completed
- Priority: high
- Scope: Clear stale pending card artifacts and refresh only the 4 watcher-confirmed issuer drift cards.

## Tasks

1. Clear pending card artifacts
   - Status: completed
   - Deliverable: reject all pending artifacts instead of applying them directly.
   - Acceptance: `artifacts/card-updates/pending-index.md` reports `total: 0`.

2. Refresh `chase-ihg-premier`
   - Status: completed
   - Deliverable: production + adaptor candidate updated to 150,000 / $3,000 / 3 months.
   - Acceptance: prior 185k tiered candidate marked stale.

3. Refresh `ihg-one-rewards-traveler`
   - Status: completed
   - Deliverable: production + adaptor candidate updated to 90,000 / $2,000 / 3 months.
   - Acceptance: prior 125k tiered candidate marked stale.

4. Refresh `chase-southwest-priority`
   - Status: completed
   - Deliverable: production + adaptor candidate updated to 80,000 / $1,000 / 3 months.
   - Acceptance: prior 90k candidate marked stale.

5. Refresh `southwest-rapid-rewards-premier`
   - Status: completed
   - Deliverable: production + adaptor candidate updated to 80,000 / $1,000 / 3 months.
   - Acceptance: prior 85k candidate marked stale.

6. Amex as-high-as handling
   - Status: completed
   - Deliverable: no production auto-apply for Amex personalized/as-high-as offers.
   - Acceptance: Amex artifacts rejected/closed; metadata-only stance preserved.

## Progress Log

- 2026-06-21: Rejected all 14 pending artifacts; pending queue now reports `total: 0`.
- 2026-06-21: Updated the 4 watcher-confirmed drift cards in both production card JSON and adaptor config candidates.
- 2026-06-21: Re-ran the 4 refreshed adaptors; all returned `qa_verdict: pass` and `recommendation: close_no_production_delta`.
- 2026-06-21: Rejected the 4 post-refresh verification artifacts; pending queue returned to `total: 0`; `npm run validate` passed.

---

# Task Dashboard — 2026-07-21 Offer Watch Follow-up

- Owner: Kacey
- Status: completed
- Priority: high
- Scope: Execute the July 21 offer-watch follow-up by adding missing adaptor coverage for the current public baseline offers, while keeping live-checked stale suggestions out of production.

## Tasks

1. Add missing adaptor coverage
   - Status: completed
   - Deliverable: adaptor configs for Chase Freedom Unlimited, Amex Blue Cash Everyday, and BoA Atmos Rewards Ascent.
   - Acceptance: each config has issuer sources, candidate offer data, citations, and a clear adaptor-only caveat.

2. Keep current live baselines honest
   - Status: completed
   - Deliverable: preserve the live-checked current offers in adaptor metadata without applying stale 100k United Quest guidance.
   - Acceptance: United Quest remains at the current verified 70k baseline unless a fresh issuer snapshot says otherwise.

3. Validate the new configs
   - Status: completed
   - Deliverable: `npm run validate` passes after the new adaptor files land.
   - Acceptance: no schema or guard errors for the added configs.

## Progress Log

- 2026-07-21: Live-checked current offers before editing: Chase Freedom Unlimited = $200 / $500 / 3mo, BCE = as-high-as $200 / $2,000 / 6mo, BoA Atmos Ascent = 70k + $99 companion fare / $2,500 / 90d.
- 2026-07-21: Confirmed the earlier 100k United Quest note is stale against the live Chase page, so it was not promoted.
- 2026-07-21: Added adaptor configs for Chase Freedom Unlimited, Amex Blue Cash Everyday, and BoA Atmos Ascent; `npm run validate` passed.

## 2026-07-27 — GSC 404 SEO redirect cleanup

- Owner: Kacey
- Status: in_progress
- Priority: P1 SEO hygiene
- Deliverable: Add 301 redirects for high-value legacy OpenCard card slugs that currently 404.
- Acceptance criteria:
  - `next.config.ts` includes canonical redirect mappings for known old card slugs.
  - Existing unrelated worktree changes are untouched.
  - Local static validation passes.
  - Representative redirect targets resolve to current card pages.
- Dependencies:
  - Full Search Console URL list is blocked by current Google account permission; proceed with sitemap/history-derived candidates.

### Progress Log
- 2026-07-27 18:52 PT — Confirmed sitemap has 951 URLs all returning 200; robots allows crawling; GSC URL list blocked by property permission.
- 2026-07-27 18:58 PT — Added 30 legacy card slug mappings in `next.config.ts`, generating locale-prefixed and bare card redirects.
- 2026-07-27 18:59 PT — Verified all redirect targets exist in `data/cards`; `npm run validate`, `npx tsc --noEmit --pretty false`, and `npm run build` passed.
- 2026-07-27 19:00 PT — Started local production server and curl-tested representative redirects; all returned permanent redirect to expected canonical card pages.
- 2026-07-27 19:00 PT — Status: completed locally; pending deploy/commit decision if KC wants this shipped immediately.
