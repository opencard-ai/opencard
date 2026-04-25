#!/usr/bin/env python3
"""Batch extract all PDFs in cfpb-cache directory."""
import json
import subprocess
from pathlib import Path

CACHE_DIR = Path("/Users/kaceyc/.openclaw/workspace/opencard/data/cfpb-cache")
EXTRACTED_DIR = CACHE_DIR / "extracted"
EXTRACTED_DIR.mkdir(exist_ok=True)

SCRIPT = Path("/Users/kaceyc/.openclaw/workspace/opencard/scripts/pipelines/cfpb/schumer_extractor.py")

# Map PDF filenames to card IDs
PDF_TO_CARD = {
    "amex-gold.pdf": "amex-gold",
    "amex-platinum.pdf": "amex-platinum",
    "amex-green.pdf": "amex-green",
    "amex-blue-cash-everyday.pdf": "amex-blue-cash-everyday",
    "amex-blue-cash-preferred.pdf": "amex-blue-cash-preferred",
    "amex-centurion.pdf": "amex-centurion",
    "amex-charles-schwab-platinum.pdf": "charles-schwab-platinum",
    "amex-delta-gold.pdf": "amex-delta-gold",
    "amex-delta-platinum.pdf": "amex-delta-platinum",
    "amex-delta-skymiles-blue-american-express-card-cardmember-agreement.pdf": "amex-delta-blue",
    "amex-delta-skymiles-reserve-american-express-card-cardmember-agreement.pdf": "amex-delta-reserve",
    "amex-everyday-preferred.pdf": "amex-everyday-preferred",
    "amex-goldman-sachs-platinum-card-cardmember-agreement.pdf": "goldman-sachs-platinum",
    "amex-hilton-aspire.pdf": "amex-hilton-honors-aspire",
    "amex-hilton-honors-american-express-card-cardmember-agreement.pdf": "amex-hilton-honors",
    "amex-hilton-honors-american-express-surpass-card-cardmember-agreement.pdf": "amex-hilton-surpass",
    "amex-marriott-bonvoy-american-express-card-cardmember-agreement.pdf": "amex-marriott-bonvoy",
    "amex-marriott-bonvoy-bevy-american-express-card-cardmember-agreement.pdf": "amex-marriott-bevy",
    "amex-marriott-brilliant.pdf": "amex-marriott-brilliant",
    "amex-morgan-stanley-blue-cash-preferred-american-express-card-cardmember-agreement.pdf": "amex-morgan-stanley-blue",
    "amex-morgan-stanley-platinum-card-cardmember-agreement.pdf": "amex-morgan-stanley-platinum",
    "amex-cash-magnet.pdf": "amex-cash-magnet",
    "amex-american-express-cash-magnet-card-cardmember-agreement.pdf": "amex-cash-magnet",
    "chase-sapphire-reserve.pdf": "chase-sapphire-reserve",
    "chase-freedom-flex.pdf": "chase-freedom-flex",
    "chase-ink-business-preferred.pdf": "chase-ink-business-preferred",
    "capital-one-venture-x.pdf": "capital-one-venture-x",
    "capital-one-quicksilver.pdf": "capital-one-quicksilver",
}

def main():
    results = []
    for pdf_file, card_id in PDF_TO_CARD.items():
        pdf_path = CACHE_DIR / pdf_file
        if not pdf_path.exists():
            print(f"⚠️  {pdf_file}: not found")
            continue
        
        out_file = EXTRACTED_DIR / f"{card_id}.json"
        if out_file.exists():
            print(f"⏭️  {card_id}: already extracted")
            continue
        
        try:
            result = subprocess.run(
                ["python3", str(SCRIPT), str(pdf_path), card_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.stdout:
                data = json.loads(result.stdout)
                with open(out_file, "w") as f:
                    json.dump(data, f, indent=2)
                fields = data.get("fields", {})
                print(f"✅ {card_id}: {list(fields.keys())}")
                results.append(data)
            else:
                print(f"❌ {card_id}: no output")
        except Exception as e:
            print(f"❌ {card_id}: {e}")
    
    print(f"\nExtracted {len(results)} cards")
    
    # Summary
    if results:
        print("\n=== Summary ===")
        for r in results:
            card_id = r.get("card_id")
            fields = r.get("fields", {})
            annual_fee = fields.get("annual_fee", "N/A")
            print(f"  {card_id}: annual_fee={annual_fee}")

if __name__ == "__main__":
    main()
