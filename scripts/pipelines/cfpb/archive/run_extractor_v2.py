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
print("[ARCHIVED] run_extractor_v2.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """CFPB Extractor v2 - Direct version without subprocess."""
#
# # === Kill switch (added 2026-04-25 takeover) ===
# # This script writes to data/cards/. Until the CFPB pipeline rewrite
# # is done, it must not run. See docs/TAKEOVER_PLAN.md.
# import os, sys
# sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# from _killswitch import abort_if_disabled
# abort_if_disabled(__file__)
# # === end kill switch ===
#
# import pdfplumber
# import json
# import re
# from pathlib import Path
# from rapidfuzz import fuzz, process
#
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
# CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
# EXTRACTED_DIR = CACHE_DIR / "extracted"
# EXTRACTED_DIR.mkdir(exist_ok=True)
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
#     patterns = [
#         r'^([A-Z][^\n]{5,100})\s*\n+\s*(?:Cardmember Agreement|Card\s*Agreement)',
#         r'(?:Cardmember Agreement|Card Agreement|Pricing Information Table)\s*\n+\s*([A-Z][^\n]{5,100})',
#     ]
#     for pat in patterns:
#         m = re.search(pat, head, re.M | re.I)
#         if m:
#             return m.group(1).strip()
#     return None
#
# def detect_issuer(text):
#     if not text:
#         return None
#     text_lower = text.lower()[:2000]
#
#     keywords = {
#         'chase': ['jpmorgan', 'chase'],
#         'amex': ['american express', 'amex'],
#         'citi': ['citi', 'citibank'],
#         'capital': ['capital one'],
#         'discover': ['discover'],
#         'barclays': ['barclays'],
#         'wells': ['wells fargo'],
#         'boa': ['bank of america', 'boa'],
#         'usbank': ['u.s. bank', 'us bank'],
#         'hsbc': ['hsbc'],
#     }
#     for issuer, kws in keywords.items():
#         for kw in kws:
#             if kw in text_lower:
#                 return issuer
#     return None
#
# def extract_fields(text):
#     fields = {}
#
#     # Annual Fee
#     m = re.search(r'(?:annual\s+(?:membership\s+)?fee)[\s:]*\$?([\d,]+)', text, re.I)
#     if m:
#         try:
#             fields['annual_fee'] = int(m.group(1).replace(',', ''))
#         except: pass
#
#     # Foreign Transaction Fee
#     m = re.search(r'(?:foreign\s+transaction\s+fee)[\s:]*(\d+(?:\.\d+)?)\s*%', text, re.I)
#     if m:
#         try:
#             fields['foreign_transaction_fee'] = float(m.group(1))
#         except: pass
#
#     # Cash Advance Fee %
#     m = re.search(r'(?:cash\s+advance\s+fee).*?(\d+(?:\.\d+)?)\s*%', text, re.I)
#     if m:
#         try:
#             fields['cash_advance_fee_pct'] = float(m.group(1))
#         except: pass
#
#     # Late Fee
#     m = re.search(r'(?:late\s+(?:payment\s+)?fee)[\s:]*\$?([\d,]+)', text, re.I)
#     if m:
#         try:
#             fields['late_fee'] = int(m.group(1).replace(',', ''))
#         except: pass
#
#     # Penalty APR
#     m = re.search(r'(?:penalty\s+APR|default\s+APR)[\s:]*(\d+(?:\.\d+)?)\s*%', text, re.I)
#     if m:
#         try:
#             fields['penalty_apr'] = float(m.group(1))
#         except: pass
#
#     return fields
#
# def load_cards():
#     cards = []
#     for f in CARDS_DIR.glob("*.json"):
#         with open(f) as fp:
#             cards.append(json.load(fp))
#     return cards
#
# def main():
#     cards = load_cards()
#     print(f"Loaded {len(cards)} cards from OpenCard")
#
#     pdfs = list(CACHE_DIR.glob("*.pdf"))
#     print(f"Found {len(pdfs)} PDFs\n")
#
#     processed = skipped = matched = extracted = 0
#
#     for pdf_path in pdfs:
#         if is_spanish_filing(pdf_path.name):
#             skipped += 1
#             continue
#
#         try:
#             with pdfplumber.open(pdf_path) as pdf:
#                 text = "\n".join(p.extract_text() or "" for p in pdf.pages)
#         except Exception as e:
#             print(f"ERROR {pdf_path.name}: {e}")
#             continue
#
#         if len(text) < 100:
#             continue
#
#         processed += 1
#
#         canonical = extract_canonical_name(text)
#         issuer = detect_issuer(text)
#         fields = extract_fields(text)
#
#         # Try to match
#         card_id = None
#         if canonical and issuer:
#             issuer_cards = [c for c in cards if issuer in c.get('issuer', '').lower()]
#             if issuer_cards:
#                 names = [c.get('name', c.get('card_id', '')) for c in issuer_cards]
#                 match, score, _ = process.extractOne(canonical, names, scorer=fuzz.token_sort_ratio)
#                 if score >= 70:
#                     card_id = issuer_cards[score == max(fuzz.token_sort_ratio(canonical, n) for n in names)]['card_id']
#                     print(f"MATCH {pdf_path.name[:40]} -> {card_id} (score: {score})")
#                     matched += 1
#
#         # Save result
#         result = {
#             'card_id': card_id or pdf_path.stem,
#             'source': 'cfpb_ccad_v2',
#             'canonical_name': canonical,
#             'detected_issuer': issuer,
#             'fields': fields,
#         }
#
#         with open(EXTRACTED_DIR / f"{pdf_path.stem}.json", 'w') as f:
#             json.dump(result, f, indent=2)
#
#         if fields:
#             extracted += 1
#
#     print(f"\n=== Results ===")
#     print(f"Processed: {processed}")
#     print(f"Skipped (Spanish): {skipped}")
#     print(f"Matched: {matched}")
#     print(f"Extracted fields: {extracted}")
#
# if __name__ == '__main__':
#     main()
