#!/usr/bin/env python3
"""
Integrate CFPB extracted Schumer Box data into card JSON files.
Usage: python3 integrate_to_cards.py <card_id> <cfpb_json_file>
"""
import json
import sys
import os
from pathlib import Path

def update_card_with_cfpb(card_id: str, cfpb_data: dict, dry_run: bool = True):
    """Update a card JSON file with CFPB extracted data."""
    
    # Find the card JSON file
    cards_dir = Path(__file__).parent.parent.parent / "data" / "cards"
    card_path = cards_dir / f"{card_id}.json"
    
    if not card_path.exists():
        print(f"❌ Card not found: {card_path}")
        return False
    
    # Load existing card data
    with open(card_path, "r") as f:
        card = json.load(f)
    
    # Build cfpb data section
    cfpb_fields = cfpb_data.get("fields", {})
    
    if dry_run:
        print(f"📝 [{card_id}] Would update:")
    else:
        print(f"✅ [{card_id}] Updating:")
    
    # Track changes
    changes = []
    
    # Map CFPB fields to card fields
    field_mapping = {
        "annual_fee": "annual_fee",
        "foreign_transaction_fee": "foreign_transaction_fee",
        "late_fee": "late_fee",
        "cash_advance_fee_flat": "cash_advance_fee_flat",
        "cash_advance_fee_pct": "cash_advance_fee_pct",
        "apr_purchases_min": "apr_purchases_min",
        "apr_purchases_max": "apr_purchases_max",
        "apr_cash_advances": "apr_cash_advances",
        "penalty_apr": "penalty_apr",
    }
    
    # Initialize cfpb_data section if not exists
    if "cfpb_data" not in card:
        card["cfpb_data"] = {}
    
    for cfpb_key, card_key in field_mapping.items():
        if cfpb_key in cfpb_fields:
            old_val = card.get(card_key)
            new_val = cfpb_fields[cfpb_key]
            card[card_key] = new_val
            card["cfpb_data"][card_key] = {
                "value": new_val,
                "source": "cfpb_ccad",
                "quarter": "Q3_2025",
                "content_hash": cfpb_data.get("content_hash"),
                "fetched_at": cfpb_data.get("fetched_at")
            }
            changes.append(f"  {card_key}: {old_val} → {new_val}")
    
    if not changes:
        print("  No changes needed")
        return True
    
    for change in changes:
        print(change)
    
    if not dry_run:
        # Update last_verified
        card["last_verified"] = cfpb_data.get("fetched_at", "")[:10]
        
        with open(card_path, "w") as f:
            json.dump(card, f, indent=2, ensure_ascii=False)
        print(f"  ✓ Saved to {card_path.name}")
    
    return True


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 integrate_to_cards.py <card_id> <cfpb_json_file> [--apply]")
        print("  Use --apply to actually write changes (dry run by default)")
        sys.exit(1)
    
    card_id = sys.argv[1]
    cfpb_file = sys.argv[2]
    dry_run = "--apply" not in sys.argv
    
    # Load CFPB data
    with open(cfpb_file, "r") as f:
        cfpb_data = json.load(f)
    
    update_card_with_cfpb(card_id, cfpb_data, dry_run=dry_run)


if __name__ == "__main__":
    main()
