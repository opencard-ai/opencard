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
print("[ARCHIVED] apply_extracted.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Apply extracted CFPB data to card JSON files."""
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
# import json
# from pathlib import Path
#
# EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
#
# def main():
#     updated = 0
#     for extracted_file in EXTRACTED_DIR.glob("*.json"):
#         card_id = extracted_file.stem
#         card_path = CARDS_DIR / f"{card_id}.json"
#
#         if not card_path.exists():
#             print(f"⚠️  {card_id}: card not found")
#             continue
#
#         with open(extracted_file) as f:
#             cfpb_data = json.load(f)
#
#         with open(card_path) as f:
#             card = json.load(f)
#
#         fields = cfpb_data.get("fields", {})
#         changes = []
#
#         for key, value in fields.items():
#             if value is not None and card.get(key) != value:
#                 old = card.get(key)
#                 card[key] = value
#                 changes.append(f"  {key}: {old} → {value}")
#
#         if changes:
#             card["cfpb_source"] = "Q3_2025"
#             card["cfpb_verified"] = True
#
#             with open(card_path, "w") as f:
#                 json.dump(card, f, indent=2, ensure_ascii=False)
#
#             print(f"✅ {card_id}:")
#             for c in changes:
#                 print(c)
#             updated += 1
#
#     print(f"\nUpdated {updated} cards")
#
# if __name__ == "__main__":
#     main()
