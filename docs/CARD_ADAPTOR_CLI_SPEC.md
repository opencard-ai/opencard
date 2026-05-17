# Card Adaptor CLI Spec

Status: v0.1 implemented as `npm run card-adaptor -- <command>` via `scripts/card-adaptor/index.ts`.

Goal: make Card Adaptor a deterministic, auditable single-entry CLI for credit-card source fetching, extraction, normalization, validation, and production patch review.

## Design Principles

- **Single entrypoint:** agents should call one CLI, not many ad-hoc scripts.
- **Evidence first:** every production field change must trace back to saved source snapshots.
- **No silent writes:** production card JSON is never changed unless `apply --write` passes safety gates.
- **Issuer wins:** issuer official pages are canonical for core terms; third-party/community sources are discovery and corroboration.
- **Human gate for volatile fields:** welcome offers, earning rates, recurring credits, travel benefits, and insurance require review.
- **Agent friendly:** every command writes machine-readable JSON artifacts and concise Markdown review reports.

## Primary Commands

```bash
npm run card-adaptor -- doctor
npm run card-adaptor -- list
npm run card-adaptor -- fetch --card <card-id>
npm run card-adaptor -- extract --run <run-dir>
npm run card-adaptor -- normalize --run <run-dir>
npm run card-adaptor -- validate --run <run-dir>
npm run card-adaptor -- apply --run <run-dir> [--write]
```

## Command Contract

### `doctor`

Checks local readiness without mutating production data.

Outputs:
- configured card count
- required directory status
- Scrapling binary availability
- Node/runtime status
- latest run directory status

Exit behavior:
- `0` if core repo structure exists
- future versions may return non-zero for missing hard dependencies

### `fetch --card <card-id>`

Fetches configured source snapshots for one card.

Current implementation:
- alias of legacy `scrape`
- uses Scrapling with `--ai-targeted`
- falls back to raw `curl` snapshot if Scrapling fails

Artifacts:
- `data/adaptor/runs/<timestamp>-<card-id>/run.json`
- `sources/*.md`
- `manifest.json`

### `extract --run <run-dir>`

Extracts candidate data from fetched source snapshots.

Current implementation:
- runs `normalize`
- runs `community-check`

Artifacts:
- `candidate.json`
- `community-check.json`
- `community-check.md`

Future target:
- replace static candidate extraction with deterministic extractor modules per source type
- keep LLM extraction behind an explicit `--llm` flag or separate reviewed pipeline

### `normalize --run <run-dir>`

Normalizes configured candidate data into production-shaped fields.

Artifacts:
- `candidate.json`

Notes:
- currently uses per-card config candidates
- keeps `AUTO_DATE` replacement deterministic

### `validate --run <run-dir>`

Runs safety checks and generates review artifacts.

Current implementation:
- runs `qa`
- runs `apply-plan`
- runs `review`

Artifacts:
- `qa-report.json`
- `apply-plan.json`
- `json-diff.json`
- `proposed-patch.json`
- `proposed-card.json`
- `review-report.md`
- `review-diff.md`

### `apply --run <run-dir> [--write]`

Applies a previously validated patch.

Safety:
- dry-run by default
- refuses `--write` when `can_apply` is false
- manual-review fields require valid `approval.json`

## Legacy Command Compatibility

These commands remain available for existing workflows:

```bash
run --card <card-id>
scrape --card <card-id>
community-check --run <run-dir>
qa --run <run-dir>
apply-plan --run <run-dir>
review --run <run-dir>
approval-template --run <run-dir>
run-all
review-index
```

## Artifact Model

Each run directory is append-only until `apply --write`.

```text
data/adaptor/runs/<run-id>/
  run.json
  manifest.json
  sources/*.md
  candidate.json
  community-check.json
  community-check.md
  qa-report.json
  apply-plan.json
  json-diff.json
  proposed-patch.json
  proposed-card.json
  review-report.md
  approval.json
```

## Source Priority

1. Issuer official page — canonical for terms, fees, earning, credits, restrictions
2. Doctor of Credit — best for current/elevated offers and offer history
3. US Credit Card Guide — efficient card-level summaries and Chinese-friendly context
4. Large editorial sites — secondary corroboration
5. Reddit/FlyerTalk/community — data points only, never canonical alone

## Field Policy v1

Auto-apply if QA passes:
- `annual_fee`
- `foreign_transaction_fee`
- `fhr_thc`

Manual review required:
- `welcome_offer`
- `earning_rates`
- `recurring_credits`
- `travel_benefits`
- `insurance` / nested travel insurance semantics

## Near-Term Roadmap

1. Convert `scripts/card-adaptor/index.ts` to a compiled single binary when stable.
2. Add source-type extractor modules: issuer, doc, usccg, doc, reddit.
3. Add schema validation for `scripts/card-adaptor/cards/*.json` configs.
4. Add `fetch <url>` generic mode for ad-hoc source inspection.
5. Add `diff --card <card-id>` to compare latest run against production.
6. Add release checksums if distributed outside the repo.
