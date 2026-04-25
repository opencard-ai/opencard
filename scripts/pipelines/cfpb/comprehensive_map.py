#!/usr/bin/env python3
"""Comprehensive mapping of extracted CFPB data to cards."""
import json
import re
from pathlib import Path

CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")

# Load all cards
all_cards = {f.stem: f for f in CARDS_DIR.glob("*.json")}
all_extracted = list(EXTRACTED_DIR.glob("*.json"))

def normalize(name):
    """Normalize for matching."""
    return re.sub(r'[^a-z0-9]', '', name.lower())

def keywords(name):
    """Extract keywords from card name."""
    norm = normalize(name)
    # Split into words
    words = re.split(r'[-_\s]+', norm)
    return set(w for w in words if len(w) > 2)

def find_best_match(extracted_name):
    """Find the best matching card for an extracted file."""
    ext_norm = normalize(extracted_name)
    ext_kw = keywords(extracted_name)
    
    candidates = []
    
    for card_name, card_path in all_cards.items():
        card_norm = normalize(card_name)
        card_kw = keywords(card_name)
        
        # Exact or substring match
        if ext_norm == card_norm or ext_norm in card_norm or card_norm in ext_norm:
            candidates.append((card_name, card_path, 100))
            continue
        
        # Keyword overlap
        overlap = len(ext_kw & card_kw)
        if overlap > 0:
            # Prefer matches with issuer name
            issuer_match = 0
            for kw in ext_kw:
                if kw in card_norm:
                    issuer_match += 1
            score = overlap * 10 + issuer_match * 5
            candidates.append((card_name, card_path, score))
    
    if not candidates:
        return None, None, 0
    
    # Sort by score
    candidates.sort(key=lambda x: -x[2])
    return candidates[0][1], candidates[0][0], candidates[0][2]

# Try to match all
matched = []
unmatched = []

for ext_file in all_extracted:
    ext_name = ext_file.stem
    card_path, card_name, score = find_best_match(ext_name)
    
    if card_path and score >= 30:
        matched.append((ext_name, card_name, score))
    else:
        unmatched.append((ext_name, score))

print("=== MATCHED (score >= 30) ===")
for ext, card, score in sorted(matched, key=lambda x: -x[2]):
    print(f"{score:3d} {ext} -> {card}")

print(f"\nMatched: {len(matched)}")
print(f"Unmatched: {len(unmatched)}")

print("\n=== UNMATCHED ===")
for ext, score in unmatched:
    print(f"{score:3d} {ext}")
