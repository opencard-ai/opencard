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
print("[ARCHIVED] schumer_extractor_v2.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """
# CFPB Schumer Box Extractor v2
# Based on diagnosis from 2026-04-22
#
# Improvements:
# 1. Filter Spanish/Portuguese filings (Contrato_, _Spanish)
# 2. Extract canonical card name from PDF text (not filename)
# 3. Fuzzy match by issuer scope
# 4. Better deduplication
# """
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
#
# import json
# import os
# import re
# import sys
# from pathlib import Path
# from rapidfuzz import process, fuzz
# import hashlib
#
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
# CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
# EXTRACTED_DIR = CACHE_DIR / "extracted"
# EXTRACTED_DIR.mkdir(exist_ok=True)
#
# # ============== Spanish/Non-English Filter ==============
#
# def is_spanish_filing(filename: str, text: str = "") -> bool:
#     """Check if PDF is a Spanish/foreign language duplicate."""
#     name = filename.lower()
#
#     # Spanish filenames
#     if name.startswith('contrato_'):
#         return True
#     if name.startswith('contrato%5f'):  # URL-encoded
#         return True
#     if '_spanish.' in name or name.endswith('_spanish.pdf'):
#         return True
#     if '_portuguese.' in name or name.endswith('_portuguese.pdf'):
#         return True
#
#     # Check text content for Spanish
#     if text:
#         text_lower = text.lower()
#         spanish_indicators = ['contrato', 'tarjeta de crédito', 'cargo', 'anual', 'comisión']
#         matches = sum(1 for w in spanish_indicators if w in text_lower)
#         if matches >= 3:
#             return True
#
#     return False
#
# # ============== Canonical Name Extraction ==============
#
# def extract_canonical_name(text: str) -> str | None:
#     """Extract canonical card name from PDF text, not filename.
#
#     First looks at the first 2000 chars where card name is typically located.
#     """
#     if not text:
#         return None
#
#     head = text[:3000]
#     lines = head.split('\n')
#
#     # Pattern A: Card name on its own line before "Cardmember Agreement"
#     # Example: "American Express Gold Card\nCardmember Agreement"
#     for i, line in enumerate(lines[:20]):
#         line = line.strip()
#         if not line:
#             continue
#         # Check if next significant line is agreement type
#         for j in range(i+1, min(i+4, len(lines))):
#             next_line = lines[j].strip().lower()
#             if any(kw in next_line for kw in ['cardmember agreement', 'card agreement', 
#                                                'account agreement', 'pricing information']):
#                 # This looks like the canonical name
#                 if 5 < len(line) < 150 and not line.startswith('http'):
#                     return line
#                 break
#
#     # Pattern B: "Cardmember Agreement" followed by card name
#     # Example: "Cardmember Agreement\nThe Platinum Card"
#     for i, line in enumerate(lines[:20]):
#         line = lines[i].strip().lower()
#         if 'cardmember agreement' in line or 'card agreement' in line:
#             for j in range(i+1, min(i+5, len(lines))):
#                 next_line = lines[j].strip()
#                 if 5 < len(next_line) < 150:
#                     return next_line
#                     break
#
#     # Pattern C: Look for "Annual Fee" section and try to extract card name from nearby context
#     annual_match = re.search(r'(annual\s+(?:membership\s+)?fee)', head, re.I)
#     if annual_match:
#         start = max(0, annual_match.start() - 500)
#         context = head[start:annual_match.end()]
#         # Try to find card name in context
#         name_match = re.search(r'^([A-Z][^"\n]{10,100})', context, re.M)
#         if name_match:
#             return name_match.group(1).strip()
#
#     return None
#
# # ============== Issuer Detection ==============
#
# ISSUER_KEYWORDS = {
#     'chase': ['jpmorgan', 'chase'],
#     'amex': ['american express', 'amex'],
#     'citi': ['citi', 'citibank'],
#     'capital': ['capital one'],
#     'discover': ['discover'],
#     'barclays': ['barclays'],
#     'wells': ['wells fargo'],
#     'boa': ['bank of america', 'boa'],
#     'usbank': ['u.s. bank', 'us bank', 'u.s. bank'],
#     'hsbc': ['hsbc'],
#     'pnc': ['pnc'],
#     'penfed': ['penfed', 'pentagon federal'],
#     'navy': ['navy federal'],
#     'sync': ['synchrony'],
#     'apple': ['apple'],
# }
#
# def detect_issuer(text: str) -> str | None:
#     """Detect issuer from PDF text."""
#     if not text:
#         return None
#     text_lower = text.lower()[:2000]  # Only first 2000 chars
#
#     for issuer, keywords in ISSUER_KEYWORDS.items():
#         for kw in keywords:
#             if kw in text_lower:
#                 return issuer
#     return None
#
# # ============== Card Matching ==============
#
# def load_opencard_db() -> list[dict]:
#     """Load OpenCard database."""
#     cards = []
#     for f in CARDS_DIR.glob("*.json"):
#         with open(f) as fp:
#             card = json.load(fp)
#             cards.append(card)
#     return cards
#
# def match_card_to_opencard(pdf_name: str, pdf_issuer: str, opencard_db: list[dict]) -> tuple[str, float] | None:
#     """Match PDF canonical name to OpenCard using fuzzy matching, scoped by issuer."""
#     if not pdf_name or not pdf_issuer:
#         return None
#
#     # Find cards from same issuer
#     candidates = [c for c in opencard_db 
#                  if c.get('issuer', '').lower().replace(' ', '') == pdf_issuer.lower().replace(' ', '')]
#
#     if not candidates:
#         # Try partial match
#         candidates = [c for c in opencard_db 
#                      if pdf_issuer.lower() in c.get('issuer', '').lower() or
#                      c.get('issuer', '').lower() in pdf_issuer.lower()]
#
#     if not candidates:
#         return None
#
#     # Get names for matching
#     names = [(c['name'] if 'name' in c else c.get('card_id', '')) for c in candidates]
#
#     # Use token_sort_ratio for better handling of word order variations
#     match, score, idx = process.extractOne(
#         pdf_name,
#         names,
#         scorer=fuzz.token_sort_ratio
#     )
#
#     if score >= 75:  # Threshold for matching
#         return candidates[idx]['card_id'], score
#     return None
#
# # ============== Field Extraction ==============
#
# def extract_fields(text: str) -> dict:
#     """Extract Schumer Box fields from PDF text."""
#     fields = {}
#
#     # Annual Fee
#     fee_match = re.search(
#         r'(?:annual\s+(?:membership\s+)?fee|annual\s+fee|annual\s+membership)[\s:]*\$?([\d,]+)',
#         text, re.I
#     )
#     if fee_match:
#         try:
#             fields['annual_fee'] = int(fee_match.group(1).replace(',', ''))
#         except:
#             pass
#
#     # Foreign Transaction Fee
#     ftf_match = re.search(
#         r'(?:foreign\s+transaction\s+fee|transaction\s+fee\s+outside)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%',
#         text, re.I
#     )
#     if not ftf_match:
#         ftf_match = re.search(
#             r'(?:foreign)\s*(?:transaction\s+fee)?[\s:]*(\d+(?:\.\d+)?)\s*%',
#             text, re.I
#         )
#     if ftf_match:
#         try:
#             fields['foreign_transaction_fee'] = float(ftf_match.group(1))
#         except:
#             pass
#
#     # Cash Advance Fee (percentage)
#     ca_pct_match = re.search(
#         r'(?:cash\s+advance\s+(?:fee|transaction).*?)(\d+(?:\.\d+)?)\s*%',
#         text, re.I
#     )
#     if ca_pct_match:
#         try:
#             fields['cash_advance_fee_pct'] = float(ca_pct_match.group(1))
#         except:
#             pass
#
#     # Cash Advance Fee (flat)
#     ca_flat_match = re.search(
#         r'(?:cash\s+advance\s+(?:fee|flat|amount)).*?\$?([\d,]+)(?:\s*(?:dollar|flat|each))?',
#         text, re.I
#     )
#     if ca_flat_match:
#         try:
#             fields['cash_advance_fee_flat'] = int(ca_flat_match.group(1).replace(',', ''))
#         except:
#             pass
#
#     # Late Fee
#     late_match = re.search(
#         r'(?:late\s+(?:payment\s+)?fee|past\s+due)[\s:]*\$?([\d,]+)',
#         text, re.I
#     )
#     if late_match:
#         try:
#             fields['late_fee'] = int(late_match.group(1).replace(',', ''))
#         except:
#             pass
#
#     # APR for Purchases
#     apr_match = re.search(
#         r'(?:APR\s+for\s+(?:purchases|new\s+purchases)|(?:purchases|introductory)\s+APR)[\s:*]+(\d+(?:\.\d+)?)\s*%?(?:\s*-\s*(\d+(?:\.\d+)?)\s*%)?',
#         text, re.I
#     )
#     if apr_match:
#         try:
#             if apr_match.group(2):
#                 fields['apr_purchases_min'] = float(apr_match.group(1))
#                 fields['apr_purchases_max'] = float(apr_match.group(2))
#             else:
#                 fields['apr_purchases_min'] = float(apr_match.group(1))
#         except:
#             pass
#
#     # APR Cash Advances
#     apr_cash_match = re.search(
#         r'(?:APR\s+for\s+(?:cash\s+advances|balance\s+transfers)|cash\s+advance\s+APR)[\s:*]+(\d+(?:\.\d+)?)\s*%?(?:\s*-\s*(\d+(?:\.\d+)?)\s*%)?',
#         text, re.I
#     )
#     if apr_cash_match:
#         try:
#             fields['apr_cash_advances'] = float(apr_cash_match.group(1))
#         except:
#             pass
#
#     # Penalty APR
#     penalty_match = re.search(
#         r'(?:penalty\s+APR|default\s+APR|penalty\s+pricing)[\s:*]+(\d+(?:\.\d+)?)\s*%',
#         text, re.I
#     )
#     if penalty_match:
#         try:
#             fields['penalty_apr'] = float(penalty_match.group(1))
#         except:
#             pass
#
#     return fields
#
# # ============== PDF Processing ==============
#
# def process_pdf(pdf_path: Path) -> dict | None:
#     """Process a single PDF file."""
#     try:
#         import subprocess
#         result = subprocess.run(
#             ['python3', '-c', f'''
# import pdfplumber
# with pdfplumber.open("{pdf_path}") as pdf:
#     text = "\\n".join(p.extract_text() or "" for p in pdf.pages)
#     print(text[:5000], end="")
# '''],
#             capture_output=True, text=True, timeout=60
#         )
#         text = result.stdout
#
#         if not text or len(text) < 100:
#             return None
#
#         # Check for Spanish
#         if is_spanish_filing(pdf_path.name, text):
#             return None
#
#         # Extract canonical name
#         canonical_name = extract_canonical_name(text)
#
#         # Detect issuer
#         issuer = detect_issuer(text)
#
#         # Extract fields
#         fields = extract_fields(text)
#
#         return {
#             'name': canonical_name,
#             'issuer': issuer,
#             'fields': fields,
#             'text_preview': text[:500]
#         }
#     except Exception as e:
#         print(f"Error processing {pdf_path.name}: {e}", file=sys.stderr)
#         return None
#
# # ============== Main ==============
#
# def main():
#     """Main processing loop."""
#     # Load OpenCard DB
#     opencard_db = load_opencard_db()
#     print(f"Loaded {len(opencard_db)} cards from OpenCard DB")
#
#     # Get all PDFs
#     pdfs = list(CACHE_DIR.glob("*.pdf"))
#     print(f"Found {len(pdfs)} PDFs to process")
#
#     # Track results
#     processed = 0
#     matched = 0
#     extracted = 0
#     skipped_spanish = 0
#
#     for pdf_path in pdfs:
#         # Skip Spanish files
#         if is_spanish_filing(pdf_path.name):
#             skipped_spanish += 1
#             continue
#
#         # Process PDF
#         result = process_pdf(pdf_path)
#         processed += 1
#
#         if not result:
#             continue
#
#         # Match to OpenCard
#         card_id = None
#         if result['name'] and result['issuer']:
#             match_result = match_card_to_opencard(result['name'], result['issuer'], opencard_db)
#             if match_result:
#                 card_id, score = match_result
#                 print(f"✅ {pdf_path.stem[:50]} -> {card_id} (score: {score})")
#                 matched += 1
#
#         # Write result
#         output = {
#             'card_id': card_id or pdf_path.stem,
#             'source': 'cfpb_ccad_v2',
#             'canonical_name': result['name'],
#             'detected_issuer': result['issuer'],
#             'fields': result['fields'],
#             'text_preview': result['text_preview'][:500]
#         }
#
#         output_path = EXTRACTED_DIR / f"{pdf_path.stem}.json"
#         with open(output_path, 'w') as f:
#             json.dump(output, f, indent=2)
#
#         if result['fields']:
#             extracted += 1
#
#     print(f"\n=== Summary ===")
#     print(f"Processed: {processed}")
#     print(f"Skipped (Spanish): {skipped_spanish}")
#     print(f"Matched to OpenCard: {matched}")
#     print(f"Extracted fields: {extracted}")
#
# if __name__ == '__main__':
#     main()
