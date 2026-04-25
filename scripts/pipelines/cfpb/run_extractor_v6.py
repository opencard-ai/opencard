#!/usr/bin/env python3
"""CFPB Extractor v6 - Improved field extraction."""
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
        '_spanish.' in name or
        name.endswith('_spanish.pdf')
    )

def extract_canonical_name(text):
    if not text:
        return None
    head = text[:3000]
    lines = [l.strip() for l in head.split('\n') if l.strip()]
    
    for i, line in enumerate(lines[:15]):
        if any(kw in line.lower() for kw in ['rates and fees', 'interest rates', 'account agreement', 'pricing information']):
            if i > 0:
                prev = lines[i-1]
                if 5 < len(prev) < 100 and not prev.startswith('http') and not prev.startswith('ID '):
                    return re.sub(r'[(R)]\(TM\)|[MS]', '', prev).strip()
    
    for i, line in enumerate(lines[:20]):
        if 'cardmember agreement' in line.lower() or 'card agreement' in line.lower():
            for j in range(i+1, min(i+5, len(lines))):
                next_line = lines[j]
                if 5 < len(next_line) < 100:
                    return re.sub(r'[(R)]\(TM\)|[MS]', '', next_line).strip()
    
    return None

def detect_issuer(text):
    if not text:
        return None
    text_lower = text.lower()[:3000]
    
    checks = [
        ('amex', ['american express', 'amex']),
        ('chase', ['jpmorgan', 'chase bank', 'jpmorgan chase']),
        ('citi', ['citibank']),
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
    
    # Annual Fee - look for the section
    annual_section = re.search(r'Annual.{0,100}', text, re.I)
    if annual_section:
        section_text = annual_section.group(0)
        nums = re.findall(r'[\d,]+', section_text)
        if nums:
            try:
                fields['annual_fee'] = int(nums[0].replace(',', ''))
            except: pass
    
    # Foreign Transaction Fee
    ftf_section = re.search(r'Foreign.{0,100}', text, re.I)
    if ftf_section:
        section_text = ftf_section.group(0)
        nums = re.findall(r'\d+(?:\.\d+)?', section_text)
        if nums:
            try:
                fields['foreign_transaction_fee'] = float(nums[0])
            except: pass
    
    # Cash Advance Fee %
    ca_section = re.search(r'Cash\s+Advance.{0,150}', text, re.I)
    if ca_section:
        section_text = ca_section.group(0)
        nums = re.findall(r'\d+(?:\.\d+)?(?=\s*%)', section_text)
        if nums:
            try:
                fields['cash_advance_fee_pct'] = float(nums[0])
            except: pass
    
    # Cash Advance Fee flat
    if ca_section:
        section_text = ca_section.group(0)
        # Look for dollar amounts before the %
        flat_match = re.search(r'\$?([\d,]+)(?:\s+(?:or|each))?(?:\s+\d)', section_text)
        if flat_match:
            try:
                fields['cash_advance_fee_flat'] = int(flat_match.group(1).replace(',', ''))
            except: pass
    
    # Late Fee
    late_section = re.search(r'Late.{0,50}', text, re.I)
    if late_section:
        section_text = late_section.group(0)
        nums = re.findall(r'\d+', section_text)
        if nums:
            try:
                fields['late_fee'] = int(nums[0])
            except: pass
    
    # Penalty APR
    penalty_section = re.search(r'Penalty.{0,80}', text, re.I)
    if penalty_section:
        section_text = penalty_section.group(0)
        nums = re.findall(r'\d+(?:\.\d+)?(?=\s*%)', section_text)
        if nums:
            try:
                fields['penalty_apr'] = float(nums[0])
            except: pass
    
    return fields

def load_cards():
    cards = []
    for f in CARDS_DIR.glob("*.json"):
        with open(f) as fp:
            cards.append(json.load(fp))
    return cards

def match_card(canonical, issuer, cards):
    if not canonical or not issuer:
        return None, 0
    
    issuer_display = ISSUER_MAP.get(issuer, issuer)
    issuer_cards = [(c.get('name', ''), c.get('card_id', ''), c) 
                    for c in cards 
                    if issuer_display.lower() in c.get('issuer', '').lower()]
    
    if not issuer_cards:
        return None, 0
    
    names = [n for n, cid, c in issuer_cards]
    result = process.extractOne(canonical, names, scorer=fuzz.token_sort_ratio)
    
    if result and result[1] >= 60:
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
        
        card_id, score = match_card(canonical, issuer, cards)
        if card_id:
            print(f"MATCH {canonical[:40]} -> {card_id} ({score:.1f})")
            matched += 1
        
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
