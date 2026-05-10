# AMEX Welcome Offer Backfill — Scrapling POC

Run date: 2026-05-07 PDT / 2026-05-08 UTC

## Method
- Used Scrapling `0.4.7` from GitHub in isolated venv: `/tmp/scrapling-poc`.
- Extracted Doctor of Credit best-current signup bonus page with `--ai-targeted`.
- Extracted US Credit Card Guide AMEX card pages with `--ai-targeted`.
- Cross-checked high-risk/current public values with issuer/search snippets where available.

## Result
- AMEX cards in database: 32
- AMEX cards missing `welcome_offer.spending_requirement` or `time_period_months` before: 11
- Remaining AMEX missing spend/period after backfill: 0
- Files updated: 17
- Validation: `npm run validate` ✅

## Updated cards

### Filled missing welcome terms
- `amex-amazon-biz-prime`: $125 Amazon gift card upon approval.
- `amex-amazon-biz`: $100 Amazon gift card upon approval.
- `amex-blue-biz-plus`: 15,000 MR after $3,000 / 3 months.
- `amex-delta-blue`: 10,000 Delta miles after $500 / 3 months.
- `amex-everyday`: historical 10,000 MR after $1,000 / 3 months; USCCG says new applications may be unavailable.
- `amex-gold`: as-high-as 100,000 MR after $8,000 / 6 months; offer varies.
- `amex-graphite-biz`: public $1,500 after $50,000 / 6 months; YMMV/incognito up to $2,000 noted.
- `amex-hilton-honors`: 80,000 Hilton points after $2,000 / 6 months.
- `amex-morgan-stanley-blue`: $250 statement credit after $3,000 / 6 months.
- `amex-morgan-stanley-platinum`: 150,000 MR after $12,000 / 6 months; USCCG says through 2026-07-08.

### Corrected stale/high-risk existing values
- `amex-platinum`: spend requirement corrected to $8,000 / 6 months for as-high-as 175,000 MR.
- `amex-biz-gold`: updated to as-high-as 200,000 MR after $15,000 / 3 months.
- `amex-biz-platinum`: production offer normalized to public/current 200,000 MR after $20,000 / 3 months; targeted 250k–300k retained in description.
- `amex-marriott-brilliant`: corrected to 200,000 Marriott points after $6,000 / 6 months.
- `amex-marriott-bevy`: corrected to 175,000 Marriott points after $5,000 / 6 months.
- `amex-blue-cash-everyday`: corrected to $250 after $2,000 / 6 months.
- `amex-blue-cash-preferred`: kept up-to-$300 / $3,000 / 6 months with note that non-referral public can be $250.

## Source notes
- Doctor of Credit works best for current/elevated offer discovery.
- US Credit Card Guide works best for per-card structured extraction and historical notes.
- Issuer pages/search snippets should remain canonical for exact spend/period when third-party pages conflict.

## Follow-up items
- `amex-green` still has legacy `welcome_bonus.amount = 60000` while canonical `welcome_offer.bonus_points = 40000`; not touched in this POC because it was outside the missing-field set and needs current-source review.
- Consider adding a normalized `offer_variant` field later: `public`, `as_high_as`, `targeted`, `incognito`, `expired/historical`.
