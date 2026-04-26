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
print("[ARCHIVED] process_wf.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Process newly downloaded Wells Fargo PDFs."""
# import pdfplumber
# import json
# import re
# from pathlib import Path
#
# EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")
#
# def extract_fields(text):
#     fields = {}
#
#     # Annual Fee - simplified pattern
#     m = re.search(r'annual.{0,20}fee.*?\$?([\d,]+)', text, re.I)
#     if m:
#         try:
#             fields['annual_fee'] = int(m.group(1).replace(',', ''))
#         except: pass
#
#     # Foreign Transaction Fee
#     m = re.search(r'foreign.{0,30}fee.*?(\d+(?:\.\d+)?)\s*%', text, re.I)
#     if m:
#         try:
#             fields['foreign_transaction_fee'] = float(m.group(1))
#         except: pass
#
#     # Late Fee
#     m = re.search(r'late.{0,20}fee.*?\$?([\d,]+)', text, re.I)
#     if m:
#         try:
#             fields['late_fee'] = int(m.group(1).replace(',', ''))
#         except: pass
#
#     # Penalty APR
#     m = re.search(r'penalty.{0,10}APR.*?(\d+(?:\.\d+)?)\s*%', text, re.I)
#     if m:
#         try:
#             fields['penalty_apr'] = float(m.group(1))
#         except: pass
#
#     return fields
#
# def main():
#     pdfs = [
#         ('wf-active-cash.pdf', 'wells-fargo-active-cash'),
#         ('wf-autograph.pdf', 'wells-fargo-autograph'),
#     ]
#
#     cache_dir = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
#
#     for pdf_file, card_id in pdfs:
#         pdf_path = cache_dir / pdf_file
#         print(f"Processing {pdf_file}...")
#
#         try:
#             with pdfplumber.open(pdf_path) as pdf:
#                 text = "\n".join(p.extract_text() or "" for p in pdf.pages)
#         except Exception as e:
#             print(f"  Error: {e}")
#             continue
#
#         if len(text) < 100:
#             print(f"  Too short: {len(text)} chars")
#             continue
#
#         fields = extract_fields(text)
#         print(f"  Fields: {fields}")
#
#         result = {
#             'card_id': card_id,
#             'source': 'cfpb_ccad_v2',
#             'detected_issuer': 'wells',
#             'fields': fields,
#         }
#
#         with open(EXTRACTED_DIR / f"{card_id}.json", 'w') as f:
#             json.dump(result, f, indent=2)
#
#         print(f"  Saved to {card_id}.json")
#
# if __name__ == '__main__':
#     main()
