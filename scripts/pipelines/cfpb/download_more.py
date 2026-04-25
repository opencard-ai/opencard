#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path

CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

items = [
    ("https://files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q32025/PENTAGON_FEDERAL_CREDIT_UNION/PenFed_Pricing_Addendum_12.2024.pdf-256303.pdf", "penfed.pdf"),
]

for url, filename in items:
    path = CACHE_DIR / filename
    if not path.exists():
        subprocess.run(["curl", "-sL", "-o", str(path), url])
    
    result = subprocess.run(
        ["python3", str(SCRIPT), str(path), filename.replace(".pdf", "")],
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.stdout:
        data = json.loads(result.stdout)
        print(f"✅ {filename}: {data.get('fields', {})}")
    else:
        print(f"❌ {filename}: no output")
