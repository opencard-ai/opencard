#!/usr/bin/env python3
"""
Batch AI Extraction for OpenCard
Uses MiniMax API to extract structured data from AI prompts
"""

import subprocess
import json
import os
import sys
import time
from pathlib import Path

API_KEY = "sk-cp-mFUA974Fysefoi8t8aYqXJOpAsPdOr7RxBtneUI1lDdJdEiR2JVoeX7edw3LYOq8rOpVETcOCc-L7EJQpATl-d-SaUxHFs_jNi_vfODGjxryGJYSWyOD_7Y"
CARDS_DIR = Path("data/cards")
PROMPTS_DIR = Path("data/ai-prompts")
RAW_DIR = Path("data/raw-unified")

def call_minimax(prompt: str) -> str | None:
    escaped = prompt.replace('"', '\\"').replace('\n', '\\n')
    cmd = f'''curl -s "https://api.minimax.io/v1/chat/completions" \
      -H "Authorization: Bearer {API_KEY}" \
      -H "Content-Type: application/json" \
      -d '{{"model":"MiniMax-M2","messages":[{{"role":"user","content":"{escaped}"}}],"max_tokens":1500}}' 2>&1'''
    
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=90)
    try:
        resp = json.loads(result.stdout)
        return resp.get('choices', [{}])[0].get('message', {}).get('content', '')
    except:
        return None

def extract_json(content: str) -> dict | None:
    # Remove markdown code blocks
    content = content.replace('```json', '').replace('```', '')
    match = re.search(r'\{[\s\S]*\}', content)
    if match:
        try:
            return json.loads(match.group())
        except:
            return None
    return None

import re

def process_card(card_id: str) -> bool:
    prompt_path = PROMPTS_DIR / f"{card_id}-prompt.txt"
    card_path = CARDS_DIR / f"{card_id}.json"
    
    if not prompt_path.exists():
        print(f"  No prompt for {card_id}")
        return False
    
    print(f"Processing: {card_id}")
    
    # Read prompt
    with open(prompt_path) as f:
        prompt = f.read()
    
    # Call AI
    content = call_minimax(prompt)
    if not content:
        print(f"  ❌ API call failed")
        return False
    
    # Extract JSON
    data = extract_json(content)
    if not data:
        print(f"  ❌ Failed to parse response")
        return False
    
    # Read existing card
    with open(card_path) as f:
        card = json.load(f)
    
    # Merge data
    for key in ['recurring_credits', 'travel_benefits', 'insurance', 'hotel_program', 
                'welcome_offer', 'earning_rates', 'application_rules', 'tags', 'sources']:
        if key in data and data[key]:
            card[key] = data[key]
    
    card['last_scraped'] = datetime.now().isoformat()
    card['last_updated'] = datetime.now().isoformat()
    
    # Save
    with open(card_path, 'w') as f:
        json.dump(card, f, indent=2, ensure_ascii=False)
    
    rc_count = len(card.get('recurring_credits', []))
    print(f"  ✅ {rc_count} recurring_credits")
    return True

from datetime import datetime

def main():
    args = sys.argv[1:]
    limit = int(args[0]) if args else 10
    
    # Get cards with prompts
    prompts = [p.replace('-prompt.txt', '') for p in os.listdir(PROMPTS_DIR) if p.endswith('-prompt.txt')]
    
    print(f"Found {len(prompts)} cards with prompts, processing {limit}")
    
    success = 0
    failed = 0
    
    for i, card_id in enumerate(prompts[:limit]):
        ok = process_card(card_id)
        if ok: success += 1
        else: failed += 1
        
        if i < limit - 1:
            time.sleep(2)  # Rate limit
    
    print(f"\nResults: {success} ✅, {failed} ❌")

if __name__ == "__main__":
    main()
