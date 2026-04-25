#!/usr/bin/env python3
import subprocess
import json
from pathlib import Path

CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

urls = [
    ("https://files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q32025/PNC_BANK_NATIONAL_ASSOCIATION/Agreement-Cash-Unlimited-Credit-Card_junepricing_R.pdf-476656.pdf", "pnc-cash-unlimited.pdf"),
    ("https://files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q32025/PNC_BANK_NATIONAL_ASSOCIATION/Agreement-Secured-Credit-Card_June_Pricing_R.pdf-476659.pdf", "pnc-secured.pdf"),
]

for url, filename in urls:
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
