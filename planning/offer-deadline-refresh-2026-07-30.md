# Task Dashboard — Offer Deadline Refresh 2026-07-30

- Owner: Kacey
- Status: completed
- Priority: high
- Scope: Execute KC-approved post-deadline offer refresh for CSP / Hilton and schedule near-term offer watch follow-ups.

## Tasks

1. CSP post-deadline refresh
   - Owner: Kacey
   - Status: completed
   - Priority: high
   - Deliverable: `chase-sapphire-preferred` production + adaptor candidate updated from expired 100k limited-time offer.
   - Acceptance: official Chase page checked after deadline; card data no longer carries expired `expires=2026-07-30` current offer metadata.
   - Result: Chase official HTML showed 75,000 / $5,000 / 3mo on 2026-07-30, so updated to 75k public offer instead of estimated 60k fallback.

2. Hilton Aspire post-deadline refresh
   - Owner: Kacey
   - Status: completed
   - Priority: high
   - Deliverable: `amex-hilton-honors-aspire` production + adaptor candidate updated from expired 175k limited-time offer.
   - Acceptance: issuer source supports current non-elevated public offer; expired 7/29 fields removed.
   - Result: Hilton/Amex issuer sources support 150,000 / $6,000 / 6mo public offer.

3. Hilton Surpass post-deadline refresh
   - Owner: Kacey
   - Status: completed
   - Priority: high
   - Deliverable: `amex-hilton-surpass` production + adaptor candidate refreshed from expired 7/29 package.
   - Acceptance: issuer source supports current public offer; expired 7/29 fields removed.
   - Result: Hilton issuer page supports 130,000 / $3,000 / 6mo public offer; did not drop to 80k because live issuer source contradicted the expected fallback.

4. Near-term watchlist / reminders
   - Owner: Kacey
   - Status: completed
   - Priority: medium
   - Deliverable: reminder / follow-up for Hyatt 8/20 and August business-offer watch.
   - Acceptance: cron reminder exists with context and target output.
   - Result: Cron `0b04e0dd-9638-4e32-aaf8-1d14efeb3dda` scheduled for 2026-08-20 09:00 PT.

5. Validation and CI
   - Owner: Kacey
   - Status: completed
   - Priority: high
   - Deliverable: `npm run validate`, commit, push, GitHub Actions confirmation.
   - Acceptance: Validate Card Data and Secret Scan pass for the pushed commit.
   - Result: Commit `d679075e` passed Validate Card Data and Secret Scan.

## Progress Log

- 2026-07-30 15:06 PT: KC approved executing recommended next steps from offer watcher.
- 2026-07-30 15:07 PT: Checked current data. Existing repo had unrelated dirty changes; this task will stage only files owned by this refresh.
- 2026-07-30 15:08 PT: External checks found CSP 100k ended, Chase official HTML currently shows 75k; Hilton official page shows Aspire 150k and Surpass 130k.
- 2026-07-30 15:09 PT: Updated production/adaptor JSON for CSP, Aspire, and Surpass; scheduled 8/20 follow-up cron for Hyatt + August business offer watch.
- 2026-07-30 15:10 PT: `npm run validate` passed locally; pushed commit `d679075e`; GitHub Validate Card Data and Secret Scan both passed.
