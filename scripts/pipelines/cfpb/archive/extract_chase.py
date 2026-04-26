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
print("[ARCHIVED] extract_chase.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# import subprocess
# import json
# from pathlib import Path
#
# CACHE = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
# EXTRACTED = CACHE / "extracted"
# SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")
#
# pdfs = [
#     "chase-sapphire-preferred.pdf",
#     "chase-freedom-unlimited.pdf",
#     "chase-freedom-5-cash-back.pdf",
#     "chase-col-271327.pdf",
# ]
#
# for pdf_name in pdfs:
#     pdf_path = CACHE / pdf_name
#     card_id = pdf_name.replace(".pdf", "")
#     out_path = EXTRACTED / f"{card_id}.json"
#
#     if out_path.exists():
#         print(f"⏭️  {card_id}: already extracted")
#         continue
#
#     result = subprocess.run(
#         ["python3", str(SCRIPT), str(pdf_path), card_id],
#         capture_output=True, text=True, timeout=30
#     )
#     if result.stdout:
#         data = json.loads(result.stdout)
#         with open(out_path, "w") as f:
#             json.dump(data, f, indent=2)
#         print(f"✅ {card_id}: {data.get('fields', {})}")
#     else:
#         print(f"❌ {card_id}: no output")
