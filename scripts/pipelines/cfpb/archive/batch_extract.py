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
print("[ARCHIVED] batch_extract.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Batch extract Schumer Box from all PDFs in a directory"""
# import json
# import os
# import sys
# from pathlib import Path
#
# # Add parent to path
# sys.path.insert(0, str(Path(__file__).parent.parent.parent))
# from scripts.pipelines.cfpb.schumer_extractor import extract
#
# def main():
#     cache_dir = Path(__file__).parent.parent.parent / "data" / "cfpb-cache"
#     results = []
#
#     for pdf_path in sorted(cache_dir.glob("amex-*.pdf")):
#         card_id = pdf_path.stem.replace(".pdf", "").replace("-card-cardmember-agreement", "").replace("-american-express", "").replace("-express-card", "")
#         try:
#             result = extract(str(pdf_path), card_id)
#             fee = result["fields"].get("annual_fee", "N/A")
#             ftf = result["fields"].get("foreign_transaction_fee", "N/A")
#             print(f"{card_id}: fee=${fee}, ftf={ftf}")
#             results.append(result)
#         except Exception as e:
#             print(f"{card_id}: ERROR - {e}")
#
#     # Save all results
#     output_path = cache_dir / "amex-results.json"
#     with open(output_path, "w") as f:
#         json.dump(results, f, indent=2)
#     print(f"\nSaved {len(results)} results to {output_path}")
#
# if __name__ == "__main__":
#     main()
