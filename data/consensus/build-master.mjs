import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const RESEARCH = join(ROOT, 'opencard', 'data', 'research');
const OUT = join(__dirname, 'MASTER.json');

const issuers = ['chase', 'amex', 'capital-one', 'citi', 'discover', 'boa', 'usbank', 'wellsfargo', 'bilt'];
let cards = [];
let verified = 0;
let needs_review = 0;
let issues = [];

for (const issuer of issuers) {
  const dir = join(RESEARCH, issuer);
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        const card = {
          card_id: raw.card_id || file.replace('.json', ''),
          name: raw.name || 'Unknown',
          issuer: raw.issuer || issuer,
          network: raw.network || 'Unknown',
          annual_fee: raw.annual_fee ?? null,
          foreign_transaction_fee: raw.foreign_transaction_fee ?? null,
          credit_required: raw.credit_required || null,
          welcome_offer: raw.welcome_offer || null,
          earning_rates: raw.earning_rates || [],
          annual_credits: raw.annual_credits || [],
          travel_benefits: raw.travel_benefits || {},
          fhr_thc: raw.fhr_thc || { fhr_eligible: false, thc_eligible: false },
          insurance: raw.insurance || {},
          reward_type: raw.reward_type || null,
          categories: raw.categories || null,
          sources: raw.sources || [],
          confidence: raw.confidence || 'medium',
          notes: raw.notes || '',
        };
        
        const hasWelcome = card.welcome_offer && (card.welcome_offer.bonus_points || card.welcome_offer.free_nights);
        if (hasWelcome && card.annual_fee !== null && (card.sources?.length || 0) >= 1) {
          verified++;
        } else {
          needs_review++;
          issues.push(`[${card.issuer}] ${card.name} — welcome: ${!!hasWelcome}, sources: ${card.sources?.length || 0}, confidence: ${card.confidence}`);
        }
        cards.push(card);
      } catch(e) { console.error(`Error reading ${file}: ${e.message}`); }
    }
  } catch(e) { console.error(`Error reading dir ${issuer}: ${e.message}`); }
}

// Sort by issuer then name
cards.sort((a,b) => a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name));

const master = {
  cards,
  metadata: {
    total_cards: cards.length,
    verified_cards: verified,
    needs_review,
    last_updated: new Date().toISOString(),
    sources: ['Chase.com', 'AmericanExpress.com', 'CapitalOne.com', 'Citi.com', 'Discover.com', 'BankOfAmerica.com', 'USBank.com', 'WellsFargo.com', 'Doctor of Credit', 'US Credit Card Guide', 'The Points Guy', 'NerdWallet']
  }
};

writeFileSync(OUT, JSON.stringify(master, null, 2));
writeFileSync(join(__dirname, 'ISSUES.md'), `# Cards Needing Review (${needs_review})\n\n${issues.join('\n')}\n\n---\nLast updated: ${new Date().toISOString()}`);

console.log(`✅ MASTER.json: ${cards.length} cards, ${verified} verified, ${needs_review} need review`);
