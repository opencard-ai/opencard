# Recurring Credits Research — Autonomous Run Status

**Started:** 2026-04-26 (Sun)
**Operator:** Claude Code autonomous (Kacey 12hr away)
**Goal:** Research recurring_credits for top ~35 priority cards. Stage drafts only — do NOT touch data/cards/*.json.

## Outcome (interrupted, resumed, partially completed)

| Metric | Count |
|---|---|
| Cards staged | **38** |
| With drafted recurring_credits | 19 |
| Confirmed no credits (legitimate) | 16 |
| Needs human review | 25 (subset across both) |

## What changed mid-run

**Critical pivot:** Subagents (Agent tool) were denied WebFetch + WebSearch permissions in this session. First batch of 5 agents all returned `_needs_review=true` with no data. Pivoted to main-thread WebSearch, which works. Most issuer-direct WebFetch calls return 403 (anti-bot), so research relied on WebSearch summaries citing issuer pages + reputable third-party (NerdWallet, U.S. News, CNBC, The Points Guy, Upgraded Points).

## Schema convention (decided 2026-04-26 by Kacey)

**Convention C: per-period unit.**
- `amount` = USD value PER period (the unit of `frequency`)
- `frequency` = period of credit (monthly / quarterly / semi_annual / annual / etc.)
- Annual total = amount × periods/year (computed downstream, e.g. for credit reminders & UI)

Examples after this rule:
- Hilton Surpass quarterly $50 → `amount: 50, frequency: "quarterly"` (annual = 50 × 4 = $200)
- Bilt Palladium semi-annual $200 → `amount: 200, frequency: "semi_annual"` (annual = 200 × 2 = $400)
- Disney+ monthly $10 → `amount: 10, frequency: "monthly"` (annual = $120)
- Uber Cash annual $200 → `amount: 200, frequency: "annual"` (already correct)

**Staging fixes applied (5 files):** amex-hilton-honors-biz, amex-hilton-surpass, bilt-palladium, chase-iberia-visa-signature, chase-united-quest-biz.

**Existing-data migration scope (audit of 69 populated cards):** only 1 violation — `boa-customized-cash-rewards` "2025 Quarterly Bonus" with amount=200 freq=quarterly (likely should be 50 quarterly = $200/yr). Operator decision to fix at promotion time.

## Quality bar (self-imposed)

- All staging files include `sources_consulted` array
- Each credit has `source_url` (issuer page where possible)
- Conditional credits (e.g. "$200 after $20k spend") **excluded** with explanation in `_excluded`
- Free Night Awards & non-USD points/status — excluded as qualitative (no published USD value)
- Discontinued/rebranded cards flagged with `card_status_alert`

## Clean drafts ready for review (✓ no flags)

| card_id | credits | annual value |
|---|---|---|
| `amex-delta-gold-biz` | Delta Stays | $150 |
| `amex-hilton-honors-biz` | Hilton quarterly | $240 |
| `amex-hilton-surpass` | Hilton quarterly | $200 |
| `bilt-palladium` | Hotel + Bilt Cash | $400 + $200 |
| `chase-aeroplan` | Global Entry | $120 (every 4yr) |
| `citi-strata-premier` | Citi Travel Hotel | $100 |

## Drafts with `_needs_review` (operator decision required)

| card_id | reason |
|---|---|
| `amex-blue-biz-plus` | $100 software credit may be NEW 2026 enhancement — verify on amex.com |
| `amex-delta-skymiles-gold-biz` | likely DUPLICATE of `amex-delta-gold-biz` — dedup |
| `amex-plum` | DISCONTINUED March 2026 — remove from catalog or mark legacy |
| `barclays-aadvantage-red` | DISCONTINUED — converting to Citi cards today (2026-04-26) |
| `barclays-jetblue-biz` | $100 JetBlue Vacations credit needs $100+ Vacations purchase trigger |
| `capital-one-spark-miles-select` | REBRANDED to VentureOne Business — update card_id |
| `capital-one-venture` | $50 hotel credit is per_stay not annual cap |
| `chase-iberia-visa-signature` | only $40/yr DoorDash quarterly qualifies |
| `chase-sapphire-preferred` | $50 hotel credit unclear (anniversary vs cal year); DashPass is 1-yr promo (excluded) |
| `chase-southwest-priority` | AF was raised $149→$229 in 2026 revamp — verify |
| `chase-united-quest-biz` | card_id ambiguity — consumer vs business United Quest |
| `emirates-skywards-mastercard` | only Global Entry qualifies; rest qualitative |
| `hawaiian-airlines-world-elite-mastercard` | $100 companion is conditional on flying HA |

## Confirmed `_no_credits_found` (legitimate)

| card_id | note |
|---|---|
| `amex-blue-biz-cash` | $0 AF, pure cash-back, no credits |
| `amex-everyday-preferred` | closed to new applicants; no credits |
| `amex-graphite-biz` | NEW 2026 launch (March 2026); only conditional milestone credit |
| `amex-marriott-bonvoy-biz` | only Free Night Award (no USD value) |
| `barclays-jetblue-plus` | only anniversary points (excluded) |
| `capital-one-spark-cash-plus` | only $150 fee refund after $150k spend (conditional) |
| `chase-aer-lingus-visa-signature` | no recurring USD credits |
| `chase-british-airways-visa-signature` | $600 BA Reward Flight credit is conditional |
| `chase-hyatt` | only Free Night Cat 4 (no USD value) |
| `chase-ink-biz-cash` | $0 AF, no credits |
| `chase-ink-biz-preferred` | only insurance/protections, no credits |
| `chase-ink-biz-premier` | no recurring USD credits |
| `chase-ink-biz-unlimited` | $0 AF, no credits |
| `chase-southwest-performance-biz` | only points + qualitative |
| `citi-aa-platinum-select` | all conditional or qualitative |
| `luxury-card-titanium` | only lounge + concierge (qualitative) |

## Discoveries beyond recurring_credits scope

These are **catalog hygiene** issues surfaced during research — separate from the RC task but worth flagging:

- `amex-plum` — discontinued March 2026
- `barclays-aadvantage-red` — discontinued, converting to Citi today
- `amex-everyday-preferred` — closed to new applicants
- `capital-one-spark-miles-select` — rebranded to VentureOne Business
- `chase-southwest-performance-plus` — card name uncertain; Chase has Performance Business ($299), not "Performance Plus"
- `amex-delta-gold-biz` vs `amex-delta-skymiles-gold-biz` — likely duplicate card_id
- `chase-united-quest-biz` — card name vs $350 AF mismatch suggests confused product mapping
- `barclays-wyndham-earner-plus-biz` — disambiguation between Earner Business ($95) and Earner Plus consumer ($75)

## Phase D — Local commits — NOT done

Per safety rule, did not commit staging files. Operator can review at `data/recurring-credits-research/staging/` and decide whether to:
1. Curate + write to `data/cards/*.json`
2. Re-research the `_needs_review` items with stricter sourcing
3. Discard and try a different approach

## What didn't work

- **Subagent fan-out (Agent tool)** — no web tool permissions
- **WebFetch on issuer sites** — 403 anti-bot on amex/chase consumer pages
- **High-confidence per-card auto-fill** — 25/38 still need human verification due to ambiguous product info, conditional benefits, or USD-value gaps for free-night-style awards

## What worked

- **Main-thread WebSearch** — returned current 2026 data with issuer-page citations
- **Strict exclusion rules** — kept staging clean of hallucinated credits
- **Catalog hygiene side-discoveries** — surfaced 7+ unrelated issues worth fixing
