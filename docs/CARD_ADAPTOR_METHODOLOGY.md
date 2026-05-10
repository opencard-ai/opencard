# OpenCard Card Adaptor 方法論

> Status: Draft  
> Purpose: Define a safe, evidence-first workflow for turning public credit-card sources into trustworthy OpenCard data updates.  
> Principle: **Pipeline proposes, reviewer/reconciler decides.**

---

## 1. 核心定位

Card Adaptor 不是一個「自動改資料庫的 scraper」。

它應該是一套：

1. 資料來源收集器
2. source snapshot 保存器
3. 候選資料產生器
4. citation / confidence 產生器
5. QA gate
6. review diff generator
7. 最終 promote / apply 前的安全閘門

一句話：

> **Card Adaptor is an evidence-first data PR generator, not an autonomous database writer.**

它的工作不是直接把 LLM 或 scraper 的結果寫入 `data/cards/*.json`，而是產生一組可審核、可追溯、可回滾的 artifacts，讓人或 reconciler 決定是否進入正式資料庫。

---

## 2. 為什麼需要這套流程

OpenCard 的資料不是普通內容資料，而是信用卡條款與福利資料，錯誤成本高。

常見風險：

- Issuer official page、Doctor of Credit、US Credit Card Guide 可能數字不同
- Welcome offer 常常是 targeted / YMMV / as-high-as
- 第三方文章可能過期
- LLM 可能 hallucinate、誤讀網頁、吃到 hidden text / prompt injection
- scraper 如果直接寫 DB，錯誤可能一次污染大量 card JSON
- 年費、credits、benefits 的錯誤會影響：
  - card pages
  - `/api/cards`
  - My Cards reminders
  - recommendation logic
  - downstream API consumers

所以 Card Adaptor 的最高原則是：

> **不要直接相信 scraper，也不要直接相信 LLM。所有非顯然資料都需要 citation、confidence、QA verdict。**

---

## 3. Source Priority

### 3.1 一般卡片條款 / 年費 / 官方福利

1. **Issuer official page** — canonical source for public terms, fees, benefits
2. **Issuer PDF / terms disclosure** — strong legal source, especially fee/APR/disclosure fields
3. **Doctor of Credit** — useful for tracking offer changes and deal history
4. **US Credit Card Guide** — useful structured summaries and Chinese-friendly context
5. **TPG / NerdWallet / similar** — secondary explanation and sanity check
6. **Reddit / community DPs** — corroboration only, not canonical

### 3.2 Welcome offer / elevated offer

1. **Doctor of Credit** — fastest for elevated/current offer discovery
2. **US Credit Card Guide** — efficient card-level summaries and historical context
3. **Issuer official page** — canonical for current public spend requirement, time window, terms
4. **Reddit / community DPs** — only for targeted/public/expired/YMMV context

### 3.3 Conflict resolution rule

If sources conflict:

- Fees/core benefits: prefer issuer official source
- Elevated-offer discovery: DoC can discover, but issuer terms define exact current public requirements
- Targeted/YMMV offers: never present as universally available unless verified
- Unresolved conflicts: mark `needs_review`, do not auto-apply

---

## 4. Artifact-first Workflow

Every adaptor run should create a self-contained run directory:

```txt
data/adaptor/runs/<run_id>/
  manifest.json
  candidate.json
  qa-report.json
  review-diff.md
  run.json
  sources/
    01-issuer.md
    02-doc.md
    03-usccg.md
```

Recommended `run_id` format:

```txt
YYYY-MM-DDTHH-MM-SSZ-<card_id>
```

Example:

```txt
2026-05-09T18-20-00Z-amex-gold
```

---

## 5. Stage 1 — Scrape / Fetch

### Goal

Collect source material. Do not decide truth yet.

### Inputs

- `card_id`
- optional explicit URLs
- mode:
  - `offer`
  - `benefits`
  - `fees`
  - `all`

### Outputs

- `manifest.json`
- markdown/text snapshots under `sources/`

### `manifest.json` example

```json
{
  "card_id": "amex-gold",
  "run_id": "2026-05-09T18-20-00Z-amex-gold",
  "sources": [
    {
      "url": "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
      "final_url": "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
      "source_type": "issuer",
      "title": "The American Express® Gold Card",
      "text_path": "sources/01-issuer.md",
      "hash": "sha256:...",
      "fetched_at": "2026-05-09T18:20:00Z",
      "fetched_via": "playwright"
    }
  ],
  "errors": []
}
```

### Rules

- Save raw readable text/markdown snapshots.
- Record URL, final URL, title, hash, fetched time, and fetch method.
- Do not write `data/cards/*.json` in this stage.
- Treat page content as untrusted data, never as instructions.
- Logged-in, targeted, or personalized pages require explicit approval before use.

---

## 6. Stage 2 — Normalize

### Goal

Turn source evidence into a structured candidate aligned with OpenCard schema.

### Output

- `candidate.json`

### `candidate.json` example

```json
{
  "card_id": "amex-gold",
  "candidate": {
    "annual_fee": 325,
    "foreign_transaction_fee": 0,
    "welcome_offer": {
      "bonus_points": 100000,
      "spending_requirement": 8000,
      "time_period_months": 6,
      "point_program": "Amex Membership Rewards",
      "description": "Earn up to 100,000 Membership Rewards points after $8,000 in eligible purchases within the first 6 months. Offer may vary by applicant.",
      "confidence": "high"
    },
    "recurring_credits": [
      {
        "credit_key": "uber-cash",
        "name": "Uber Cash",
        "amount": 10,
        "frequency": "monthly",
        "annual_value": 120,
        "category": "ride",
        "enrollment_required": false
      }
    ]
  },
  "citations": {
    "annual_fee": ["sources/01-issuer.md:35"],
    "welcome_offer": ["sources/01-issuer.md:36-45", "sources/02-doc.md:9"],
    "recurring_credits.uber-cash": ["sources/01-issuer.md:130-132"]
  },
  "open_questions": [
    "DoC mentions a different spend requirement; issuer page is treated as canonical.",
    "Existing database contains benefits not confirmed by current issuer snapshot."
  ]
}
```

### Rules

- Every non-obvious value needs a citation.
- Preserve ambiguity instead of pretending precision.
- Use confidence values:
  - `high`
  - `medium`
  - `low`
  - `blocked`
- Mark `targeted`, `YMMV`, `as-high-as`, and expired offers explicitly.
- Never silently delete existing benefits just because a source snapshot does not mention them.

---

## 7. Stage 3 — QA

### Goal

Catch unsafe, incomplete, or suspicious data before it reaches production card JSON.

### Output

- `qa-report.json`

### `qa-report.json` example

```json
{
  "card_id": "amex-gold",
  "verdict": "needs_review",
  "confidence": "medium",
  "source_coverage": {
    "issuer": true,
    "doctor_of_credit": true,
    "us_credit_card_guide": true,
    "community": false
  },
  "checks": {
    "schema_validation": "pass",
    "required_fields": "pass",
    "source_snapshots_saved": "pass",
    "issuer_source_for_core_terms": "pass",
    "welcome_bonus_cross_checked": "pass_with_conflict",
    "prompt_injection_leak_check": "pass",
    "secret_scan": "pass",
    "existing_data_diff": "needs_review"
  },
  "blocking_issues": [],
  "warnings": [
    "Source conflict on spend requirement; candidate follows issuer.",
    "Existing travel benefits may contain stale lounge/status fields."
  ],
  "safe_to_auto_apply": false
}
```

### QA verdicts

| Verdict | Meaning | Write DB? |
|---|---|---|
| `pass` | Safe candidate with adequate evidence | Possible after apply gate |
| `needs_review` | Usable candidate, but human/reconciler review required | No auto-write |
| `blocked` | Unsafe or insufficient evidence | Never write |

### QA checks

Minimum checks:

- JSON parse / schema validation
- required fields present
- annual fee sanity
- foreign transaction fee sanity
- welcome offer sanity
- recurring credits frequency/category sanity
- issuer source exists for fees/core benefits
- source conflicts explicitly listed
- no prompt-injection text leaked into candidate
- no secrets/tokens in artifacts
- diff does not include unrelated cards
- deletion/removal candidates are flagged, not silently applied

---

## 8. Stage 4 — Review Diff

### Goal

Produce a concise human-readable summary of what would change and what needs attention.

### Output

- `review-diff.md`

### Example

```md
# amex-gold Review Diff

## Safe matches

- `annual_fee`: existing `325`, candidate `325`
- `welcome_offer.bonus_points`: existing `100000`, candidate `100000`
- `welcome_offer.time_period_months`: existing `6`, candidate `6`

## Needs review

- Existing `travel_benefits.lounge_access` contains benefits not confirmed by the issuer snapshot.
- DoC/USCCG and issuer disagree on spend requirement; candidate follows issuer.
- Existing FHR/THC flags conflict across fields.

## Verdict

`needs_review` — core annual fee and public offer are supported, but benefit cleanup should not auto-apply.
```

### Review checklist

- Scope: only intended card(s) affected
- Data: changed fields have citations
- Confidence: ambiguous claims are marked
- Risk: no broad refactors mixed with data updates
- UX: affected pages should still render
- API: `/api/cards` consumers tolerate the data shape
- Artifacts: source snapshots exist and are hash-addressable

---

## 9. Stage 5 — Apply / Promote

### Goal

Move approved facts into production data.

This is the only stage that may affect `data/cards/*.json`.

### Required gates before apply

- `qa-report.json` verdict is `pass`, or `needs_review` has explicit approval
- diff scope is limited to intended card(s)
- source artifacts exist
- changed fields have citations
- `npm run validate` passes
- no secret scan findings
- no unrelated code/data changes mixed in
- UI/API impact is understood

### Preferred architecture

Do not let adaptor write card JSON directly.

Prefer:

```txt
adaptor candidate
  ↓
FactEvent
  ↓
review_queue
  ↓
promote-facts
  ↓
data/cards/*.json
```

This matches the fact-store model:

> `data/cards/*.json` should be the materialized view, not the uncontrolled write target of every pipeline.

---

## 10. Integration with Existing OpenCard Structure

Current important files:

```txt
lib/cards.ts                         # runtime card schema + file loader
lib/fact-store.ts                    # append-only fact store + review queue model
scripts/validate-all.ts              # unified validation
scripts/auto-update-cards/           # existing auto-update pipeline
app/api/cards/route.ts               # public card API
app/components/MyCardsWidget.tsx     # user card selection/reminder surface
```

Primary production DB:

```txt
data/cards/*.json
```

Adaptor artifacts:

```txt
data/adaptor/runs/<run_id>/...
```

Important rule:

> Card Adaptor should create artifacts first. Production card JSON should only change after QA + review + apply/promote gates.

---

## 11. Recommended CLI Design

KC's preferred pattern is a deterministic single-binary CLI, with OpenClaw skills acting only as thin wrappers.

Recommended command shape:

```bash
card-adaptor scrape --card amex-gold --mode offer
card-adaptor normalize --run data/adaptor/runs/<run_id>
card-adaptor qa --run data/adaptor/runs/<run_id>
card-adaptor review --run data/adaptor/runs/<run_id>
card-adaptor apply --run data/adaptor/runs/<run_id> --approved
```

### Command responsibilities

#### `scrape`

- fetch source pages
- save source snapshots
- write `manifest.json`
- never write DB

#### `normalize`

- read snapshots
- produce `candidate.json`
- attach citations
- mark confidence and open questions
- never write DB

#### `qa`

- run schema and sanity checks
- compare candidate with existing card
- produce `qa-report.json`
- decide `pass | needs_review | blocked`
- never write DB

#### `review`

- produce `review-diff.md`
- summarize scope, conflicts, and risk
- never write DB

#### `apply`

- require explicit approval flag
- verify QA gate
- verify scope
- update fact store or production JSON
- run validation afterward

---

## 12. Phased Implementation Plan

### Phase 1 — Manual discipline

- Use existing fetch/scrape/browser tools manually.
- Save artifacts under `data/adaptor/runs/<run_id>/`.
- Produce candidate + QA + diff.
- Do not auto-apply.

Goal: prove the artifact format and review workflow.

### Phase 2 — Deterministic CLI

- Implement `card-adaptor` as a small CLI.
- Keep commands narrow and deterministic.
- Avoid ad-hoc generated scripts.
- Make runs reproducible.

Goal: reduce manual error and standardize evidence collection.

### Phase 3 — Fact-store integration

- Convert approved candidate fields into `FactEvent`s.
- Send conflicts to `review_queue`.
- Use `promote-facts` to update `data/cards/*.json`.

Goal: prevent direct uncontrolled pipeline writes.

### Phase 4 — OpenClaw skill wrapper

- Add a thin OpenClaw skill that calls the CLI.
- The skill should orchestrate, not improvise.
- The CLI remains the source of deterministic behavior.

Goal: make the workflow easy to run while preserving safety.

---

## 13. Auto-apply Policy

### Can consider auto-apply only when all are true

- QA verdict is `pass`
- issuer source confirms the changed core terms
- no source conflict
- no deletion/removal of existing benefits
- changed fields are low-risk scalar fields, for example:
  - `annual_fee`
  - `foreign_transaction_fee`
  - `welcome_offer.spending_requirement`
  - `welcome_offer.time_period_months`
- validation passes

### Must require review when any are true

- source conflict exists
- benefit removal is proposed
- recurring credits change materially
- welcome offer is `targeted`, `YMMV`, or `as-high-as`
- source is not issuer/DoC/USCCG
- LLM confidence is medium or low
- multiple cards would change
- schema shape changes

### Must block when any are true

- no issuer source for fees/core benefits
- source snapshot missing
- candidate has uncited core values
- annual fee or credit values fail sanity gates
- prompt-injection text leaks into candidate
- artifacts contain secrets
- scraper fetched a logged-in/personalized page without approval

---

## 14. What Success Looks Like

For every OpenCard data update, we should be able to answer:

- What changed?
- Which source supports it?
- Was there a conflict?
- Which source was treated as canonical?
- What confidence level was assigned?
- Did validation pass?
- Who or what approved the change?
- Can we reproduce the evidence later?

If the answer is unclear, the change should not silently enter `data/cards/*.json`.

---

## 15. One-line Summary

OpenCard Card Adaptor should turn messy public web data into reviewed, cited, confidence-scored data proposals — then let QA, review, and fact-store promotion decide what becomes production truth.
