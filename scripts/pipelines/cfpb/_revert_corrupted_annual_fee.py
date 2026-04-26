#!/usr/bin/env python3
"""
One-shot revert script for the CFPB pipeline annual_fee corruption.

Background:
  scripts/pipelines/cfpb/schumer_extractor_v2.py:186-188 had a regex that
  matched "12 monthly billing cycles" boilerplate in Amex agreements and
  wrote that as `annual_fee`. Pipeline overwrote correct human-curated
  values for 24+ cards.

Strategy:
  Hardcoded known_correct map per card_id (sourced from issuer official
  pages + cross-referenced with pre-CFPB git snapshot at commit 8ed78fe).
  For each affected card:
    1. Replace annual_fee with known_correct value
    2. Remove cfpb_verified flag (since the value was a regex misfire)
    3. Add _revert_note (provenance trail)
    4. Mark _quarantine: true if we're not 100% sure

Run:
    python3 scripts/pipelines/cfpb/_revert_corrupted_annual_fee.py [--dry-run]

After running, review diffs with `git diff data/cards/` then commit.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

CARDS_DIR = Path(__file__).resolve().parents[3] / "data" / "cards"

# Known correct annual_fee values, verified against issuer official pages
# as of 2026-04-25.
#   - "fee" is the annual membership fee in USD
#   - "note" is a human-readable explanation of how this was verified
#   - "quarantine" is True when we want a human to double-check (e.g. SavorOne
#     where neither current nor pre-CFPB value matched issuer reality)
KNOWN_CORRECT = {
    "amex-bce":                   {"fee": 0,    "note": "Amex Blue Cash Everyday is no-annual-fee"},
    "amex-bcp":                   {"fee": 95,   "note": "Amex Blue Cash Preferred $95 (waived first year historically)"},
    "amex-delta-reserve":         {"fee": 650,  "note": "Delta SkyMiles Reserve $650"},
    "amex-everyday":              {"fee": 0,    "note": "Amex Everyday is no-annual-fee"},
    "amex-gold":                  {"fee": 325,  "note": "Amex Gold $325 after Oct 2024 refresh ($250 -> $325)"},
    "amex-hilton-honors-aspire":  {"fee": 550,  "note": "Hilton Aspire $550"},
    "amex-hilton-honors":         {"fee": 0,    "note": "Hilton Honors entry-level is no-annual-fee"},
    "amex-hilton-surpass":        {"fee": 150,  "note": "Hilton Surpass $150"},
    "amex-marriott-bevy":         {"fee": 250,  "note": "Marriott Bonvoy Bevy $250"},
    "amex-marriott-bonvoy-biz":   {"fee": 125,  "note": "Marriott Bonvoy Business $125"},
    "amex-platinum":              {"fee": 895,  "note": "Amex Platinum $895 after Oct 2025 refresh ($695 -> $895)"},
    "amex-plum":                  {"fee": 250,  "note": "Plum Card $250 (no AF first year)"},
    "centurion-card-amex":        {"fee": 5000, "note": "Centurion: $5000 initiation + $10000 annual; storing initiation year"},
    "chase-sapphire-reserve":     {"fee": 795,  "note": "CSR $795 after June 2025 refresh ($550 -> $795)"},
    "delta-skymiles-blue-amex":   {"fee": 0,    "note": "Delta SkyMiles Blue is no-annual-fee"},
    "hsbc-premier":               {"fee": 95,   "note": "HSBC Premier $95"},
    "penfed-platinum-rewards":    {"fee": 0,    "note": "PenFed Platinum Rewards is no-annual-fee"},
    "capital-one-savorone": {
        "fee": 0,
        "note": "Capital One SavorOne Cash Rewards is no-annual-fee. Pre-CFPB had $39 (also wrong).",
        "quarantine": True,
    },
    # Marriott Brilliant: current $895 IS correct (post 2025 refresh).
    # Don't revert. Pre-CFPB git was $650 which is stale.
    # Just remove cfpb_verified flag because we can't trust the pipeline's verification.
    "amex-marriott-brilliant":    {"fee": 895,  "note": "Marriott Brilliant $895 after 2025 refresh — current value correct, only stripping bogus cfpb_verified"},
}


def build_card_id_index() -> dict[str, Path]:
    """Build a {card_id: path} index since filename != card_id for some cards
    (e.g. centurion-card-amex lives in amex-centurion.json)."""
    index: dict[str, Path] = {}
    for path in sorted(CARDS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        cid = data.get("card_id")
        if cid:
            index[cid] = path
    return index


def main(dry_run: bool = False) -> int:
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    changes = []
    skipped = []
    index = build_card_id_index()

    for card_id, target in KNOWN_CORRECT.items():
        path = index.get(card_id)
        if path is None:
            skipped.append((card_id, "card_id not found in any data/cards/*.json"))
            continue

        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            skipped.append((card_id, f"bad json: {e}"))
            continue

        old_fee = data.get("annual_fee")
        new_fee = target["fee"]
        cfpb_verified_was = data.get("cfpb_verified", False)
        cfpb_source_was = data.get("cfpb_source")

        # If everything already matches and no cfpb flag, skip.
        already_clean = (
            old_fee == new_fee
            and not cfpb_verified_was
            and not cfpb_source_was
        )
        if already_clean:
            skipped.append((card_id, "already clean"))
            continue

        # Apply revert
        data["annual_fee"] = new_fee
        # Strip the bogus cfpb_verified flag (the value was wrong, not verified)
        data.pop("cfpb_verified", None)
        # Strip cfpb_source as well — pipeline did write it, but the data was wrong
        data.pop("cfpb_source", None)
        # Strip penalty_apr that the same pipeline wrote — same trust issue
        # (penalty_apr was 26.74 / 29.99 etc; might be right but came from same broken pipeline)
        # Decision: keep penalty_apr but flag it for re-verify
        if "penalty_apr" in data:
            data.setdefault("_unverified_fields", []).append("penalty_apr")

        # Add provenance trail
        revert_history = data.setdefault("_revert_history", [])
        revert_history.append({
            "field": "annual_fee",
            "old_value": old_fee,
            "new_value": new_fee,
            "reason": target["note"],
            "reverted_at": now,
            "reverted_by": "cfpb_pipeline_corruption_revert_2026-04-25",
        })

        # Quarantine flag for human review
        if target.get("quarantine"):
            data["_quarantine"] = True
            data.setdefault("_quarantine_reasons", []).append(
                f"annual_fee value uncertain after CFPB pipeline corruption: {target['note']}"
            )

        # Bump last_updated
        data["last_updated"] = now

        changes.append({
            "card_id": card_id,
            "old_fee": old_fee,
            "new_fee": new_fee,
            "had_cfpb_verified": cfpb_verified_was,
            "quarantine": bool(target.get("quarantine")),
        })

        if not dry_run:
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    # Report
    print(f"{'=' * 60}")
    print(f"CFPB annual_fee revert  ({'DRY RUN' if dry_run else 'APPLIED'})")
    print(f"{'=' * 60}")
    print(f"Changed: {len(changes)}")
    print()
    for c in changes:
        flag = "🟡 QUARANTINE" if c["quarantine"] else "✅"
        cfpb = "[was cfpb_verified]" if c["had_cfpb_verified"] else ""
        print(f"  {flag} {c['card_id']:35} {str(c['old_fee']):>5} → {c['new_fee']:>5}  {cfpb}")

    if skipped:
        print()
        print(f"Skipped: {len(skipped)}")
        for cid, reason in skipped:
            print(f"  - {cid}: {reason}")

    return 0


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    sys.exit(main(dry_run=dry))
