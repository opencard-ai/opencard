# Source[0] Swap Backlog — 13 cards from 2026-05-09 dry-run

The 2026-05-09 dry-run (gh run 25612748894) failed scrape on 13/50 cards with
"All sources failed". This doc tracks the swap status for each.

| Card | Failure mode | Status | New source[0] |
|---|---|---|---|
| `amex-marriott-brilliant` | USCCG URL 301-redirected; scraper `headCheck` rejects 301 | ✅ swapped this commit | `https://www.uscreditcardguide.com/amex-marriott-bonvoy-brilliant-credit-card-formerly-amex-spg-luxury-double-dip-opportunity/` |
| `boa-premium-rewards` | BoA direct page is JS-rendered SPA returning unrendered template tokens | ✅ swapped this commit | `https://www.uscreditcardguide.com/boa-premium-rewards/` |
| `boa-customized-cash-rewards` | BoA SPA same as above | 🔍 needs deeper search — USCCG/TPG don't have a static page at the obvious slugs (4 attempts 404) | TODO |
| `boa-biz-advantage-customized-cash` | BoA SPA | 🔍 needs research | TODO |
| `boa-biz-advantage-travel` | BoA SPA | 🔍 needs research | TODO |
| `boa-biz-advantage-unlimited-cash` | BoA SPA | 🔍 needs research | TODO |
| `barclays-jetblue-plus` | catalog `sources` array empty | 🔍 needs research | TODO — check if JetBlue Plus is still issued (Barclays + JetBlue partnership active) |
| `barclays-uber` | catalog `sources` empty + Uber Visa was discontinued ~2021 | ⚠️ probably dead card — verify discontinued, then either drop or mark `status: discontinued` | DELETE / DEPRECATE |
| `barclays-ubereats` | catalog `sources` empty | ⚠️ same as above — Uber Eats card status unclear | VERIFY |
| `barclays-wyndham-earner` | catalog `sources` empty | 🔍 needs research — Wyndham Earner family active, but Barclays issuer URLs likely broken |  TODO |
| `barclays-wyndham-earner-plus` | same | 🔍 needs research | TODO |
| `barclays-wyndham-earner-biz` | same | 🔍 needs research | TODO |
| `barclays-harley-davidson` | catalog `sources` empty + Harley-Davidson Visa was likely transitioned to U.S. Bank ~2024 | ⚠️ probably issuer-changed — needs catalog correction | VERIFY ISSUER |

## Patterns

1. **BoA direct pages are universally scraper-hostile.** All 5 BoA cards in
   the broken list use `bankofamerica.com` URLs that return unrendered
   `{{...}}` template tokens. The `boa-premium-rewards` swap above is the
   pattern: USCCG/TPG static pages exist for **flagship** consumer cards,
   but **business** + **niche** SKUs may not have third-party reviews.

2. **Barclays cards have no `sources` at all.** All 7 Barclays cards in the
   broken list had `"sources": []` (or missing). They're falling all the way
   through to DDG search which returns nothing useful.

3. **Discontinued / issuer-changed cards** show as scrape failures because
   no current page exists. These need catalog status changes, not source
   swaps:
   - `barclays-uber` → Uber Visa discontinued 2021
   - `barclays-harley-davidson` → likely transferred to US Bank 2024

## Next session work

For the 8 TODO items + 3 VERIFY items:

1. Run `WebSearch` (or manual Google `site:uscreditcardguide.com <slug>` /
   `site:thepointsguy.com <card name>` searches) to find current review URLs.
2. For VERIFY items, check issuer's current product list to confirm
   discontinued / issuer-changed status, then either:
   - Mark catalog with `status: "discontinued"` and exclude from cron
   - Update `issuer` field if rebranded (e.g. Harley-Davidson → U.S. Bank)
3. For Barclays Wyndham trio: try `https://www.uscreditcardguide.com/wyndham-rewards-earner-cards/` (collective review) since individual pages don't exist.
4. Patch scraper `headCheck()` to accept 301/302 (the Marriott Brilliant
   issue): one-line fix in `scripts/auto-update-cards/scrape.ts:54` —
   change `res.statusCode === 200` to `res.statusCode >= 200 && res.statusCode < 400`.

Estimated time: 30-60 min once dedicated. Would clear ~10/13 of the dry-run scrape errors.
