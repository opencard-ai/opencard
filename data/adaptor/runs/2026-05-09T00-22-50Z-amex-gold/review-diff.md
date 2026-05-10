# amex-gold POC Review Diff

- OK: `annual_fee` existing=`325` candidate=`325`
- OK: `welcome_offer.bonus_points` existing=`100000` candidate=`100000`
- OK: `welcome_offer.spending_requirement` existing=`8000` candidate=`8000`
- OK: `welcome_offer.time_period_months` existing=`6` candidate=`6`
- OK: `welcome_bonus.amount` existing=`100000` candidate=`100000`

## Existing data issues detected
- BLOCK/REVIEW: Existing `travel_benefits.lounge_access` has Centurion/Priority Pass, but official Gold page snapshot did not show lounge access.
- BLOCK/REVIEW: Existing `travel_benefits.hotel_status` has Marriott/Hilton Gold, but official Gold page snapshot did not show hotel elite status.
- BLOCK/REVIEW: Conflicting FHR/THC flags: `fhr_thc`={'fhr_eligible': False, 'thc_eligible': True}, `hotel_program` FHR/THC=True/False.
- BLOCK/REVIEW: Missing official earning category: 5X Prepaid Hotels.
- BLOCK/REVIEW: Missing official earning category: 2X Prepaid Car Rentals and Cruises.

## Verdict
`needs_review` — core annual fee and public as-high-as 100k offer are supported by issuer, DoC, and USCCG, but current `data/cards/amex-gold.json` contains likely stale/incorrect travel benefits and conflicting THC/FHR fields. Do not auto-apply without cleanup decision.
