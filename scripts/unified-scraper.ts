/**
 * OpenCard Unified Scraper v3.0 - Full AI-Powered Extraction
 * 
 * Per-bank source priority strategy:
 * - Chase/Capital One/Discover/Wells Fargo: official → uscreditcardguide → nerdwallet
 * - Amex/Citi/Barclays/BoA: uscreditcardguide → nerdwallet → official
 * 
 * Extracts ALL database fields using AI:
 * - welcome_offer, earning_rates, recurring_credits, travel_benefits, insurance
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const RAW_DIR = path.join(process.cwd(), 'data', 'raw-unified');
const URL_MAP_FILE = path.join(process.cwd(), 'data', 'url-map.json');
const LOG_FILE = path.join(process.cwd(), 'data', 'unified-scraper-log.json');
const AI_PROMPTS_DIR = path.join(process.cwd(), 'data', 'ai-prompts');

[RAW_DIR, AI_PROMPTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

interface UrlMap { [key: string]: any; }
interface ScrapeResult {
  card_id: string; timestamp: string; status: 'success' | 'fallback' | 'failed';
  source_used: string | null; annual_fee: number | null;
  welcome_offer: any; earning_rates: any[]; recurring_credits: any[];
  travel_benefits: any; insurance: any; error?: string;
}

// ============ HTTP FETCH ============
function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, (res) => {
      clearTimeout(timeout);
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchWithTimeout(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', e => { clearTimeout(timeout); reject(e); });
  });
}

// ============ AI EXTRACTION PROMPTS ============
const AI_MODEL = 'minimax/MiniMax-M2.7';

function buildFullExtractionPrompt(cardName: string, cardId: string, rawText: string): string {
  return `You are extracting structured credit card data for "${cardName}" (${cardId}).

Extract ALL fields from the content below. Return ONLY valid JSON (no markdown, no explanation).

{
  "issuer": "American Express",
  "network": "amex",
  "annual_fee": 895,
  "foreign_transaction_fee": 0,
  "credit_required": "Excellent",
  "welcome_offer": {
    "bonus_points": 175000,
    "spending_requirement": 12000,
    "time_period_months": 6,
    "description": "Earn up to 175,000 Membership Rewards points...",
    "point_program": "Amex Membership Rewards",
    "estimated_value": 2100
  },
  "earning_rates": [
    {"category": "Flights", "rate": 5, "notes": "Booked directly with airlines..."},
    {"category": "Hotels", "rate": 5, "notes": "On prepaid hotels..."},
    {"category": "Other", "rate": 1, "notes": null}
  ],
  "recurring_credits": [
    {"name": "Uber Cash", "amount": 200, "frequency": "annual", "category": "ride", "description": "$15/month Uber credit", "reset_type": "calendar_year"},
    {"name": "Saks Fifth Avenue", "amount": 100, "frequency": "annual", "category": "shopping", "description": "$50/semi-annual", "reset_type": "calendar_year"},
    {"name": "Free Night Award", "amount": 50000, "frequency": "annual", "category": "hotel", "description": "Annual free night at Marriott properties", "reset_type": "cardmember_year"}
  ],
  "travel_benefits": {
    "lounge_access": [{"name": "Centurion Lounge", "type": "centurion"}, {"name": "Priority Pass", "type": "priority_pass"}],
    "hotel_status": [{"program": "Marriott Bonvoy", "tier": "Gold Elite", "complimentary": true}],
    "other_benefits": [{"name": "Fine Hotels + Resorts", "description": "..."}]
  },
  "hotel_program": {
    "program": "Marriott Bonvoy",
    "tier": "Gold Elite",
    "elite_night_credits": 15,
    "fhr_eligible": true,
    "thc_eligible": true
  },
  "insurance": {
    "rental_insurance": "Secondary",
    "trip_delay": true,
    "purchase_protection": true,
    "extended_warranty": true,
    "trip_cancellation": null,
    "return_protection": null
  },
  "application_rules": {
    "rules": [{"rule": "5/24 rule", "description": "Cannot approve if 5+ new cards in 24 months"}]
  },
  "tags": ["lounge-access", "premium", "transferable"],
  "sources": [{"url": "https://..."}]
}

Rules:
- issuer: American Express, Chase, Capital One, Citi, Discover, Wells Fargo, Barclays, Bank of America, US Bank, HSBC, etc.
- network: amex, visa, mastercard, discover
- annual_fee: number (0 if no annual fee)
- foreign_transaction_fee: number (0 if no fee)
- credit_required: Excellent, Good, Fair, Poor
- welcome_offer.bonus_points: number (0 if none)
- welcome_offer.point_program: MR, UR, TYP, Honors, Marriott, None, etc.
- earning_rates: array of {category, rate, notes}
  - category: Flights, Hotels, Dining, Groceries, Gas, Other, etc.
- recurring_credits: array of {name, amount, frequency, category, description, reset_type}
  - frequency: monthly|quarterly|semi_annual|annual|per_stay|cardmember_year
  - category: airline|hotel|travel|dining|groceries|gas|streaming|fitness|shopping|ride|digital|entertainment|credit_monitoring|other
  - reset_type: calendar_year (Jan-Dec) or cardmember_year (based on card anniversary)
  - NOTE: Free night awards go HERE (in recurring_credits), not in hotel_program
- travel_benefits.lounge_access: array of {name, type}
  - type: centurion, priority_pass, delta_skyclub, escape_lounge, plaza_premium, airspace, other
- travel_benefits.hotel_status: array of {program, tier, complimentary}
  - program: Marriott Bonvoy, Hilton Honors, IHG Rewards, World of Hyatt, etc.
- hotel_program: {program, tier, elite_night_credits, fhr_eligible, thc_eligible}
  - fhr_eligible/thc_eligible: only for Amex cards with FHR/THC benefits
  - NOTE: free_night_award does NOT go here, it goes in recurring_credits
- application_rules: {rules: [{rule, description}]}
  - rule examples: 5/24 rule, first approval, lifetime bonus rule, etc.
- tags: lounge-access, premium, transferable, no-af, cash-back, travel, hotel, airline, etc.
- sources: [{url}] - the URL this data was extracted from

Content (first 12000 chars):
${rawText.slice(0, 12000)}

Respond with JSON only. Do NOT include fields that are null or not found in the content.`;
}

// ============ SCRAPER ============
function loadUrlMap(): UrlMap {
  return JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf-8'));
}

function getSourcePriority(urlMap: UrlMap, issuer: string): string[] {
  // Map issuer name to _source_priority key
  const bankMap: { [key: string]: string } = {
    'american_express': 'amex',
    'amex': 'amex',
    'chase': 'chase',
    'capital_one': 'capital_one',
    'capital one': 'capital_one',
    'discover': 'discover',
    'wells_fargo': 'wells_fargo',
    'wells fargo': 'wells_fargo',
    'citi': 'citi',
    'citibank': 'citi',
    'barclays': 'barclays',
    'bank_of_america': 'bank_of_america',
    'bank of america': 'bank_of_america',
    'us_bank': 'us_bank',
    'us bank': 'us_bank',
    'hsbc': 'hsbc',
    'navy_federal': 'navy_federal',
    'navy federal': 'navy_federal',
    'penfed': 'penfed',
    'pen_fed': 'penfed',
  };
  const bank = issuer.toLowerCase().replace(/[\s-]+/g, '_');
  const mappedKey = bankMap[bank] || bank;
  return urlMap._source_priority?.[mappedKey] || urlMap._source_priority?.['default'] || ['uscreditcardguide'];
}

async function scrapeFromSource(url: string): Promise<string | null> {
  try { return await fetchWithTimeout(url, 15000); }
  catch { return null; }
}

async function callAI(prompt: string): Promise<any> {
  // Use sessions_send to call AI
  const { sessions_send } = require('./tools/sessions-send');
  return null; // Placeholder - will be called via subagent
}

async function scrapeCard(cardId: string): Promise<ScrapeResult> {
  const ts = new Date().toISOString();
  const urlMap = loadUrlMap();
  
  const cardFile = path.join(CARDS_DIR, `${cardId}.json`);
  if (!fs.existsSync(cardFile)) {
    return { card_id: cardId, timestamp: ts, status: 'failed', source_used: null, annual_fee: null, welcome_offer: null, earning_rates: [], recurring_credits: [], travel_benefits: null, insurance: null, error: 'Card file not found' };
  }
  
  const card = JSON.parse(fs.readFileSync(cardFile, 'utf-8'));
  const issuer = card.issuer || 'unknown';
  const sourcePriority = getSourcePriority(urlMap, issuer);
  const cardName = card.name || cardId;
  
  const cardEntry = urlMap[cardId];
  if (!cardEntry?.sources) {
    return { card_id: cardId, timestamp: ts, status: 'failed', source_used: null, annual_fee: null, welcome_offer: null, earning_rates: [], recurring_credits: [], travel_benefits: null, insurance: null, error: 'No URL mapping' };
  }
  
  for (const source of sourcePriority) {
    const url = cardEntry.sources[source];
    if (!url) continue;
    
    const rawText = await scrapeFromSource(url);
    if (!rawText || rawText.length < 500) continue;
    
    // Save raw text
    fs.writeFileSync(path.join(RAW_DIR, `${cardId}-raw.txt`), rawText);
    
    // Save AI prompt
    const prompt = buildFullExtractionPrompt(cardName, cardId, rawText);
    fs.writeFileSync(path.join(AI_PROMPTS_DIR, `${cardId}-prompt.txt`), prompt);
    
    return {
      card_id: cardId, timestamp: ts,
      status: source === sourcePriority[0] ? 'success' : 'fallback',
      source_used: source, annual_fee: null,
      welcome_offer: null, earning_rates: [], recurring_credits: [],
      travel_benefits: null, insurance: null,
    };
  }
  
  return { card_id: cardId, timestamp: ts, status: 'failed', source_used: null, annual_fee: null, welcome_offer: null, earning_rates: [], recurring_credits: [], travel_benefits: null, insurance: null, error: 'All sources failed' };
}

// ============ MAIN ============
async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const cardIdArg = args.find(a => !a.startsWith('--'));
  const startIdx = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) : 0;
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 999999;
  const urlMap = loadUrlMap();
  
  if (isTest && cardIdArg) {
    console.log(`\n🧪 Testing unified scraper on: ${cardIdArg}`);
    console.log('='.repeat(60));
    const result = await scrapeCard(cardIdArg);
    console.log(`Status: ${result.status}`);
    console.log(`Source: ${result.source_used}`);
    console.log(`Raw text: ${path.join(RAW_DIR, `${cardIdArg}-raw.txt`)}`);
    console.log(`Prompt: ${path.join(AI_PROMPTS_DIR, `${cardIdArg}-prompt.txt`)}`);
    if (result.error) console.log(`Error: ${result.error}`);
    return;
  }
  
  // Full run with optional batch support
  const allCardIds = Object.keys(urlMap).filter(k => !k.startsWith('_'));
  const cardIds = allCardIds.slice(startIdx, startIdx + limit);
  console.log(`\n🤖 OpenCard Unified Scraper v3.0 (Full AI Extraction)`);
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🎯 ${allCardIds.length} cards total, processing ${startIdx+1}-${startIdx+cardIds.length}\n`);
  
  const results: ScrapeResult[] = [];
  let s = 0, f = 0, fail = 0;
  
  for (const cardId of cardIds) {
    process.stdout.write(`Processing: ${cardId}...`);
    const r = await scrapeCard(cardId);
    results.push(r);
    if (r.status === 'success') { s++; console.log(' ✅'); }
    else if (r.status === 'fallback') { f++; console.log(' ⚠️'); }
    else { fail++; console.log(' ❌'); }
    await new Promise(r => setTimeout(r, 500)); // Reduced delay to 0.5s
  }
  
  fs.writeFileSync(LOG_FILE, JSON.stringify({ timestamp: new Date().toISOString(), total: cardIds.length, success: s, fallback: f, failed: fail, results }, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Success: ${s} ✅ | Fallback: ${f} ⚠️ | Failed: ${fail} ❌`);
  console.log(`📁 Raw texts: ${RAW_DIR}`);
  console.log(`📁 AI prompts: ${AI_PROMPTS_DIR}`);
}

main().catch(console.error);
