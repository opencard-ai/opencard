/**
 * OpenCard AI Extraction - Process pending prompts
 * 
 * Reads AI prompts from data/ai-prompts/ and extracts card data via MiniMax API.
 * Updates card JSON files with extracted data.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CARDS_DIR = path.join(process.cwd(), 'data', 'cards');
const AI_PROMPTS_DIR = path.join(process.cwd(), 'data', 'ai-prompts');
const RAW_DIR = path.join(process.cwd(), 'data', 'raw-unified');

interface Card {
  card_id: string;
  name: string;
  issuer?: string;
  network?: string;
  annual_fee?: number;
  foreign_transaction_fee?: number;
  credit_required?: string;
  welcome_offer?: any;
  earning_rates?: any[];
  recurring_credits?: any[];
  travel_benefits?: any;
  hotel_program?: any;
  insurance?: any;
  application_rules?: any;
  tags?: string[];
  sources?: any[];
  last_scraped?: string;
  last_updated?: string;
}

function callMinimax(prompt: string): string | null {
  try {
    // Use MiniMax API via curl
    const apiKey = process.env.MINIMAX_API_KEY || '';
    if (!apiKey) {
      console.log('  MINIMAX_API_KEY not set, trying OpenAI...');
      return null;
    }
    
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    const cmd = `curl -s -X POST "https://api.minimax.chat/v1/text/chatcompletion_pro?GroupId=${process.env.MINIMAX_GROUP_ID || ''}" \\
      -H "Authorization: Bearer ${apiKey}" \\
      -H "Content-Type: application/json" \\
      -d '{"model":"MiniMax-Text-01","messages":[{"role":"user","content":"${escapedPrompt}}],"max_tokens":4000}' 2>&1`;
    
    const response = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
    const json = JSON.parse(response);
    return json.choices?.[0]?.message?.content || null;
  } catch (e: any) {
    console.log(`  MiniMax API error: ${e.message}`);
    return null;
  }
}

function extractJsonFromResponse(response: string): any {
  // Try to extract JSON from AI response
  // Sometimes AI returns markdown code blocks
  let jsonStr = response;
  
  // Remove markdown code blocks
  jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  
  // Try to find JSON object
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) {
    jsonStr = match[0];
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Try to fix common issues
    jsonStr = jsonStr.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');
    try {
      return JSON.parse(jsonStr);
    } catch (e2) {
      return null;
    }
  }
}

async function processCard(cardId: string): Promise<boolean> {
  const promptPath = path.join(AI_PROMPTS_DIR, `${cardId}-prompt.txt`);
  const rawPath = path.join(RAW_DIR, `${cardId}-raw.txt`);
  const cardPath = path.join(CARDS_DIR, `${cardId}.json`);
  
  if (!fs.existsSync(promptPath)) {
    console.log(`  No prompt for ${cardId}`);
    return false;
  }
  
  console.log(`\nProcessing: ${cardId}`);
  
  // Read prompt
  const prompt = fs.readFileSync(promptPath, 'utf-8');
  const rawText = fs.existsSync(rawPath) ? fs.readFileSync(rawPath, 'utf-8') : '';
  
  // Call AI
  console.log(`  Calling AI...`);
  const response = callMinimax(prompt);
  
  if (!response) {
    console.log(`  ❌ AI call failed`);
    return false;
  }
  
  // Extract JSON
  const data = extractJsonFromResponse(response);
  if (!data) {
    console.log(`  ❌ Failed to parse AI response`);
    return false;
  }
  
  // Read existing card
  const existingCard: Card = JSON.parse(fs.readFileSync(cardPath, 'utf-8'));
  
  // Merge extracted data with existing card
  const updatedCard: Card = {
    ...existingCard,
    ...data,
    card_id: cardId,
    name: data.name || existingCard.name,
    issuer: data.issuer || existingCard.issuer,
    network: data.network || existingCard.network,
    annual_fee: data.annual_fee ?? existingCard.annual_fee,
    foreign_transaction_fee: data.foreign_transaction_fee ?? existingCard.foreign_transaction_fee,
    credit_required: data.credit_required || existingCard.credit_required,
    last_scraped: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
  
  // Save updated card
  fs.writeFileSync(cardPath, JSON.stringify(updatedCard, null, 2));
  console.log(`  ✅ Updated card with AI-extracted data`);
  
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const cardIdArg = args.find(a => !a.startsWith('--'));
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10;
  
  // Get all cards with prompts
  const prompts = fs.readdirSync(AI_PROMPTS_DIR)
    .filter(f => f.endsWith('-prompt.txt'))
    .map(f => f.replace('-prompt.txt', ''));
  
  console.log(`Found ${prompts.length} cards with AI prompts`);
  
  if (cardIdArg) {
    // Process single card
    await processCard(cardIdArg);
  } else {
    // Process first N cards
    const toProcess = prompts.slice(0, limit);
    let success = 0, failed = 0;
    
    for (const cardId of toProcess) {
      const ok = await processCard(cardId);
      if (ok) success++; else failed++;
      
      // Delay between calls
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`\n📊 Processed ${toProcess.length} cards: ${success} ✅, ${failed} ❌`);
  }
}

main().catch(console.error);
