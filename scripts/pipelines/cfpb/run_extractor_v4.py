#!/usr/bin/env python3
"""CFPB Extractor v4 - Fixed matching logic."""
import pdfplumber
import json
import re
from pathlib import Path
from rapidfuzz import fuzz, process

CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED_DIR = CACHE_DIR / "extracted"
EXTRACTED_DIR.mkdir(exist_ok=True)

ISSUER_MAP = {
    'amex': 'American Express',
    'chase': 'Chase',
    'citi': 'Citi',
    'capital': 'Capital One',
    'discover': 'Discover',
    'barclays': 'Barclays',
    'wells': 'Wells Fargo',
    'boa': 'Bank of America',
    'usbank': 'U.S. Bank',
    'hsbc': 'HSBC',
}

def is_spanish_filing(filename):
    name = filename.lower()
    return (
        name.startswith('contrato_') or
        name.startswith('contrato%5f') or
        '_spanish.' in name or
        name.endswith('_spanish.pdf')
    )

def extract_canonical_name(text):
    if not text:
        return None
    head = text[:3000]
    lines = [l.strip() for l in head.split('\n') if l.strip()]
    
    for i, line in enumerate(lines[:15]):
        if any(kw in line.lower() for kw in ['rates and fees', 'interest rates', 'pricing information']):
            if i > 0:
                prev = lines[i-1]
                if 5 < len(prev) < 100 and not prev.startswith('http') and not prev.startswith('ID '):
                    return re.sub(r'[®™]', '', prev).strip()
    
    for i, line in enumerate(lines[:20]):
        if 'cardmember agreement' in line.lower() or 'card agreement' in line.lower():
            for j in range(i+1, min(i+5, len(lines))):
                next_line = lines[j]
                if 5 < len(next_line) < 100:
                    return re.sub(r'[®™]', '', next_line).strip()
    
    for i, line in enumerate(lines[:20]):
        if line.startswith('Issuer:'):
            for j in range(i+1, min(i+4, len(lines))):
                next_line = lines[j]
                if 5 < len(next_line) < 100 and not next_line.startswith('http'):
                    return re.sub(r'[®™]', '', next_line).strip()
    
    return None

def detect_issuer(text):
    if not text:
        return None
    text_lower = text.lower()[:3000]
    
    checks = [
        ('amex', ['american express', 'amex', 'americanexpress']),
        ('chase', ['jpmorgan', 'chase bank', 'jpmorgan chase']),
        ('citi', ['citibank', 'citi ']),
        ('capital', ['capital one']),
        ('discover', ['discover bank']),
        ('barclays', ['barclays bank', 'barclays']),
        ('wells', ['wells fargo']),
        ('boa', ['bank of america', 'boa']),
        ('usbank', ['u.s. bank', 'us bank']),
        ('hsbc', ['hsbc']),
    ]
    
    for issuer, keywords in checks:
        for kw in keywords:
            if kw in text_lower:
                return issuer
    return None

def extract_fields(text):
    fields = {}
    
    m = re.search(r'(?:annual\s+(?:membership\s+)?fee)[\s:]*\$?([\d,]+)', text, re.I)
    if m:
        try:
            fields['annual_fee'] = int(m.group(1).replace(',', ''))
        except: pass
    
    m = re.search(r'(?:foreign\s+transaction\s+fee)[\s:]*(\d+(?:\.\d+)?)\s*%', text, re.I)
    if m:
        try:
            fields['foreign_transaction_fee'] = float(m.group(1))
        except: pass
    
    m = re.search(r'(?:cash\s+advance\s+(?:fee|transaction)).*?(\d+(?:\.\d+)?)\s*%', text, re.I)
    if m:
        try:
            fields['cash_advance_fee_pct'] = float(m.group(1))
        except: pass
    
    m = re.search(r'(?:late\s+(?:payment\s+)?fee|past\s+due)[\s:]*\$?([\d,]+)', text, re.I)
    if m:
        try:
            fields['late_fee'] = int(m.group(1).replace(',', ''))
        except: pass
    
    m = re.search(r'(?:penalty\s+APR|default\s+APR)[\s:]*(\d+(?:\.\d+)?)\s*%', text, re.I)
    if m:
        try:
            fields['penalty_apr'] = float(m.group(1))
        except: pass
    
    return fields

def load_cards():
    cards = []
    for f in CARDS_DIR.glob("*.json"):
        with open(f) as fp:
            cards.append(json.load(fp))
    return cards

def match_card(canonical, issuer, cards):
    """Match canonical name to OpenCard using fuzzy matching."""
    if not canonical or not issuer:
        return None, 0
    
    # Get issuer display name
    issuer_display = ISSUER_MAP.get(issuer, issuer)
    
    # Find cards from same issuer
    issuer_cards = [(c.get('name', ''), c.get('card_id', ''), c) 
                    for c in cards 
                    if issuer_display.lower() in c.get('issuer', '').lower()]
    
    if not issuer_cards:
        return None, 0
    
    names = [n for n, cid, c in issuer_cards]
    
    # Use token_sort_ratio for better handling of word order variations
    result = process.extractOne(canonical, names, scorer=fuzz.token_sort_ratio)
    
    if result and result[1] >= 60:  # Lowered threshold to 60
        matched_name, score = result[0], result[1]
        card_id = next(cid for n, cid, c in issuer_cards if n == matched_name)
        return card_id, score
    
    return None, 0

def main():
    cards = load_cards()
    print(f"Loaded {len(cards)} cards from OpenCard")
    
    pdfs = list(CACHE_DIR.glob("*.pdf"))
    print(f"Found {len(pdfs)} PDFs\n")
    
    processed = skipped = matched = extracted = 0
    
    for pdf_path in pdfs:
        if is_spanish_filing(pdf_path.name):
            skipped += 1
            continue
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        except Exception as e:
            continue
        
        if len(text) < 100:
            continue
        
        processed += 1
        
        canonical = extract_canonical_name(text)
        issuer = detect_issuer(text)
        fields = extract_fields(text)
        
        # Try to match
        card_id, score = match_card(canonical, issuer, cards)
        if card_id:
            print(f"MATCH {canonical[:40]} -> {card_id} ({score:.1f})")
            matched += 1
        
        # Save result
        result = {
            'card_id': card_id or pdf_path.stem,
            'source': 'cfpb_ccad_v2',
            'canonical_name': canonical,
            'detected_issuer': issuer,
            'fields': fields,
        }
        
        with open(EXTRACTED_DIR / f"{pdf_path.stem}.json", 'w') as f:
            json.dump(result, f, indent=2)
        
        if fields:
            extracted += 1
    
    print(f"\n=== Results ===")
    print(f"Processed: {processed}")
    print(f"Skipped (Spanish): {skipped}")
    print(f"Matched: {matched}")
    print(f"Extracted fields: {extracted}")

if __name__ == '__main__':
    main()
