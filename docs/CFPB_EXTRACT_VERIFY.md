# CFPB Extractor v1 — Verification Plan

> Code: `lib/llm-minimax.ts`, `scripts/pipelines/cfpb/lib/schumer-llm.ts`, `scripts/pipelines/cfpb/extract.ts`
> Replaces (archived): `scripts/pipelines/cfpb/archive/schumer_extractor_v2.py` and friends

## Why we need this verification

The old regex-based extractor (now archived) wrote `annual_fee=12` to Amex
Platinum (real value $895) on 2026-04-25. We rewrote it with MiniMax + sanity
gates. Before letting the new pipeline write to production, **manually verify
on the cards we already know are right**, including the cards the old
pipeline got wrong.

## Setup (one-time)

```bash
cd /Users/kaceyc/.openclaw/workspace/opencard

# Install deps (pdf-parse + tsx are now in devDependencies)
npm install

# Make sure these are in .env.local:
#   MINIMAX_API_KEY=sk-cp-... (or sk-api-...)
#   UPSTASH_KV_REST_API_URL=https://wanted-pelican-80843.upstash.io
#   UPSTASH_KV_REST_API_TOKEN=<post-rotation token>
```

## Stage 1 — single-card dry runs (no fact store write)

For each card below, run extract in dry-run mode. The cached PDFs already
exist in `data/cfpb-cache/`. Compare the extracted values against the truth
column.

| Card | Cached PDF | Truth: annual_fee | Truth: foreign_tx | Notes |
|---|---|---|---|---|
| amex-platinum | `amex-platinum.pdf` | $895 | 0% | This is the one the old regex broke |
| amex-gold | (cached as one of the amex PDFs) | $325 | 0% | refresh in 2024/10 |
| amex-blue-cash-everyday | `amex-blue-cash-everyday.pdf` | $0 | 2.7% | no-AF, has FX fee |
| chase-sapphire-reserve | (download from CFPB) | $795 | 0% | June 2025 refresh |
| capital-one-venture-x | (download from CFPB) | $395 | 0% | |

```bash
# Dry-run on Amex Platinum
npx tsx scripts/pipelines/cfpb/extract.ts \
  --pdf data/cfpb-cache/amex-platinum.pdf \
  --card-id amex-platinum \
  --quarter "Q3 2025" \
  --source-url "https://files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q32025/AMERICAN_EXPRESS_NATIONAL_BANK/Platinum_Card_from_American_Express_Cardmember_Agreement.pdf-255467.pdf" \
  --dry-run
```

**Expected output** (key lines):

```
   confidence: 0.95
   canonical:  The Platinum Card from American Express
📋 Extracted fields:
   ✓  annual_fee                   895
   ✓  foreign_transaction_fee      0
   ✓  apr_purchases_min            (some real APR like 21.24)
   ✓  apr_purchases_max            (some real APR like 28.24)
   ✓  penalty_apr                  29.99
   ...
```

**Failure modes to watch for:**

1. **`annual_fee = 12` returned again** → MiniMax hallucinated like the old
   regex. The sanity gate catches this with `Premium-named card "...Platinum..."
   cannot have annual_fee=$12`. Confidence drops, validation marks the field ✗.
   Action: tune the prompt, or escalate this PDF to manual review.

2. **`foreign_transaction_fee = 27` instead of 2.7** → MiniMax dropped the
   decimal. Sanity gate catches because >5%. Action: prompt fix.

3. **`apr_purchases_min = 0.2999`** instead of `29.99` → MiniMax returned
   decimal not percentage. Sanity gate doesn't catch this directly (0.2999 IS
   in [0, 50] range). Add a "must be ≥1 if non-zero" rule, or rely on the
   prompt's explicit instruction.

4. **Spanish PDF parsed** → should be skipped at filename layer (we filter
   `Contrato_*`) AND content layer (Spanish word detection).

5. **`pdf-parse` errors out** → some scanned PDFs in CFPB are image-only.
   Output says "PDF text too short". OCR fallback is a future task.

## Stage 2 — write to fact store (drop --dry-run)

Once Stage 1 looks correct on 3-5 cards:

```bash
# Without --dry-run, the LLM output is gated through ingestFact():
#   - Sanity-fail facts go to the review queue, NOT data/cards/
#   - Sane facts get persisted to Upstash
npx tsx scripts/pipelines/cfpb/extract.ts \
  --pdf data/cfpb-cache/amex-platinum.pdf \
  --card-id amex-platinum \
  --quarter "Q3 2025"

# Then preview what would be promoted to data/cards/
npm run facts:promote:dry
```

The promote dry-run output should show **0 changes** if the extracted values
match what's already in `data/cards/amex-platinum.json` after our Day 1
revert. If there's a mismatch, you'll see the diff and can decide manually.

If everything looks right:

```bash
npm run facts:promote
```

This writes to `data/cards/*.json`. Check git diff before committing.

## Stage 3 — small batch (5-10 cards)

When Stage 2 is verified once end-to-end on Amex Platinum, run a 5-10 card
batch:

```bash
for card in amex-platinum amex-gold amex-blue-cash-everyday \
            amex-blue-cash-preferred amex-cash-magnet amex-delta-platinum \
            amex-delta-reserve amex-everyday amex-everyday-preferred amex-green; do
  echo "=== $card ==="
  pdf=$(ls data/cfpb-cache/${card}.pdf 2>/dev/null || ls data/cfpb-cache/amex-*${card#amex-}*.pdf 2>/dev/null | head -1)
  if [[ -z "$pdf" ]]; then echo "NO PDF for $card"; continue; fi
  npx tsx scripts/pipelines/cfpb/extract.ts --pdf "$pdf" --card-id "$card" --quarter "Q3 2025" --dry-run
done
```

Tally results:

| Outcome | What it means | Action |
|---|---|---|
| ✓ all fields | LLM clean | Commit fact store entries |
| ⚠ some fields → review queue | sanity caught hallucination | Manual review + prompt fix |
| ✗ extraction error | network / format issue | Inspect; PDF may be scanned |

## Stage 4 — full backfill (~190 cards)

Only after Stage 3 has < 10% review-queue rate. Out of scope for v1 — needs
the crawler script (Week 2) to enumerate all per-card filings.

## Cost monitoring

Each extract call:
- Input: ~3,000 tokens (8KB of PDF text, capped in extract.ts)
- Output: ~500 tokens (Schumer Box JSON)

For the full ~190-card backfill: ~190 × 3,500 = 665k tokens. Within MiniMax
flat-fee plan, marginal cost = $0.

After Stage 3, log token usage:

```bash
# extract.ts already prints token counts per call
npx tsx scripts/pipelines/cfpb/extract.ts ... 2>&1 | grep tokens
```

## What this v1 does NOT cover (yet)

- [ ] Crawl `consumerfinance.gov/credit-cards/agreements/issuer/<slug>/` to
      enumerate per-quarter PDFs
- [ ] Fuzzy-match a CFPB PDF's `card_canonical_name` to OpenCard `card_id`
      (so we can run on PDFs we haven't manually mapped yet)
- [ ] Skip unchanged PDFs (sha256 hash diff vs last quarter)
- [ ] OCR fallback for scanned PDFs
- [ ] Plan B: scrape issuer Application & Solicitation Disclosure pages for
      family-style filers (BoA, Synchrony — see `docs/plan-b-disclosure-pages.md`)

These all build on the v1 primitives. The fact-store + sanity-gate
architecture means each new source can plug in without re-introducing the
2026-04-25 corruption.
