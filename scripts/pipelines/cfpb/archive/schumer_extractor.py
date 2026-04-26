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
print("[ARCHIVED] schumer_extractor.py - see scripts/pipelines/cfpb/README.md")
sys.exit(2)

# =========================================================================
# Original code below preserved for reference. NOT executed.
# =========================================================================

# #!/usr/bin/env python3
# """CFPB Schumer Box Extractor - Table-based"""
# import sys, re, json, hashlib, pdfplumber
# from datetime import datetime
#
# def extract(pdf_path, card_id=None):
#     with pdfplumber.open(pdf_path) as pdf:
#         page = pdf.pages[0]
#         text = page.extract_text() or ""
#         tables = page.extract_tables()
#
#     h = hashlib.sha256(text.encode()).hexdigest()
#     r = {"card_id": card_id or "unknown", "source": "cfpb_ccad", "fetched_at": datetime.now().isoformat(), "content_hash": h, "fields": {}}
#
#     # Annual Fee
#     m = re.search(r"Annual Fee.*?(\d+)", text)
#     if m: r["fields"]["annual_fee"] = int(m.group(1))
#
#     # Foreign Transaction Fee
#     m = re.search(r"Foreign Transaction:\s+(None|[\d.]+%)", text)
#     if m:
#         v = m.group(1).strip()
#         r["fields"]["foreign_transaction_fee"] = 0 if v.lower() == "none" else float(v.replace("%",""))
#
#     # Late Payment Fee
#     m = re.search(r"Late Payment:\s+Up to.*?(\d+)", text)
#     if m: r["fields"]["late_fee"] = int(m.group(1))
#
#     # Cash Advance Fee
#     m = re.search(r"Either\s+\$(\d+)\s+or\s+([\d.]+)%", text)
#     if m:
#         r["fields"]["cash_advance_fee_flat"] = int(m.group(1))
#         r["fields"]["cash_advance_fee_pct"] = float(m.group(2))
#
#     # Parse APR from table
#     for table in tables:
#         for row in table:
#             if not row: continue
#             label = str(row[0]) if row[0] else ""
#             value = str(row[1]) if len(row) > 1 and row[1] else ""
#
#             if "APR" in label and "Pay" in label:
#                 # Extract percentages from "12.74% 21.74% Prime Rate + to Prime Rate +"
#                 nums = re.findall(r"([\d.]+)%", value)
#                 if len(nums) >= 2:
#                     r["fields"]["apr_purchases_min"] = nums[0]
#                     r["fields"]["apr_purchases_max"] = nums[1]
#                 elif len(nums) == 1:
#                     r["fields"]["apr_purchases"] = nums[0]
#
#             elif "APR for Cash" in label:
#                 nums = re.findall(r"([\d.]+)%", value)
#                 if nums:
#                     r["fields"]["apr_cash_advances"] = nums[0]
#
#             elif "Penalty APR" in label:
#                 nums = re.findall(r"([\d.]+)%", value)
#                 if nums:
#                     r["fields"]["penalty_apr"] = nums[0]
#
#     return r
#
# if __name__ == "__main__":
#     print(json.dumps(extract(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None), indent=2))
