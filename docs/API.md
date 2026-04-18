# OpenCard AI — Public API

Free, open API for AI agents and developers to access our credit card database.

> **Status**: Public Beta — no API key required.

---

## Base URL

```
https://opencardai.com/api
```

---

## Endpoints

### `GET /api/cards`

Returns credit cards grouped by issuer.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `full` | `1` or absent | absent | Set `full=1` to return complete card data |
| `issuer` | string | all | Filter by issuer name (e.g., `Chase`, `American Express`) |
| `card_id` | string | all | Get a single card by its ID |

**Example 1 — List all cards (summary):**
```bash
curl https://opencardai.com/api/cards
```

**Example 2 — Full data for all cards:**
```bash
curl "https://opencardai.com/api/cards?full=1"
```

**Example 3 — Filter by issuer:**
```bash
curl "https://opencardai.com/api/cards?issuer=Chase&full=1"
```

**Example 4 — Get single card:**
```bash
curl "https://opencardai.com/api/cards?card_id=chase-sapphire-reserve&full=1"
```

**Example 5 — AI Agent usage (Python):**
```python
import urllib.request, json

url = "https://opencardai.com/api/cards?issuer=American+Express&full=1"
with urllib.request.urlopen(url) as r:
    cards = json.loads(r.read())
    for card in cards:
        print(card["name"], card.get("annual_fee", 0))
```

---

## Response Shape

**Summary mode** (default, no `full` param):
```json
[
  {
    "issuer": "American Express",
    "cards": [
      { "card_id": "amex-platinum", "name": "The Platinum Card", "annual_fee": 695, "issuer": "American Express" }
    ]
  }
]
```

**Full mode** (`full=1`):
```json
[
  {
    "card_id": "amex-platinum",
    "name": "The Platinum Card",
    "issuer": "American Express",
    "network": "American Express",
    "annual_fee": 695,
    "foreign_transaction_fee": 0,
    "credit_required": "Excellent",
    "welcome_offer": { "bonus_points": 80000, "estimated_value": 1600, ... },
    "earning_rates": [ { "category": "all", "rate": 1 }, ... ],
    "annual_credits": [ { "name": "$200 Airline Fee Credit", "amount": 200, ... } ],
    "recurring_credits": [ { "name": "$200 Airline Fee Credit", "amount": 200, "frequency": "annual", "reset_type": "calendar_year", ... } ],
    "travel_benefits": { "lounge_access": [...], "hotel_status": [...] },
    "insurance": { "trip_cancellation": true, "rental_insurance": "Primary", ... },
    "hotel_program": { "program": "Marriott Bonvoy", "free_night_award": true, ... },
    "tags": ["premium", "travel", "rewards"],
    "last_updated": "2026-04-17",
    "status": "active"
  }
]
```

---

## Card ID Reference

Card IDs are slug-style strings. Common examples:

| Card Name | Card ID |
|-----------|---------|
| Amex Platinum | `amex-platinum` |
| Chase Sapphire Reserve | `chase-sapphire-reserve` |
| Capital One Venture X | `capital-one-venture-x` |
| Citi Premier | `citi-premier` |
| Wells Fargo Autograph | `wells-fargo-autograph` |

Find the ID for any card:
```bash
curl "https://opencardai.com/api/cards?issuer=Chase" | jq '.[] | .cards[] | {name, card_id}'
```

---

## Data Freshness

- Database updated: **2026-04-17**
- Total cards: **326** across **26 issuers**
- Coverage: US credit cards with full reward details

---

## Limits

- **Rate**: ~unlimited for normal use. Please be reasonable (no continuous polling).
- **Use case**: AI agents, personal tools, research. Not for commercial scraping.

---

## Report Errors

Found incorrect data? Email: **opencard@agentmail.to**
