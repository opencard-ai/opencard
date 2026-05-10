# Card Adaptor Phase 2 — Spec v1

> Status: Draft  
> Companion to: `docs/CARD_ADAPTOR_METHODOLOGY.md`  
> Grounded by: dry-run on 50 cards, 2026-05-09 (gh run 25612748894)

This spec turns the existing `scripts/auto-update-cards/` cron into the
artifact-first model the methodology calls for. v1 is intentionally narrow:
move the **write target** from "PR against `data/cards/*.json`" to
"`data/adaptor/runs/<run_id>/` artifact", then bolt review and apply on top.

Real-data observations from the 2026-05-09 dry-run inform every threshold
below. Where the dry-run wasn't enough, items are marked `TBD`.

---

## 1. Headline numbers from the 2026-05-09 dry-run

| Outcome | Count | % | Notes |
|---|---|---|---|
| With changes (proposals) | 26 | 52% | 15 HIGH + 7 MED + 4 LOW(approx) |
| No changes | 5 | 10% | catalog already current |
| Errors — All sources failed | 13 | 26% | BoA × 5, Barclays × 7, Amex Marriott Brilliant × 1 |
| Errors — Low confidence < 0.7 | 4 | 8% | self-rejected: confidences 0.00, 0.21, 0.25, 0.41 |
| Errors — Truncated 16K + 24K | 2 | 4% | chase-ink-biz-cash, capital-one-spark-cash-plus |
| **Total** | **50** | **100%** |  |

**HIGH proposal triage (manual review of 15):**

| Verdict | Cards | % |
|---|---|---|
| ✅ Real catalog update | ~9-10 | 60-67% |
| 🔴 LLM regression / hallucination | 3 | 20% |
| 🟡 Cosmetic point_program rename | ~3 | 20% |

The 3 HIGH regressions:

- **amex-gold** AF $325→$160, bonus 100K→25K — USCCG page is the discontinued
  v2 of the card. Same root cause as the 2026-05-07 jitter test (page labelled
  "AmEx Gold 旧版 (Discontinued)"). source[0] needs swap.
- **chase-ink-biz-unlimited** bonus 75000 → **750** — LLM mis-extracted from
  "$750 cash back" marketing copy as the points number. Tightening the
  bonus_points sanity gate to "≤ 1000 = suspect for points-based card" would
  catch this.
- **chase-hyatt** AF $95 → $0 — Chase Hyatt is $95. Pure hallucination. The
  free-tier annual_fee sanity gate should reject `paid → free` swing for
  cards tagged as `paid-tier` in the catalog.

---

## 2. v1 scope (and explicit non-scope)

**v1 builds:**

| Stage | Status | Notes |
|---|---|---|
| `scrape` | reuse existing scrape.ts | wrap to also save HTML snapshot to artifact dir |
| `extract → normalize` (combined) | reuse existing extract.ts | output `candidate.json` to artifact dir, not direct PR |
| `qa` | NEW | runs the rules in §4 against `candidate.json` |
| `review` | NEW | renders `qa-report.json` → `review-diff.md` |
| `apply` | wraps existing pr.ts | requires `--approved` flag, only runs after `qa` returns `pass` or human override |

**v1 does NOT build (deferred to v2/v3):**

- multi-source scraping (still single source[0])
- per-field citations (placeholder field present, populated only with the existing single `source_quote`)
- FactEvent / review_queue / promote-facts flow
- Auto-apply for any field (always require `--approved`)

The **only** v1 win that matters: **the cron stops opening PRs against catalog**. It writes artifacts. A human (or a future agent) calls `apply --approved` after reviewing.

---

## 3. CLI surface (v1)

```bash
card-adaptor scrape --max 50            [--card <id>]+   [--mode offer|all]
card-adaptor qa --run <run_id>          [--all-pending]
card-adaptor review --run <run_id>      # prints review-diff.md to stdout
card-adaptor apply --run <run_id> --approved
card-adaptor list [--status pending|reviewed|applied|errored]
```

Implementation: `scripts/card-adaptor/index.ts`, npm bin `card-adaptor`.
Each command is a thin wrapper around existing modules in `scripts/auto-update-cards/`.

---

## 4. QA verdict logic — real thresholds

Verdict = max severity across checks. Order of evaluation:

| Verdict | Trigger |
|---|---|
| `blocked` | any blocking_issue (see below) |
| `needs_review` | any check returns `needs_review` |
| `pass` | every check `pass` or `n/a` |

**Blocking issues (auto-reject the candidate, never write):**

| ID | Rule |
|---|---|
| `truncated_both_attempts` | both 16K and 24K LLM calls returned truncated JSON (saw 2/50 in dry-run) |
| `confidence_floor` | `confidence < 0.7` (already enforced; saw 4/50 caught) |
| `paid_to_free_no_evidence` | `annual_fee` change from `> 0` to `0` AND no source quote contains `"$0"`, `"no annual fee"`, or `"discontinued"` (would have caught chase-hyatt) |
| `points_collapse` | `welcome_offer.bonus_points` drops by ≥ 80% AND new value < 5000 AND card's `point_program` is non-cashback (would have caught chase-ink-biz-unlimited 75K→750) |
| `source_page_marked_discontinued` | scraped HTML contains `"discontinued"` or `"旧版"` near card name (would have caught amex-gold) |
| `prompt_injection_leaked` | `candidate.welcome_offer.description` contains `"ignore previous"`, `"system prompt"`, `"as an AI"`, or similar |
| `unrelated_card_changes` | diff scope includes any card_id != `--card` arg |

**Needs-review checks (surface but allow approval):**

| ID | Rule | Threshold (data-grounded) |
|---|---|---|
| `annual_fee_swing` | `\|delta\| / from > 30%` | already in classify.ts |
| `bonus_points_swing` | `\|delta\| / from > 50%` | already in classify.ts |
| `spending_req_swing` | `\|delta\| / from > 100%` | already in classify.ts |
| `point_program_rename` | LLM normalised `"Amex Membership Rewards" → "MR"` etc. | dry-run hit ~5 cards. Decide canonical form once and add to allowlist; until then, `needs_review` |
| `existing_credit_deletion` | candidate omits a `recurring_credit` present in catalog | doc §13 explicit |
| `is_elevated_flip` | `is_elevated` flips with no `normal_bonus_points` baseline | already MED in classify.ts |
| `description_length_jump` | new description > 2× old length OR vice versa | TBD — dry-run had several large rewrites |

**Pass-only checks (no risk):**

| ID | Rule |
|---|---|
| `schema_valid` | candidate parses to ExtractedData |
| `bonus_in_html` | bonus_points appears in stripped HTML (already enforced) |
| `source_quote_in_html` | source_quote ≥ 30 chars and appears in HTML (already enforced) |

---

## 5. Artifact format

```
data/adaptor/runs/<run_id>/
  manifest.json
  cards/<card_id>/
    manifest.json
    candidate.json
    qa-report.json
    review-diff.md
    sources/
      01-primary.html.gz
      01-primary.txt
```

`run_id` format: `YYYY-MM-DDTHH-MM-SSZ-{cron|manual}-<slug>`.

`candidate.json` superset of methodology doc §6:

```json
{
  "card_id": "amex-gold",
  "extracted_at": "2026-05-09T22:00:00Z",
  "extractor": { "model": "MiniMax-M2.7", "prompt_version": "regenerated-2026-05-08" },
  "source_url": "https://www.uscreditcardguide.com/amex-gold/",
  "source_html_hash": "sha256:...",
  "html_truncated_at_16k": true,
  "html_truncated_at_24k": false,
  "candidate": { /* the ExtractedData blob */ },
  "citations": {
    "_global_quote": "Earn 100,000 Membership Rewards points after spending $6,000 in the first 6 months",
    "_global_quote_in_html": true
  },
  "raw_llm_output": "...",
  "open_questions": []
}
```

`qa-report.json` mirrors §4 verdict logic verbatim.

---

## 6. Cron migration

Step-by-step replacement of `card-updates.yml` → `card-adaptor.yml`:

| Step | Action | Risk |
|---|---|---|
| 1 | Build `card-adaptor` CLI in parallel; old cron untouched | none |
| 2 | New workflow `card-adaptor.yml` runs `scrape + qa` only on schedule, uploads artifacts to GitHub workflow artifacts (90-day retention) and / or commits artifacts to a separate `adaptor-runs` branch | none |
| 3 | Verify 2 schedule cycles produce sensible artifacts | none |
| 4 | Comment out `schedule:` block in `card-updates.yml` (keep `workflow_dispatch` for emergency apply) | reversible by uncomment |
| 5 | Add a manual `card-adaptor apply --run <run_id> --approved` step that humans trigger after reviewing artifacts | apply still goes through pr.ts existing logic |
| 6 (v3) | Replace `apply` with FactEvent emission | high — defer until fact-store is ready |

---

## 7. What today's data does NOT yet tell us (still TBD)

| TBD | Reason | How to learn |
|---|---|---|
| `description_length_jump` threshold | many descriptions rewrote significantly; some legit, some not | sample 10 from this run, label good/bad, set band |
| Per-issuer scrape success rate | only 1 dry-run | run 2-3 more cycles before drawing per-issuer conclusions |
| Whether 32K retry rescues truncation | only tested up to 24K | one experiment with chase-ink-biz-cash + chase-ink-biz-unlimited |
| Cross-source agreement payoff | not tested in v1 | v2 work |
| Real human review burden / hour | no human reviewed 15 HIGH yet | next manual cycle |

---

## 8. Open priorities (post-v1)

Ranked by 2026-05-09 dry-run severity:

1. **Source quality** (13/50 = 26% scrape failure on BoA + Barclays). Either swap source[0] to USCCG/TPG or implement multi-source fallback chain at scrape level.
2. **Truncation @ 32K retry** for the 2 cards still failing at 24K.
3. **Phase 2 CLI** as defined here — once the source layer is healthier the artifact-first flow is high leverage.
4. **`paid_to_free_no_evidence` and `points_collapse` blocking gates** — would have caught 2/3 of the manually-flagged HIGH regressions today.
5. **Phase 3 fact-store** — only worth doing after the v1 artifact format has settled in real usage.

---

## 9. One-line summary

v1 stops the cron from writing to `data/cards/*.json`. Everything else stays the same shape. Adding three blocking gates — `paid_to_free_no_evidence`, `points_collapse`, `source_page_marked_discontinued` — would have prevented every manually-flagged regression in today's dry-run.
