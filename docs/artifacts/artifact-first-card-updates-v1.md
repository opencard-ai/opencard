# Artifact-first Card Updates v1

OpenCard catalog updates should be reviewable before they mutate production card data.

This applies to Card Adaptor Phase 2, CFPB rewrite, issuer-page benefit extraction, offer watchers, recurring-credit updaters, and cron jobs that propose changes to card metadata.

## Principle

Crawlers, LLM extractors, and scheduled jobs should not directly edit the card catalog. They should produce an artifact that can be validated, reviewed, approved, and then applied.

Recommended flow:

```txt
fetch -> extract -> artifact -> QA/review -> apply -> audit trail
```

## Artifact JSON shape

```json
{
  "artifact_version": "1.0",
  "artifact_type": "card_update",
  "card_id": "chase-sapphire-reserve",
  "run_id": "2026-05-27T21:00:00Z__issuer-benefit-adaptor",
  "created_at": "2026-05-27T21:00:00Z",
  "source": {
    "url": "https://www.example.com/card/terms",
    "source_type": "issuer",
    "source_name": "Issuer product page",
    "fetched_at": "2026-05-27T21:00:00Z",
    "snapshot_path": "artifacts/snapshots/2026-05-27/chase-sapphire-reserve.html",
    "content_hash": "sha256:..."
  },
  "extracted": {
    "fields": {
      "annual_fee": {
        "value": 695,
        "currency": "USD",
        "confidence": 0.98,
        "citation": "Annual Membership Fee: $695"
      },
      "benefits.recurring_credits.travel_credit": {
        "value": {
          "amount": 300,
          "currency": "USD",
          "frequency": "cardmember_year"
        },
        "confidence": 0.92,
        "citation": "$300 Annual Travel Credit..."
      }
    }
  },
  "diff": {
    "summary": "No annual fee change; travel credit frequency clarified.",
    "changes": [
      {
        "path": "benefits.recurring_credits.travel_credit.frequency",
        "before": "annual",
        "after": "cardmember_year",
        "risk": "medium"
      }
    ]
  },
  "risk_flags": ["money_field_changed"],
  "review": {
    "status": "pending",
    "reviewer": null,
    "reviewed_at": null,
    "notes": null
  }
}
```

## Required top-level fields

- `artifact_version`
- `artifact_type`
- `card_id`
- `run_id`
- `created_at`
- `source`
- `extracted`
- `diff`
- `risk_flags`
- `review`

## Source type taxonomy

Use one of:

- `issuer` — official issuer card page, pricing terms, guide to benefits, or application page
- `cfpb` — CFPB public credit card data
- `network` — Visa/Mastercard/Amex network benefit terms
- `doctor_of_credit` — third-party offer tracking
- `us_credit_card_guide` — third-party card/offer summary
- `manual` — human-authored artifact
- `other_third_party` — fallback; should normally require manual review

## Review policy

### Auto-approval candidate

An artifact may be auto-approved only if all are true:

- source type is `issuer`, `cfpb`, or `network`
- snapshot path and content hash exist
- schema validation passes
- all changed fields have confidence >= 0.9
- no high-risk field changed
- diff touches a small bounded set of fields
- citations are present for every changed field

### Manual review required

Manual review is required if any are true:

- annual fee changed
- welcome bonus amount, spend requirement, or deadline changed
- recurring credit amount/frequency/merchant eligibility changed
- APR, fee, penalty, or legally sensitive term changed
- source is third-party only
- source conflicts with current catalog or another artifact
- confidence < 0.9 on any changed field
- artifact changes more than one card
- extraction used OCR or image-only source

### Never auto-apply

Do not auto-apply artifacts based on:

- targeted or personalized offers
- logged-in-only pages
- screenshots without a stable public source
- forum/social posts as sole source
- low-confidence OCR
- missing citations
- missing snapshots

## Suggested file layout

```txt
artifacts/
  card-updates/
    pending/
    approved/
    rejected/
    applied/
  snapshots/
    YYYY-MM-DD/
  reviews/
```

## Commands to add later

```bash
opencard-artifact validate <artifact.json>
opencard-artifact review <artifact.json>
opencard-artifact approve <artifact.json> --reviewer <name>
opencard-artifact apply <artifact.json> --dry-run
opencard-artifact apply <artifact.json>
```

## Phase 2 implementation sequence

1. Define a TypeScript type and JSON schema for artifacts.
2. Make Card Adaptor Phase 2 write artifacts only.
3. Add validation and diff rendering.
4. Add a dry-run apply command.
5. Only then allow approved artifacts to mutate catalog files.
