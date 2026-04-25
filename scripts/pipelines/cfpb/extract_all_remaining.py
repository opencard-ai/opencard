#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path

CACHE = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED = CACHE / "extracted"
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

# Extract all remaining PDFs
for pdf_name in CACHE.glob("*.pdf"):
    card_id = pdf_name.stem
    out_path = EXTRACTED / f"{card_id}.json"
    
    if out_path.exists():
        continue
    
    result = subprocess.run(
        ["python3", str(SCRIPT), str(pdf_name), card_id],
        capture_output=True, text=True, timeout=30
    )
    if result.stdout:
        try:
            data = json.loads(result.stdout)
            with open(out_path, "w") as f:
                json.dump(data, f, indent=2)
            fields = data.get("fields", {})
            if fields:
                print(f"✅ {card_id}: {fields}")
            else:
                print(f"⏭️  {card_id}: no fields")
        except:
            print(f"❌ {card_id}: parse error")
    else:
        print(f"❌ {card_id}: no output")
