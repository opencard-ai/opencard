#!/usr/bin/env python3
"""Apply v6 extraction results to cards."""
import json
from pathlib import Path

CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")

updated = 0
for ext_file in EXTRACTED_DIR.glob("*.json"):
    with open(ext_file) as f:
        ext = json.load(f)
    
    card_id = ext.get('card_id', '')
    fields = ext.get('fields', {})
    
    if not card_id or not fields or card_id == ext_file.stem:
        continue
    
    card_path = CARDS_DIR / f"{card_id}.json"
    if not card_path.exists():
        continue
    
    with open(card_path) as f:
        card = json.load(f)
    
    changes = []
    for key, value in fields.items():
        if value is not None and card.get(key) != value:
            card[key] = value
            changes.append(key)
    
    if changes:
        card['cfpb_source'] = 'Q3_2025'
        with open(card_path, 'w') as f:
            json.dump(card, f, indent=2)
        print(f"Updated {card_id}: {changes}")
        updated += 1

print(f"\nTotal updated: {updated}")
