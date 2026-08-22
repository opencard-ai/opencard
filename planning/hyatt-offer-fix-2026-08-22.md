# Hyatt offer validation fix — 2026-08-22

- Owner: Kacey
- Priority: High
- Status: Completed
- Deliverable: Refresh Hyatt personal/business welcome offers in production card data and card-adaptor configs.
- Acceptance criteria:
  - Chase official pages support all updated offer values.
  - `npm run validate` passes.
  - Only the four Hyatt data/config files and this dashboard are changed by this task.

## Progress log

- 2026-08-22: Confirmed Chase personal card is now up to 60,000 points (30,000 after $3,000/3 months plus up to 30,000 via 2x on up to $15,000/6 months).
- 2026-08-22: Confirmed Chase business card still shows 70,000 points after $7,000/3 months and no current August 20 expiry notice on the Chase card listing.
- 2026-08-22: Updated both production card files and both card-adaptor configs; `npm run validate` passed with all 224 cards valid.
