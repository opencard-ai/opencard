#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path

CACHE = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED = CACHE / "extracted"
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

pdfs = [
    "chase-sapphire-preferred.pdf",
    "chase-freedom-unlimited.pdf",
    "chase-freedom-5-cash-back.pdf",
    "chase-col-271327.pdf",
]

for pdf_name in pdfs:
    pdf_path = CACHE / pdf_name
    card_id = pdf_name.replace(".pdf", "")
    out_path = EXTRACTED / f"{card_id}.json"
    
    if out_path.exists():
        print(f"⏭️  {card_id}: already extracted")
        continue
    
    result = subprocess.run(
        ["python3", str(SCRIPT), str(pdf_path), card_id],
        capture_output=True, text=True, timeout=30
    )
    if result.stdout:
        data = json.loads(result.stdout)
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"✅ {card_id}: {data.get('fields', {})}")
    else:
        print(f"❌ {card_id}: no output")
