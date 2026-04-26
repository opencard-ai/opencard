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
print("[ARCHIVED] apply_all_extracted_v2.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Apply all extracted CFPB data to cards - fixed mapping."""
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
# import re
#
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
# EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")
#
# # Build card file lookup
# card_files = {f.stem: f for f in CARDS_DIR.glob("*.json")}
# norm_to_card = {}
# for name, path in card_files.items():
#     norm = re.sub(r'[^a-z0-9]', '', name.lower())
#     norm_to_card[norm] = path
#
# def find_card(ext_id):
#     """Find matching card for extracted ID."""
#     # Direct match
#     if ext_id in card_files:
#         return card_files[ext_id]
#
#     # Normalized match
#     norm = re.sub(r'[^a-z0-9]', '', ext_id.lower())
#
#     # Try contains matching
#     for card_norm, card_path in norm_to_card.items():
#         if norm in card_norm or card_norm in norm:
#             return card_path
#
#     # Try individual words
#     words = norm.replace('-', ' ').split()
#     for word in words:
#         if len(word) > 4:
#             for card_norm, card_path in norm_to_card.items():
#                 if word in card_norm:
#                     return card_path
#
#     return None
#
# updated = 0
#
# for extracted_file in EXTRACTED_DIR.glob("*.json"):
#     ext_id = extracted_file.stem
#     card_path = find_card(ext_id)
#
#     if not card_path:
#         continue
#
#     with open(extracted_file) as f:
#         cfpb = json.load(f)
#     with open(card_path) as f:
#         card = json.load(f)
#
#     fields = cfpb.get("fields", {})
#     if not fields:
#         continue
#
#     changes = []
#     for key, value in fields.items():
#         if value is not None and card.get(key) != value:
#             card[key] = value
#             changes.append(key)
#
#     if changes:
#         card["cfpb_source"] = "Q3_2025"
#         with open(card_path, "w") as f:
#             json.dump(card, f, indent=2)
#         print(f"✅ {card_path.stem}: {changes}")
#         updated += 1
#
# print(f"\nUpdated {updated} cards")
