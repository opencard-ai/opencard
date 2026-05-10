# Source[0] Swap Backlog — 13 cards from 2026-05-09 dry-run

The 2026-05-09 dry-run (gh run 25612748894) failed scrape on 13/50 cards with
"All sources failed". This doc tracks the swap status for each.

## Status table (updated 2026-05-10)

| Card | Failure mode | Status | New source[0] |
|---|---|---|---|
| `amex-marriott-brilliant` | USCCG URL 301-redirected; scraper `headCheck` rejected 301 | ✅ swapped 5/09 | `https://www.uscreditcardguide.com/amex-marriott-bonvoy-brilliant-credit-card-formerly-amex-spg-luxury-double-dip-opportunity/` |
| `boa-premium-rewards` | BoA direct page is JS-rendered SPA returning unrendered template tokens | ✅ swapped 5/09 | `https://www.uscreditcardguide.com/boa-premium-rewards/` |
| `boa-customized-cash-rewards` | BoA SPA | 🟢 ready to apply | `https://www.uscreditcardguide.com/boa-cash-rewards-credit-card/` |
| `boa-biz-advantage-customized-cash` | BoA SPA | 🟢 ready to apply | `https://www.uscreditcardguide.com/boa-cash-rewards-business-credit-card/` |
| `boa-biz-advantage-travel` | BoA SPA | 🟡 apply with caveat | `https://www.uscreditcardguide.com/boa-travel-rewards-business-credit-card/` (page last updated 2021.10 — welcome figure may be stale; if extraction quality is poor, consider TPG fallback) |
| `boa-biz-advantage-unlimited-cash` | BoA SPA | 🟢 ready to apply | `https://www.uscreditcardguide.com/boa-unlimited-cash-rewards-business-credit-card/` |
| `barclays-jetblue-plus` | empty `sources` array | 🟢 ready to apply (Barclays still issues this card in 2026) | `https://www.uscreditcardguide.com/barclaycard-jetblue-plus-credit-card/` |
| `barclays-wyndham-earner` | empty `sources` array | 🟢 ready to apply | `https://www.uscreditcardguide.com/barclays-wyndham-earner-credit-card/` |
| `barclays-wyndham-earner-plus` | empty `sources` array | 🟢 ready to apply | `https://www.uscreditcardguide.com/barclays-wyndham-earner-plus-credit-card/` |
| `barclays-wyndham-earner-biz` | empty `sources` array | 🟢 ready to apply | `https://www.uscreditcardguide.com/barclays-wyndham-earner-business-credit-card/` |
| `barclays-uber` | empty `sources` + Uber Visa converted to Barclays View Mastercard Oct 2021 | 🟢 marked discontinued (5/10 unstaged) | `status: "discontinued"` set; cron-loader skip confirmed |
| `barclays-ubereats` | empty `sources`; no separate "Uber Eats" Barclays card found in 2026; existing description already reads "card retired by Barclays" | 🟢 marked discontinued (5/10 unstaged) | `status: "discontinued"` set; flagged as likely duplicate of `barclays-uber` for Kacey to delete or keep |
| `barclays-harley-davidson` | empty `sources` + Harley-Davidson Visa transferred to U.S. Bank ~2024 | 🟢 marked discontinued (5/10 unstaged) | `status: "discontinued"` set with successor-pointer notes (NerdWallet + h-dvisa.com); Kacey to create new `us-bank-harley-davidson` catalog entry when ready |

🟢 = high confidence, apply as-is
🟡 = needs Kacey's manual decision before applying

---

## Apply checklist (mechanical edits — Kacey runs this section)

The 8 high-confidence URL swaps are pure edits to `data/cards/<card_id>.json`.
Notes for each variant:

### A. BoA cards (4) — REPLACE existing source[0], keep BoA SPA as source[1] for posterity

```jsonc
// data/cards/boa-customized-cash-rewards.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/boa-cash-rewards-credit-card/", "notes": "USCCG primary review" },
  { "url": "https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/", "notes": "Official BOA Page (SPA — fallback only)" }
]

// data/cards/boa-biz-advantage-customized-cash.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/boa-cash-rewards-business-credit-card/", "notes": "USCCG primary review" },
  { "url": "https://www.bankofamerica.com/smallbusiness/credit-cards/products/cash-rewards-business-credit-card/", "notes": "Official BOA Business Page (SPA — fallback only)" }
]

// data/cards/boa-biz-advantage-travel.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/boa-travel-rewards-business-credit-card/", "notes": "USCCG primary review (2021.10 update — refresh manually if welcome offer drift)" },
  { "url": "https://www.bankofamerica.com/smallbusiness/credit-cards/products/travel-rewards-business-credit-card/", "notes": "Official BOA Business Page (SPA — fallback only)" }
]

// data/cards/boa-biz-advantage-unlimited-cash.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/boa-unlimited-cash-rewards-business-credit-card/", "notes": "USCCG primary review" },
  { "url": "https://www.bankofamerica.com/smallbusiness/credit-cards/products/unlimited-cash-rewards-business-credit-card/", "notes": "Official BOA Business Page (SPA — fallback only)" }
]
```

### B. Barclays Wyndham trio + JetBlue Plus (4) — ADD source[0] to empty array

```jsonc
// data/cards/barclays-jetblue-plus.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/barclaycard-jetblue-plus-credit-card/", "notes": "USCCG primary review" }
]

// data/cards/barclays-wyndham-earner.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/barclays-wyndham-earner-credit-card/", "notes": "USCCG primary review" }
]

// data/cards/barclays-wyndham-earner-plus.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/barclays-wyndham-earner-plus-credit-card/", "notes": "USCCG primary review" }
]

// data/cards/barclays-wyndham-earner-biz.json
"sources": [
  { "url": "https://www.uscreditcardguide.com/barclays-wyndham-earner-business-credit-card/", "notes": "USCCG primary review" }
]
```

### C. Discontinued / issuer-change (3) — APPLIED 5/10 (unstaged)

All 3 cards now carry `status: "discontinued"` + a `discontinued_notes` field
explaining the resolution. `cards-loader.ts:66` filters them out, so cron will
no longer attempt to scrape them next run. Verified via `loadCards()` smoke
test 5/10.

#### `barclays-uber` — applied
- `status: "discontinued"`
- `discontinued_notes`: cites Oct 2021 conversion to Barclays View Mastercard.
- Evidence: One Mile at a Time, NerdWallet, DoC.

#### `barclays-ubereats` — applied; file kept (5/10 PM decision)
- `status: "discontinued"`
- `discontinued_notes`: refined to document why the file is kept. Cross-ref
  search found `card_id: "barclays-ubereats"` referenced in 17+ files outside
  `data/cards/`: `url-map.json`, two `all-cards-index*.json` search indexes,
  `reference-list.json`, three CFPB pipeline configs, CFPB extracted cache,
  recurring-credits staging, and historical check-reports. The CFPB pipeline
  also tracks `barclays-ubereats.pdf` as an independent filing per
  `scripts/pipelines/cfpb/config/card_aliases.json:111`, hinting the
  catalog distinction may reflect a real-world Uber Eats co-brand variant.
- **Decision**: keep the file. Delete-blast-radius (chasing 17+ refs)
  outweighs the catalog-tidiness benefit. Status=discontinued already
  removes it from cron + active-product UI surfaces; the structural
  duplicate-vs-distinct question can be revisited if those references
  matter for any future feature.

#### `barclays-harley-davidson` — applied as discontinued (Barclays record only)
- `status: "discontinued"` on the existing record (which represents the
  Barclays-issued version that was transferred away).
- `discontinued_notes`: full successor-pointer for the U.S. Bank version,
  including suggested sources (NerdWallet review URL + h-dvisa.com), and
  a note that successor uses Visa not Mastercard.
- **5/10 PM**: deferred creating the `us-bank-harley-davidson` successor.
  NerdWallet returned 403 to scraper-style WebFetch (cron User-Agent
  likely also blocked); h-dvisa.com landing page content was sparse;
  USCCG has no Harley-Davidson review. Without a verified scraper-friendly
  source, creating the new entry now would just produce another
  "All sources failed" card every cron. Spun off as a separate research
  task; old Barclays record stays discontinued so cron is quiet.

Decision rationale: didn't go with `status: "transferred"` because the cron
loader doesn't filter that value (only `discontinued`), so a transferred
record would keep failing every run. The "create a fresh successor record"
pattern is also cleaner than mutating the issuer field on the existing one
— it preserves historical truth (this card *was* a Barclays product) while
letting the new U.S. Bank record start with proper sources from day one.

---

## Patterns observed

1. **BoA direct pages are universally scraper-hostile.** All 5 BoA cards in
   the broken list use `bankofamerica.com` URLs that return unrendered
   `{{...}}` template tokens. USCCG static pages exist for both consumer and
   business SKUs — the swap pattern is reliable.

2. **Barclays cards historically had no `sources` at all.** All 7 Barclays
   cards in the broken list had `"sources": []`. They're falling all the way
   through to DDG search which returns nothing useful. Adding any working
   USCCG URL fixes this immediately.

3. **Discontinued / issuer-changed cards** show as scrape failures because
   no current page exists. These need catalog status changes, not source
   swaps.

---

## After applying — expected dry-run impact

Of the 13 original "All sources failed" cards:
- 2 already fixed (5/09 commit `4434a7e5`) ✅
- 8 mechanical URL swaps (groups A + B) → applied 5/10 (unstaged) → cron should succeed
- 3 marked discontinued (group C) → applied 5/10 (unstaged) → cron skips entirely

Net: dry-run "All sources failed" count should go from **13 → 0** after
this round, contingent on the 11 unstaged JSON edits being committed.

If a USCCG primary URL turns out to be unreachable (e.g. moved or 404), the
cron's existing fallback chain (DoC news / DDG / Playwright) still runs, so
worst-case behavior is the same as today — no regression.
