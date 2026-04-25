#!/usr/bin/env python3
"""Extract remaining PDFs that weren't processed yet."""
import json
import subprocess
from pathlib import Path

CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED_DIR = CACHE_DIR / "extracted"
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

REMAINING = [
    ("discover-it.pdf", "discover-it"),
    ("boa-platinum.pdf", "boa-platinum"),
    ("boa-secured.pdf", "boa-secured"),
    ("capital-one-secure.pdf", "capital-one-secure"),
    ("citi-aadvantage-executive-pricing.pdf", "citi-aadvantage-executive"),
    ("citi-custom-cash-pricing.pdf", "citi-custom-cash"),
    ("citi-diamond-preferred-pricing.pdf", "citi-diamond-preferred"),
    ("citi-double-cash-pricing.pdf", "citi-double-cash"),
    ("citi-simplicity-pricing.pdf", "citi-simplicity"),
    ("citi-strata-premier-pricing.pdf", "citi-strata-premier"),
    ("wf-active-cash.pdf", "wf-active-cash"),
    ("wf-autograph.pdf", "wf-autograph"),
    ("wf-reflect.pdf", "wf-reflect"),
]

for pdf_name, card_id in REMAINING:
    pdf_path = CACHE_DIR / pdf_name
    if not pdf_path.exists():
        print(f"⚠️  {pdf_name}: not found")
        continue
    
    out_file = EXTRACTED_DIR / f"{card_id}.json"
    if out_file.exists():
        print(f"⏭️  {card_id}: already extracted")
        continue
    
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
        else:
            print(f"❌ {card_id}: no output")
    except Exception as e:
        print(f"❌ {card_id}: {e}")
