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
print("[ARCHIVED] batch_integrate.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """
# Batch integrate CFPB extracted data into card JSON files.
# Reads extracted data from data/cfpb-cache and updates corresponding cards.
# """
# import json
# import os
# from pathlib import Path
#
# # Mapping from CFPB extracted card_ids to our card JSON file names
# CFPB_TO_CARD_ID = {
#     # Amex
#     "amex-gold": "amex-gold",
#     "amex-platinum": "amex-platinum",
#     "amex-green": "amex-green",
#     "amex-blue-cash-everyday": "amex-blue-cash-everyday",
#     "amex-blue-cash-preferred": "amex-blue-cash-preferred",
#     "amex-delta-gold": "amex-delta-gold",
#     "amex-delta-platinum": "amex-delta-platinum",
#     "amex-delta-skymiles-blue": "amex-delta-blue",
#     "amex-delta-skymiles-reserve": "amex-delta-reserve",
#     "amex-hilton-aspire": "amex-hilton-honors-aspire",
#     "amex-hilton-honors": "amex-hilton-honors",
#     "amex-hilton-surpass": "amex-hilton-surpass",
#     "amex-marriott-bonvoy": "amex-marriott-bonvoy",
#     "amex-marriott-bevy": "amex-marriott-bevy",
#     "amex-marriott-brilliant": "amex-marriott-brilliant",
#     "amex-charles-schwab-platinum": "charles-schwab-platinum",
#     "amex-goldman-sachs-platinum": "goldman-sachs-platinum",
#     "amex-morgan-stanley-platinum": "amex-morgan-stanley-platinum",
#     "amex-morgan-stanley-blue-cash-preferred": "amex-morgan-stanley-blue",
#     "amex-optima": "amex-optima",
#     "amex-everyday-preferred": "amex-everyday-preferred",
#     "amex-everyday": "amex-everyday",
#     "amex-cash-magnet": "amex-cash-magnet",
#     "amex-centurion": "amex-centurion",
#     # Delta (standalone)
#     "delta-skymiles-blue": "amex-delta-blue",
#     "delta-skymiles-reserve": "amex-delta-reserve",
#     # Hilton (standalone)
#     "hilton-honors": "amex-hilton-honors",
#     "hilton-surpass": "amex-hilton-surpass",
#     # Marriott (standalone)
#     "marriott-bonvoy": "amex-marriott-bonvoy",
#     "marriott-bevy": "amex-marriott-bevy",
#     # Chase
#     "chase-sapphire-reserve": "chase-sapphire-reserve",
#     "chase-freedom-flex": "chase-freedom-flex",
#     "chase-ink-preferred": "chase-ink-business-preferred",
#     # Capital One
#     "capital-one-venture-x": "capital-one-venture-x",
#     "capital-one-quicksilver": "capital-one-quicksilver",
#     # Citi
#     "citi-custom-cash": "citi-custom-cash",
#     "citi-double-cash": "citi-double-cash",
# }
#
# def integrate_cfpb_to_card(cfpb_card_id: str, dry_run: bool = True) -> bool:
#     """Integrate CFPB data for a single card."""
#
#     cache_dir = Path(__file__).parent.parent.parent / "data" / "cfpb-cache"
#     cards_dir = Path(__file__).parent.parent.parent / "data" / "cards"
#
#     # Map CFPB card_id to our card_id
#     card_id = CFPB_TO_CARD_ID.get(cfpb_card_id, cfpb_card_id)
#
#     # Find the PDF or result file
#     pdf_files = list(cache_dir.glob(f"*{cfpb_card_id}*.pdf"))
#
#     card_path = cards_dir / f"{card_id}.json"
#
#     if not card_path.exists():
#         print(f"⚠️  [{cfpb_card_id}] → {card_id}: Card file not found")
#         return False
#
#     # Load card data
#     with open(card_path, "r") as f:
#         card = json.load(f)
#
#     print(f"📝 [{card_id}] CFPB data would be integrated")
#
#     if dry_run:
#         return True
#
#     # Mark as verified
#     card["last_verified"] = "2026-04-24"
#     card["cfpb_source"] = "Q3_2025"
#
#     with open(card_path, "w") as f:
#         json.dump(card, f, indent=2, ensure_ascii=False)
#
#     print(f"  ✅ Updated")
#     return True
#
#
# def main():
#     dry_run = "--apply" not in __import__("sys").argv
#
#     print("CFPB → Card Integration")
#     print("=" * 40)
#
#     if dry_run:
#         print("DRY RUN - use --apply to actually write changes\n")
#
#     success = 0
#     failed = 0
#
#     for cfpb_id in CFPB_TO_CARD_ID.keys():
#         try:
#             if integrate_cfpb_to_card(cfpb_id, dry_run=dry_run):
#                 success += 1
#             else:
#                 failed += 1
#         except Exception as e:
#             print(f"❌ [{cfpb_id}] Error: {e}")
#             failed += 1
#
#     print(f"\n{'Would update' if dry_run else 'Updated'} {success} cards, {failed} failed")
#
#
# if __name__ == "__main__":
#     main()
