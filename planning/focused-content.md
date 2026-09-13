# Focused English decision support — 2026-09-13

Owner: Kacey / news_efficiency content subtask
Status: implemented; release and rendered-page verification owned by main
Priority: P1
Deliverable: targeted additions to existing `lib/card-editorial.ts`, no schema or indexing expansion
Acceptance: three retained English card pages explain a concrete renewal decision, state assumptions, identify poor-fit users, and link to existing alternative card pages through the established renderer.
Dependencies: parent release checks; issuer-data reconciliation noted below is separate and not represented as completed.

## Selected pages and changes

- `/en/cards/chase-sapphire-preferred`: compare incremental rewards against a no-fee alternative. Explicit hypothetical $6,000 × 1% = $60 plus $50 of genuine booking savings = $110 before the displayed annual fee. A no-booking case values the credit at zero. Avoid debt and reward-driven overspending.
- `/en/cards/chase-sapphire-reserve`: evaluate the fee difference versus Preferred, not the headline sum of credits. Four hypothetical lounge visits replacing $20 meals = $80, or zero when reimbursed/overlapping. Unused restricted credits count as zero.
- `/en/cards/capital-one-venture-x`: show portal opportunity cost: $350 portal price minus a hypothetical eligible $300 credit = $50 paid, compared with $300 direct, yielding $250 savings. Multi-year credits are not annual credits; unknown benefits cannot be used to rescue a losing scenario.

## Existing evidence and boundaries

All three IDs remain in `lib/indexable-cards.ts`. `app/[lang]/cards/[card_id]/page.tsx` renders English editorial take, bestFor, notFor, breakEven, and alternatives without Markdown/link parsing inside prose. Its existing worksheet renders the annual fee from the card record. Consequently these additions refer to the displayed fee rather than duplicating fee facts in editorial copy.

Local records inspected (not externally reverified): annual fees Preferred $95, Reserve $795, Venture X $395; Venture X recurring portal credit $300 annually and application-fee credit on a four-year reset. These are inspection notes, not a new verification claim. The worked examples explicitly mark user assumptions and do not change production terms or welcome offers.

Venture X's preexisting editorial asserted flat earning, while the local card record lists Other at 1x and Dining at 2x. Removed the unsupported flat-earning assertion in this selected page. Do not infer which source is correct: a separate official-source check is required before correcting the card JSON. No `data/cards` edits made.

## Tool connections and measurement

The current editorial schema supports card-page alternative links only, not compare/My Cards tool URLs. Preserve that contract; do not insert raw URLs as if they were clickable links. Parent's shared card-page action row owns the compare/My Cards CTA connection. These pages give that existing flow a concrete task: compare fee differences, then track actual credit use for a renewal decision.

Measure card view → compare started → compare viewed; card saved → first benefit use. Official outbound clicks are not approved applications. Judge impact after real traffic accumulates; no conversion improvement claimed from this edit alone.

## Progress log

- Inspected retained IDs, editorial schema/rendering, and selected local card records.
- Added three conservative decision scenarios and sharpened poor-fit criteria; kept indexing, locales, schema, and card JSON unchanged.
- Static verification checks selected entries, retention, internal alternative IDs, and arithmetic; full type/build/render verification belongs to parent release.
