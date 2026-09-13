# OpenCard core funnel measurement — 2026-09-13

## Delivered journeys

- Homepage: localized **find a new card** → `/find` → interactive shortlist of up to three cards → existing comparison page → card detail → issuer terms.
- Homepage: localized **use existing cards** → `/my-cards` → existing add-card flow → this-period credits/free-night records. Cloud-backed benefit recording still requires subscription; this change does not silently add local benefit persistence.
- The wizard previously rendered nonfunctional compare buttons; it now uses the existing CompareBar.
- News and guides follow core card tasks. Existing AI question chips and floating chat remain available.
- Issuer CTA uses an existing HTTPS source on an explicit major-issuer host allowlist; no URL is invented. Cards without matching sources omit the CTA. This is a terms/source visit, not guaranteed application access. Referral links stay separately labeled.

## Event definitions and denominators

- `journey_started`: homepage CTA click, `journey=new_card|existing_cards`, locale. Denominator: consenting homepage visitors; repeated clicks are not unique people.
- `selection_started`: wizard first answer (including reattempts). `recommendation_completed`: result screen reached, including zero results; `result_count` distinguishes usable output. Completion denominator: wizard starts in the same observation period; use matched sessions if supported, not a claim of account-level conversion.
- `recommendation_requested` / `recommendation_response_received`: chat request and nonempty response. Response is **not** proof that a recommendation was made; questions and follow-ups also count. Prompts, answers, credit profile and spend preferences are not transmitted.
- `comparison_card_selected`: add to comparison shortlist. `comparison_viewed`: a rendered valid comparison of at least two cards; card count and locale only. Denominator for progression: completed wizard sessions with results; users can also enter comparison directly from the catalogue, so aggregate counts alone cannot establish that conversion rate.
- `issuer_outbound_clicked`: explicit terms or referral link click, public product ID and link type only. Includes primary and middle-click; not context-menu opening, successful application, approval or revenue. Compare against card-detail visitors, not all pageviews.
- `card_added`: successful local or cloud-backed save action from card row, detail button, or picker. `first_card_added`: first **observed consenting browser** add since instrumentation/storage reset, not the account's first owned card. Cohort denominator: eligible consenting browsers, not cloud subscribers.
- `benefit_used`: credit/free-night mark successfully persisted by the API, never an optimistic click or undo. `first_benefit_used`: first observed consenting browser success. Existing historical usage is not reconstructed. First-use rate requires an aligned cohort of browsers with saved cards and eligible benefits; aggregate event division is directional only.
- `my_cards_viewed`: My Cards route entered (or consent granted while on it). `my_cards_picker_opened` is separate and not a benefits-page view.
- `my_cards_cohort_started`: first consenting My Cards visit. `my_cards_day7_return` requires another visit in elapsed days **[7,8)** after that first visit; day30 uses **[30,31)**. Each emits once per browser. Visits merely less than seven days apart do not qualify. Denominators must include only cohorts whose respective return window has fully elapsed; group by cohort-start date externally. These are My Cards visit cohorts, not first-card activation cohorts.

## Consent, privacy and limits

All custom events and analytics-only localStorage writes require `opencard_cookie_consent=accepted`. Unknown, managed and rejected choices produce no queued custom events or cohort writes. SDK `beforeSend` checks current consent, including after withdrawal. Persistent cohort state consists only of timestamps/milestone flags; no stable identity is sent. Storage failures cannot block UI actions. Existing essential card storage is unchanged.

Consent withdrawal stops measurement but does not remove essential card data or retroactively delete prior aggregate events. Previously stored cohort flags remain local; deleting browser storage starts a new cohort. Storage is browser-specific, not cross-device/account-specific; shared browsers, blockers, duplicate tabs, SDK delivery failures and consent changes bias counts. No custom PII or card-instance identifiers are sent. Vercel reporting availability/retention/plan support must be verified before claiming an end-to-end production dashboard or exact funnel/retention rates. Counts collected before rollout cannot be backfilled.

## Verification

TypeScript and changed-file ESLint; targeted analytics checks cover consent denial, no pre-consent storage, once-only milestones, exact day-7/day-30 windows and storage failure. Browser smoke should verify localized home routes, wizard shortlist → comparison, official CTA, and absence of custom events until consent. Cloud credit success/failure needs a controlled authenticated test account; do not mutate a real user's benefit history for a smoke test.

### Local verification results

- `npx tsc --noEmit`: pass.
- Changed-file ESLint: zero errors; existing warnings remain in unchanged legacy sections.
- `npx tsx tests/analytics-funnel.test.ts`: pass.
- With `npm run dev -- --port 3011`, `node tests/funnel-ui-smoke.cjs`: pass using installed Chrome in isolated headless context. Verified zero pre-consent custom events, consented wizard start/completion, real two-card shortlist navigation and comparison event, four localized homepage routes, and official issuer terms CTA. Analytics SDK script requests were stubbed; this proves client emission wiring, **not** production Vercel ingestion. No paid recommendation API or real account benefit mutation was used.
- Additional local calculator smoke: Sapphire Preferred initially −$95; inputs 50/60/0 produce +$15; editorial comparison/My Cards link targets return HTTP 200.
