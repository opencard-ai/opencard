#!/usr/bin/env python3
"""
=== ARCHIVED 2026-04-25 ===

This script was part of the CFPB pipeline that wrote `annual_fee: 12` to
Amex Platinum on 2026-04-25 (regex matched "12 monthly billing cycles" in
the Schumer Box text). The pipeline is disabled via _DISABLED.flag.

Preserved unmodified below for git-blame visibility. Do not call.

To replace this file's behaviour, see the rewrite plan in
docs/TAKEOVER_PLAN.md.
"""
import sys
print("[ARCHIVED] download_more.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# import subprocess
# import json
# from pathlib import Path
#
# CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
# SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")
#
# items = [
#     ("https://files.consumerfinance.gov/a/assets/credit-card-agreements/pdf/Q32025/PENTAGON_FEDERAL_CREDIT_UNION/PenFed_Pricing_Addendum_12.2024.pdf-256303.pdf", "penfed.pdf"),
# ]
#
# for url, filename in items:
#     path = CACHE_DIR / filename
#     if not path.exists():
#         subprocess.run(["curl", "-sL", "-o", str(path), url])
#
#     result = subprocess.run(
#         ["python3", str(SCRIPT), str(path), filename.replace(".pdf", "")],
#         capture_output=True,
#         text=True,
#         timeout=30
#     )
#     if result.stdout:
#         data = json.loads(result.stdout)
#         print(f"✅ {filename}: {data.get('fields', {})}")
#     else:
#         print(f"❌ {filename}: no output")
