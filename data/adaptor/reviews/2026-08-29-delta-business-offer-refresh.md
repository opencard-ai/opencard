# Delta Business Welcome Offer Review — 2026-08-29

## Scope

Verify the public welcome offers for the Delta SkyMiles Gold, Platinum, and Reserve Business American Express Cards and determine whether OpenCard production data should change.

## Decision

- **Gold Business:** approve 90,000 miles after $6,000 in six months; expires 2026-11-04.
- **Platinum Business:** approve 100,000 miles after $8,000 in six months; expires 2026-11-04.
- **Reserve Business:** approve 200,000 miles after $20,000 in six months; expires 2026-11-04.
- Classification: public limited-time offers, not targeted/YMMV.
- Confidence: high. Delta's issuer-controlled comparison page displays all three amounts; its indexed offer text supplies the spend thresholds and expiry. Amex's indexed Reserve Business page and CNBC Select independently corroborate the Reserve terms.

## Adaptor Coverage Audit

All three production cards already have adaptor configs and approved historical runs in `data/adaptor/adaptor-config-proposal.json`. There is no missing-adaptor gap for these cards. The actual gap was stale production and adaptor candidate values dating from the post-2026-07-15 rollback.

## Evidence

1. Delta official business-card comparison page, accessed 2026-08-29: 90K Gold, 100K Platinum, and 200K Reserve; indexed offer text states $6K/$8K/$20K in six months and a 2026-11-04 end date.
   - https://www.delta.com/us/en/skymiles/airline-credit-cards/american-express-business-cards
2. American Express official Reserve Business page, indexed 2026-08-29: 200K after $20K in six months; ends 2026-11-04.
   - https://www.americanexpress.com/en-us/business/credit-cards/delta-skymiles-reserve/
3. CNBC Select, accessed 2026-08-29: independently reports the same three business-card offer terms and expiry.
   - https://www.cnbc.com/select/massive-new-200000-mile-delta-credit-card-welcome-offers/

## Production Action

Update all three card JSON welcome-offer blocks and synchronize their adaptor candidates. Add `expires_at`, set `offer_status` to `public_limited_time`, set `is_elevated` to true, and stamp `last_verified` as 2026-08-29.

## Open Question

Recheck all three offers on or after 2026-11-05 and roll back to the then-current issuer-confirmed public offers.
