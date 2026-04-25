#!/usr/bin/env python3
"""Apply all extracted CFPB data to cards with comprehensive mapping."""
import json
from pathlib import Path

CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")

# Comprehensive mapping: extracted ID -> card ID
MAPPING = {
    # Amex
    "amex-gold": "amex-gold",
    "amex-platinum": "amex-platinum",
    "amex-green": "amex-green",
    "amex-blue-cash-everyday": "amex-blue-cash-everyday",
    "amex-blue-cash-preferred": "amex-blue-cash-preferred",
    "amex-cash-magnet": "amex-cash-magnet",
    "amex-centurion": "amex-centurion",
    "amex-delta-gold": "amex-delta-gold",
    "amex-delta-gold-biz": "amex-delta-gold-biz",
    "amex-delta-platinum": "amex-delta-platinum",
    "amex-delta-blue": "amex-delta-blue",
    "amex-delta-reserve": "amex-delta-reserve",
    "amex-everyday": "amex-everyday",
    "amex-everyday-preferred": "amex-everyday",
    "amex-hilton-honors": "amex-hilton-honors",
    "amex-hilton-honors-aspire": "amex-hilton-honors-aspire",
    "amex-hilton-surpass": "amex-hilton-surpass",
    "amex-marriott-bonvoy": "amex-marriott-bonvoy",
    "amex-marriott-bonvoy-biz": "amex-marriott-bonvoy-biz",
    "amex-marriott-bevy": "amex-marriott-bevy",
    "amex-marriott-brilliant": "amex-marriott-brilliant",
    "amex-morgan-stanley-platinum": "amex-morgan-stanley-platinum",
    "amex-morgan-stanley-blue": "amex-morgan-stanley-blue",
    # Filename variants
    "amex-american-express-cash-magnet-card-cardmember-agreement": "amex-cash-magnet",
    "amex-delta-skymiles-blue-american-express-card-cardmember-agreement": "amex-delta-blue",
    "amex-delta-skymiles-reserve-american-express-card-cardmember-agreement": "amex-delta-reserve",
    "amex-goldman-sachs-platinum-card-cardmember-agreement": "amex-goldman-sachs-platinum",
    "amex-charles-schwab-platinum": "charles-schwab-platinum",
    "amex-hilton-honors-american-express-card-cardmember-agreement": "amex-hilton-honors",
    "amex-hilton-honors-american-express-surpass-card-cardmember-agreement": "amex-hilton-surpass",
    "amex-marriott-bonvoy-american-express-card-cardmember-agreement": "amex-marriott-bonvoy",
    "amex-marriott-bonvoy-bevy-american-express-card-cardmember-agreement": "amex-marriott-bevy",
    "amex-morgan-stanley-blue-cash-preferred-american-express-card-cardmember-agreement": "amex-morgan-stanley-blue",
    "amex-morgan-stanley-platinum-card-cardmember-agreement": "amex-morgan-stanley-platinum",
    "amex-optima-card-from-american-express-cardmember-agreement": "amex-optima",
    "amex-the-charles-schwab-investor-card-cardmember-agreement": "amex-charles-schwab-investor",
    # Chase
    "chase-sapphire-reserve": "chase-sapphire-reserve",
    "chase-sapphire-reserve-biz": "chase-sapphire-reserve-biz",
    "chase-sapphire-preferred": "chase-sapphire-preferred",
    "chase-freedom-flex": "chase-freedom-flex",
    "chase-freedom-unlimited": "chase-freedom-unlimited",
    "chase-freedom-5-cash-back": "chase-freedom-5-cash-back",
    "chase-ink-preferred": "chase-ink-biz-preferred",
    "chase-ink-preferred-plus": "chase-ink-preferred-plus",
    "chase-ink-business-preferred": "chase-ink-biz-preferred",
    # Capital One
    "capital-one-venture-x": "capital-one-venture-x",
    "capital-one-venture-x-biz": "capital-one-venture-x-biz",
    "capital-one-quicksilver": "capital-one-quicksilver",
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
    "discover-it-miles": "discover-it-miles",
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
    "usb-flex-rewards": "us-bank-flex-rewards",
    "usb-amex-card": "us-bank-amex",
    # PNC
    "pnc-cash-unlimited": "pnc-cash-rewards",
    "pnc-secured": "pnc-secured-credit-card",
    # Apple Card
    "apple-card": "apple-card",
    # PenFed
    "penfed": "penfed-credit-card",
    # Navy Federal
    "navy-federal": "navy-federal-cashrewards-plus",
    # SoFi
    "sofi": "sofi-credit",
    # Synchrony / Retail
    "amazon-store-card": "amazon-store-card",
    "sync-amazon": "amazon-store-card",
    "american-eagle-visa": "american-eagle-outlet-credit-card",
    "sync-american-eagle": "american-eagle-outlet-credit-card",
    "belk-rewards-mastercard": "belk-rewards-mastercard",
    "sync-belk": "belk-rewards-mastercard",
    "gap-brand-card": "gap-brand-card",
    # BoA
    "boa-platinum": "boa-platinum-rewards",
    "boa-secured": "boa-secured",
    # Other
    "goldman-sachs-platinum": "amex-goldman-sachs-platinum",
    "charles-schwab-platinum": "charles-schwab-platinum",
    "petal-2": "petal-2-visa",
}

updated = 0
skipped = 0
not_found = []

for ext_id, card_id in MAPPING.items():
    extracted_file = EXTRACTED_DIR / f"{ext_id}.json"
    card_path = CARDS_DIR / f"{card_id}.json"
    
    if not extracted_file.exists():
        skipped += 1
        continue
    if not card_path.exists():
        not_found.append(f"{ext_id} -> {card_id}")
        continue
    
    with open(extracted_file) as f:
        cfpb = json.load(f)
    with open(card_path) as f:
        card = json.load(f)
    
    fields = cfpb.get("fields", {})
    if not fields:
        skipped += 1
        continue
    
    changes = []
    for key, value in fields.items():
        if value is not None and card.get(key) != value:
            card[key] = value
            changes.append(key)
    
    if changes:
        card["cfpb_source"] = "Q3_2025"
        with open(card_path, "w") as f:
            json.dump(card, f, indent=2)
        print(f"✅ {card_id}: {changes}")
        updated += 1

print(f"\nUpdated {updated} cards, skipped {skipped}")
if not_found:
    print(f"Not found ({len(not_found)}): {not_found[:10]}")
