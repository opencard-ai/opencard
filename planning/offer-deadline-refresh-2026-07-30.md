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

6. 2026-08-20 post-deadline watch (follow-up)
   - Owner: Kacey
   - Status: completed
   - Priority: high
   - Deliverable: Verify Hyatt 75K expiry, IHG 185K→140K, August business offers (CSR Biz, Ink Unlimited, Ink Cash).
   - Acceptance: Each card verified against issuer source; production + adaptor refreshed where the source confirms a change.
   - Result:
     - **Chase Hyatt (chase-hyatt.json)**: Chase issuer page still shows 75K on the last day of the offer (expires 2026-08-20). Updated last_verified to 2026-08-20, refreshed notes to flag the 60K standard public offer expected to replace 75K on 2026-08-21, pushed next_review to 2026-08-21. No downgrade yet — the issuer source still shows 75K on the last day.
     - **Chase IHG Premier (chase-ihg-premier.json)**: Chase issuer page now shows 140K / $3K / 3mo standard public offer; the prior 185K tiered elevated offer has expired. Downgraded production + adaptor from 185K to 140K, updated estimated_value to 700, removed is_elevated / normal_bonus_points, updated last_verified to 2026-08-20.
     - **Chase Sapphire Reserve for Business (chase-sapphire-reserve-biz.json)**: Chase official page still shows 200K / $30K / 6mo. No change — offer continues in August with no extension announcement.
     - **Chase Ink Business Unlimited (chase-ink-biz-unlimited.json)**: Chase official page still shows $1,000 cash back / $8K / 4mo. No change — offer continues without clear deadline.
     - **Chase Ink Business Cash (chase-ink-biz-cash.json)**: Chase official page still shows $1,000 cash back / $8K / 4mo. No change — offer continues without clear deadline.

## Progress Log

- 2026-07-30 15:06 PT: KC approved executing recommended next steps from offer watcher.
- 2026-07-30 15:07 PT: Checked current data. Existing repo had unrelated dirty changes; this task will stage only files owned by this refresh.
- 2026-07-30 15:08 PT: External checks found CSP 100k ended, Chase official HTML currently shows 75k; Hilton official page shows Aspire 150k and Surpass 130k.
- 2026-07-30 15:09 PT: Updated production/adaptor JSON for CSP, Aspire, and Surpass; scheduled 8/20 follow-up cron for Hyatt + August business offer watch.
- 2026-07-30 15:10 PT: `npm run validate` passed locally; pushed commit `d679075e`; GitHub Validate Card Data and Secret Scan both passed.
- 2026-08-20 09:02 PT: Follow-up cron triggered. Verified each of the 5 named cards against issuer sources. Chase Hyatt page still shows 75K on the last day (source unchanged → keep 75K, refresh last_verified + notes + next_review). Chase IHG Premier page reverted to 140K baseline (downgraded 185K → 140K in both production and adaptor). CSR Biz 200K, Ink Unlimited $1K, Ink Cash $1K all still current — no changes.
