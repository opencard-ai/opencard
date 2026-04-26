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
print("[ARCHIVED] test_extractor.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Test v2 extractor on a small sample."""
# import pdfplumber
# import json
# import re
# from pathlib import Path
# from rapidfuzz import fuzz, process
#
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
# CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
# EXTRACTED_DIR = CACHE_DIR / "extracted"
#
# def is_spanish_filing(filename):
#     name = filename.lower()
#     return (
#         name.startswith('contrato_') or
#         name.startswith('contrato%5f') or
#         '_spanish.' in name or
#         name.endswith('_spanish.pdf')
#     )
#
# def extract_canonical_name(text):
#     if not text:
#         return None
#     head = text[:3000]
#
#     # Pattern: Look for card name before agreement type
#     patterns = [
#         r'^([A-Z][^\n]{5,100})\s*\n+\s*(?:Cardmember Agreement|Card\s*Agreement)',
#         r'(?:Cardmember Agreement|Card Agreement)\s*\n+\s*([A-Z][^\n]{5,100})',
#     ]
#     for pat in patterns:
#         m = re.search(pat, head, re.M | re.I)
#         if m:
#             return m.group(1).strip()
#     return None
#
# def load_cards():
#     cards = []
#     for f in CARDS_DIR.glob("*.json"):
#         with open(f) as fp:
#             card = json.load(fp)
#             cards.append(card)
#     return cards
#
# def main():
#     cards = load_cards()
#     print(f"Loaded {len(cards)} cards")
#
#     # Test on first 5 PDFs
#     pdfs = list(CACHE_DIR.glob("*.pdf"))[:5]
#
#     for pdf_path in pdfs:
#         if is_spanish_filing(pdf_path.name):
#             print(f"SKIP (Spanish): {pdf_path.name}")
#             continue
#
#         print(f"\nProcessing: {pdf_path.name}")
#
#         try:
#             with pdfplumber.open(pdf_path) as pdf:
#                 text = "\n".join(p.extract_text() or "" for p in pdf.pages)
#
#             if len(text) < 100:
#                 print("  -> Empty or too short")
#                 continue
#
#             name = extract_canonical_name(text)
#             print(f"  -> Canonical name: {name}")
#
#             # Try to match
#             if name:
#                 for c in cards[:10]:
#                     card_name = c.get('name', c.get('card_id', ''))
#                     score = fuzz.token_sort_ratio(name.lower(), card_name.lower())
#                     if score > 60:
#                         print(f"  -> Possible match: {card_name} (score: {score})")
#         except Exception as e:
#             print(f"  -> Error: {e}")
#
# if __name__ == '__main__':
#     main()
