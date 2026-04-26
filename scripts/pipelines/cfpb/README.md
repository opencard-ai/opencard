# CFPB Pipeline

> Status: **DISABLED** since 2026-04-25 (see `_DISABLED.flag`)
> Owner: takeover roadmap in [`docs/TAKEOVER_PLAN.md`](../../../docs/TAKEOVER_PLAN.md)

## What this is supposed to do

The CFPB Consumer Financial Protection Bureau Credit Card Agreements Database
([CCAD](https://www.consumerfinance.gov/credit-cards/agreements/)) is a legal,
quarterly-mandated source of every U.S. credit card agreement filed by issuers
with ≥10,000 active accounts. It's the canonical place to verify Schumer Box
fields (annual fee, APRs, foreign transaction fee, late fee).

This pipeline is meant to:
1. Crawl CCAD by issuer (per-quarter)
2. Parse Schumer Box from each PDF
3. Match each PDF to an OpenCard `card_id`
4. Write verified fields back to `data/cards/*.json` with provenance

## Why it's disabled right now

The Schumer Box parser was a regex (`schumer_extractor_v2.py`) that matched
"12 monthly billing cycles" boilerplate in Amex agreements and wrote 12 to
`annual_fee`. By 2026-04-25 the live API was serving "Amex Platinum annual
fee $12" (real value $895). 24+ premium cards were affected.

Day 1 of the takeover:

1. Reverted 19 cards' `annual_fee` (`_revert_corrupted_annual_fee.py`)
2. Added `_DISABLED.flag` + `_killswitch.py` so any pipeline script refuses to run
3. Added `validate-all.ts` sanity rule that catches `annual_fee < $50` on premium-named cards in CI

The pipeline must not be re-enabled until the rewrite is done. The rewrite must
include LLM-based extraction (regex has been proven unreliable on real Amex
PDFs), sanity gates at write time, and a human-review queue. See
[`docs/TAKEOVER_PLAN.md` Week 1.B/C](../../../docs/TAKEOVER_PLAN.md).

## Current structure

```
scripts/pipelines/cfpb/
├── README.md                          ← you are here
├── _DISABLED.flag                     ← controls the kill switch
├── _killswitch.py                     ← imported by future pipeline entry points
├── _revert_corrupted_annual_fee.py    ← Day 1 emergency tool, idempotent
├── config/
│   ├── issuer_mapping.json            ← OpenCard issuer ↔ CFPB slug
│   └── known_pdfs.json                ← per-card PDF URL registry (Q3 2025 snapshot)
└── archive/                           ← 26 broken/iterative scripts (DO NOT RUN)
    ├── apply_*.py                     ← 6 versions of the apply step
    ├── run_extractor_v2..v6.py        ← 5 iterations of orchestration
    ├── schumer_extractor.py           ← original regex extractor
    ├── schumer_extractor_v2.py        ← regex bug source (line 186-188)
    └── ...                            ← misc one-shot helpers
```

Every file in `archive/` was preserved unmodified below an ARCHIVED stub —
running them prints a redirect to this README and exits with code 2.

## Re-enabling the pipeline

To re-enable the pipeline, the rewrite must satisfy all of:

- [ ] LLM-based Schumer Box extraction (replace regex)
- [ ] Sanity gates at write time (premium fee < $50 → reject; range checks)
- [ ] Append-only fact store (Upstash list per `card_id × field_path`)
- [ ] Human review queue (CCAD facts that disagree with current value go to queue, not direct write)
- [ ] Test fixtures: ≥50 PDF text snippets covering Schumer Box variants
- [ ] CI integration: `validate-all.ts` must pass after a dry-run

When all are met, write the new entry point at `scripts/pipelines/cfpb/extract.py`
with implementation in `lib/`, and remove `_DISABLED.flag`.

## How to run safely *before* the rewrite

For one-off emergency hotfixes (not for production-data writes):

```bash
ALLOW_DISABLED_PIPELINE=1 python3 scripts/pipelines/cfpb/<script>
```

This is logged. Don't use it for batch operations.

## Active tools

### `_revert_corrupted_annual_fee.py`

One-shot script that fixes the 24-card corruption from 2026-04-25. Idempotent —
re-running it after the data is clean does nothing. Allowlisted past the kill
switch.

```bash
python3 scripts/pipelines/cfpb/_revert_corrupted_annual_fee.py --dry-run
python3 scripts/pipelines/cfpb/_revert_corrupted_annual_fee.py
```

### `_killswitch.py`

Module imported at the top of any pipeline script that writes to `data/cards/`.
Reads `_DISABLED.flag` from the same directory and refuses to proceed if found.
Allowlist contains `_revert_corrupted_annual_fee.py` and `_killswitch.py` itself.

### `_DISABLED.flag`

Plain-text file. Its existence triggers the kill switch. Its contents explain why
(currently: 2026-04-25 corruption + rewrite blocker list).

## Reference docs

- [docs/TAKEOVER_PLAN.md](../../../docs/TAKEOVER_PLAN.md) — full takeover roadmap
- [docs/cfpb-pipeline-diagnosis-2026-04-22.md](../../../docs/cfpb-pipeline-diagnosis-2026-04-22.md) — earlier diagnosis (16% coverage)
- [docs/plan-b-disclosure-pages.md](../../../docs/plan-b-disclosure-pages.md) — alternative for family-style filers (BoA / Synchrony)
