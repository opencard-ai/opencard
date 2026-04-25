#!/usr/bin/env python3
"""Apply extracted CFPB data to card JSON files."""
import json
from pathlib import Path

EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")
CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")

def main():
    updated = 0
    for extracted_file in EXTRACTED_DIR.glob("*.json"):
        card_id = extracted_file.stem
        card_path = CARDS_DIR / f"{card_id}.json"
        
        if not card_path.exists():
            print(f"⚠️  {card_id}: card not found")
            continue
        
        with open(extracted_file) as f:
            cfpb_data = json.load(f)
        
        with open(card_path) as f:
            card = json.load(f)
        
        fields = cfpb_data.get("fields", {})
        changes = []
        
        for key, value in fields.items():
            if value is not None and card.get(key) != value:
                old = card.get(key)
                card[key] = value
                changes.append(f"  {key}: {old} → {value}")
        
        if changes:
            card["cfpb_source"] = "Q3_2025"
            card["cfpb_verified"] = True
            
            with open(card_path, "w") as f:
                json.dump(card, f, indent=2, ensure_ascii=False)
            
            print(f"✅ {card_id}:")
            for c in changes:
                print(c)
            updated += 1
    
    print(f"\nUpdated {updated} cards")

if __name__ == "__main__":
    main()
