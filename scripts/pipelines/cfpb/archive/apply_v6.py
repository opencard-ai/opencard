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
print("[ARCHIVED] apply_v6.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """Apply v6 extraction results to cards."""
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
# CARDS_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cards")
# EXTRACTED_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache/extracted")
#
# updated = 0
# for ext_file in EXTRACTED_DIR.glob("*.json"):
#     with open(ext_file) as f:
#         ext = json.load(f)
#
#     card_id = ext.get('card_id', '')
#     fields = ext.get('fields', {})
#
#     if not card_id or not fields or card_id == ext_file.stem:
#         continue
#
#     card_path = CARDS_DIR / f"{card_id}.json"
#     if not card_path.exists():
#         continue
#
#     with open(card_path) as f:
#         card = json.load(f)
#
#     changes = []
#     for key, value in fields.items():
#         if value is not None and card.get(key) != value:
#             card[key] = value
#             changes.append(key)
#
#     if changes:
#         card['cfpb_source'] = 'Q3_2025'
#         with open(card_path, 'w') as f:
#             json.dump(card, f, indent=2)
#         print(f"Updated {card_id}: {changes}")
#         updated += 1
#
# print(f"\nTotal updated: {updated}")
