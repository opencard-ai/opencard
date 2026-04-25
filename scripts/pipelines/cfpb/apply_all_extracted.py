#!/usr/bin/env python3
"""Apply all extracted CFPB data to cards."""
import json
from pathlib import Path
import re

CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")

# Comprehensive mapping from extracted ID patterns to card file names
MAPPING = {
    # Amex
    "amex-gold": "amex-gold",
    "amex-platinum": "amex-platinum",
    "amex-green": "amex-green",
    "amex-blue-cash-everyday": "amex-blue-cash-everyday",
    "amex-blue-cash-preferred": "amex-blue-cash-preferred",
    "amex-centurion": "amex-centurion",
    "amex-delta-gold": "amex-delta-gold",
    "amex-delta-platinum": "amex-delta-platinum",
    "amex-delta-skymiles-blue": "amex-delta-blue",
    "amex-delta-skymiles-reserve": "amex-delta-reserve",
    "amex-hilton-honors": "amex-hilton-honors",
    "amex-hilton-honors-aspire": "amex-hilton-honors-aspire",
    "amex-hilton-surpass": "amex-hilton-surpass",
    "amex-marriott-bonvoy": "amex-marriott-bonvoy",
    "amex-marriott-bevy": "amex-marriott-bevy",
    "amex-marriott-brilliant": "amex-marriott-brilliant",
    "amex-cash-magnet": "amex-cash-magnet",
    "amex-everyday-preferred": "amex-everyday-preferred",
    "amex-morgan-stanley-platinum": "amex-morgan-stanley-platinum",
    "amex-morgan-stanley-blue": "amex-morgan-stanley-blue",
    "amex-charles-schwab-platinum": "charles-schwab-platinum",
    "amex-goldman-sachs-platinum": "goldman-sachs-platinum",
    # Chase
    "chase-sapphire-reserve": "chase-sapphire-reserve",
    "chase-sapphire-preferred": "chase-sapphire-preferred",
    "chase-freedom-flex": "chase-freedom-flex",
    "chase-freedom-unlimited": "chase-freedom-unlimited",
    "chase-freedom-5-cash-back": "chase-freedom-5-cash-back",
    "chase-ink-preferred": "chase-ink-biz-preferred",
    "chase-ink-business-preferred": "chase-ink-biz-preferred",
    # Capital One
    "capital-one-venture-x": "capital-one-venture-x",
    "capital-one-quicksilver": "capital-one-quicksilver",
    "capital-one-quicksilver-one": "capital-one-quicksilver-one",
    "capital-one-secure": "capital-one-quicksilver-secured",
    # Citi
    "citi-custom-cash": "citi-custom-cash",
    "citi-double-cash": "citi-double-cash",
    "citi-aadvantage-executive": "citi-aadvantage-executive",
    "citi-strata-premier": "citi-strata-premier",
    "citi-simplicity": "citi-simplicity",
    "citi-diamond-preferred": "citi-diamond-preferred",
    # Discover
    "discover-it": "discover-it",
    "discover-it-chrome": "discover-it-chrome",
    # Barclays
    "barclays-ubereats": "barclays-ubereats",
    "barclays-gap": "barclays-gap-good-rewards-mastercard",
    # Wells Fargo
    "wf-reflect": "wells-fargo-reflect",
    "wf-active-cash": "wells-fargo-active-cash",
    "wf-autograph": "wells-fargo-autograph",
    # HSBC
    "hsbc-elite": "hsbc-elite-credit",
    "hsbc-premier": "hsbc-premier",
    # US Bank
    "us-bank-flex-rewards": "us-bank-flex-rewards",
    "us-bank-amex": "us-bank-amex",
    # PNC
    "pnc-cash-unlimited": "pnc-cash-rewards",
    "pnc-secured": "pnc-secured-credit-card",
    # Apple Card
    "apple-card": "apple-card",
    # PenFed
    "penfed": "penfed-credit-card",
    # Navy Federal
    "navy-federal": "navy-federal-credit-card",
    # SoFi
    "sofi": "sofi-credit-card",
}

def normalize(name):
    """Normalize card ID for matching."""
    return re.sub(r'[^a-z0-9]', '', name.lower())

# Build reverse lookup
normalized_to_extracted = {}
for ext_id in EXTRACTED_DIR.glob("*.json"):
    norm = normalize(ext_id.stem)
    normalized_to_extracted[norm] = ext_id.stem

# Also build card file lookup
card_files = {normalize(f.stem): f for f in CARDS_DIR.glob("*.json")}

updated = 0
not_found = []

for extracted_file in EXTRACTED_DIR.glob("*.json"):
    ext_id = extracted_file.stem
    
    # Try direct mapping first
    card_name = MAPPING.get(ext_id)
    
    # Try normalized matching
    if not card_name:
        norm = normalize(ext_id)
        for card_norm, card_file in card_files.items():
            if norm in card_norm or card_norm in norm:
                card_name = card_file.stem
                break
    
    if not card_name:
        not_found.append(ext_id)
        continue
    
    card_path = CARDS_DIR / f"{card_name}.json"
    if not card_path.exists():
        not_found.append(f"{ext_id} -> {card_name} (not found)")
        continue
    
    with open(extracted_file) as f:
        cfpb = json.load(f)
    with open(card_path) as f:
        card = json.load(f)
    
    fields = cfpb.get("fields", {})
    changes = []
    for key, value in fields.items():
        if value is not None and card.get(key) != value:
            card[key] = value
            changes.append(key)
    
    if changes:
        card["cfpb_source"] = "Q3_2025"
        with open(card_path, "w") as f:
            json.dump(card, f, indent=2)
        print(f"✅ {card_name}: {changes}")
        updated += 1

print(f"\nUpdated {updated} cards")
if not_found:
    print(f"Not matched ({len(not_found)}): {not_found[:10]}")
