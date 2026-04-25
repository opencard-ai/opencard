#!/usr/bin/env python3
"""Extract remaining PDFs and apply to cards."""
import json
import subprocess
from pathlib import Path

CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED_DIR = CACHE_DIR / "extracted"
CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

REMAINING = [
    ("barclays-ubereats.pdf", "barclays-ubereats"),
    ("barclays-gap.pdf", "gap-brand-card"),
    ("usb-flex-rewards.pdf", "us-bank-flex-rewards"),
    ("usb-amex-card.pdf", "us-bank-amex"),
    ("sync-american-eagle.pdf", "american-eagle-visa"),
    ("sync-belk.pdf", "belk-rewards-mastercard"),
]

for pdf_name, card_id in REMAINING:
    pdf_path = CACHE_DIR / pdf_name
    if not pdf_path.exists():
        print(f"⚠️  {pdf_name}: not found")
        continue
    
    out_file = EXTRACTED_DIR / f"{card_id}.json"
    
    try:
        result = subprocess.run(
            ["python3", str(SCRIPT), str(pdf_path), card_id],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.stdout:
            data = json.loads(result.stdout)
            with open(out_file, "w") as f:
                json.dump(data, f, indent=2)
            fields = data.get("fields", {})
            print(f"✅ {card_id}: {list(fields.keys())}")
            
            # Apply to card
            card_path = CARDS_DIR / f"{card_id}.json"
            if card_path.exists() and fields:
                with open(card_path) as f:
                    card = json.load(f)
                for key, value in fields.items():
                    if value is not None and card.get(key) != value:
                        card[key] = value
                card["cfpb_source"] = "Q3_2025"
                with open(card_path, "w") as f:
                    json.dump(card, f, indent=2)
                print(f"   → Applied to {card_id}")
            elif not card_path.exists():
                print(f"   → Card not found in DB")
        else:
            print(f"❌ {card_id}: no output")
    except Exception as e:
        print(f"❌ {card_id}: {e}")
