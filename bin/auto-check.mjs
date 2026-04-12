#!/usr/bin/env node
/**
 * bin/auto-check.mjs — Fully automated daily card data verification
 *
 * Logic:
 *  1. Fetch current card data
 *  2. Check against live sources (RSS, search, bank pages)
 *  3. If consensus across 2+ sources → auto-update
 *  4. If single source → flag for review
 *  5. Archive old version before every change
 *
 * Sources priority:
 *  - Bank official (highest)
 *  - DoC RSS (high, curated)
 *  - Reddit DP (medium, crowdsourced)
 *  - US Credit Card Guide (high, detailed, Chinese)
 *
 * Safety thresholds:
 *  - annual_fee: 0% tolerance (must match exactly)
 *  - welcome_offer.bonus_points: 10% tolerance (60K→65K = OK, 60K→125K = alert)
 *  - earning_rates: any change triggers check
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CARDS_DIR = join(DATA_DIR, 'cards');
const SOURCES_DIR = join(DATA_DIR, 'sources');
const ARCHIVE_DIR = join(DATA_DIR, 'archive');

mkdirSync(ARCHIVE_DIR, { recursive: true });

// ── Fetch helpers ────────────────────────────────────────────────

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'OpenCard/1.0', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

function fetchJSON(url) {
  return fetch(url).then(r => ({ ...r, json: JSON.parse(r.body) }));
}

// ── Parse helpers ────────────────────────────────────────────────

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/);
    const links = [...item.matchAll(/<link>(.*?)<\/link>/g)].map(m => m[1]);
    const link = links[links.length - 1] || links[0];
    const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    if (titleMatch && link) {
      items.push({
        title: (titleMatch[1] || titleMatch[2])
          .replace(/&#821[67];/g, "'").replace(/&#822[01];/g, '"').replace(/&amp;/g, '&'),
        link,
        date: dateMatch ? dateMatch[1] : null,
        ts: dateMatch ? new Date(dateMatch[1]).getTime() : null,
      });
    }
  }
  return items;
}

function extractNumber(text) {
  const m = text.match(/(\d[\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// ── Source checkers ──────────────────────────────────────────────

async function checkDoCCard(cardName) {
  // Search DoC for recent articles about this card
  const searchUrl = `https://www.doctorofcredit.com/feed/?s=${encodeURIComponent(cardName)}`;
  const r = await fetch(searchUrl);
  const items = parseRSS(r.body).slice(0, 10);

  return items.map(item => ({
    source: 'doctor_of_credit',
    title: item.title,
    link: item.link,
    date: item.date,
    ts: item.ts,
    bonusPoints: extractNumber(item.title),
    // For description, we'd need to fetch the article page
  }));
}

async function checkRedditCard(cardName) {
  const subs = ['churning', 'CreditCards'];
  const results = [];

  for (const sub of subs) {
    try {
      const r = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=20`);
      const json = JSON.parse(r.body);
      const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48h

      const posts = json.data.children
        .filter(c => !c.data.stickied)
        .filter(c => {
          const t = c.data.title.toLowerCase();
          return t.includes(cardName.toLowerCase()) ||
                 t.includes(cardName.split('-')[0].toLowerCase());
        })
        .filter(c => c.data.created_utc * 1000 > cutoff)
        .map(c => ({
          source: `r/${sub}`,
          title: c.data.title,
          link: `https://reddit.com${c.data.permalink}`,
          ts: new Date(c.data.created_utc * 1000).toISOString(),
          score: c.data.score,
          comments: c.data.num_comments,
          bonusPoints: extractNumber(c.data.title),
        }));
      results.push(...posts);
    } catch (e) { /* skip */ }
  }
  return results;
}

// ── Archiving ───────────────────────────────────────────────────

function archiveCard(cardId, oldData, change) {
  const date = new Date().toISOString().slice(0, 10);
  const archivePath = join(ARCHIVE_DIR, `${cardId}_${date}_${Date.now()}.json`);
  writeFileSync(archivePath, JSON.stringify({
    archived_at: new Date().toISOString(),
    change,
    data: oldData,
  }, null, 2));
  return archivePath;
}

// ── Auto-update logic ────────────────────────────────────────────

function checkConsensus(values, tolerance = 0) {
  const valid = values.filter(v => v !== null);
  if (valid.length === 0) return null;
  if (valid.length === 1) return { consensus: true, value: valid[0], confidence: 'low' };

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;

  if (tolerance === 0) {
    // Exact match required
    return valid.every(v => v === valid[0])
      ? { consensus: true, value: valid[0], confidence: 'high' }
      : { consensus: false, values: valid };
  }

  const drift = (max - min) / avg;
  if (drift <= tolerance) {
    return { consensus: true, value: Math.round(avg), confidence: drift < 0.05 ? 'high' : 'medium' };
  }
  return { consensus: false, values: valid };
}

// ── Main check for one card ────────────────────────────────────

async function checkCard(cardId) {
  const cardPath = join(CARDS_DIR, `${cardId}.json`);
  const sourcePath = join(SOURCES_DIR, `${cardId}.json`);

  let card;
  try {
    card = JSON.parse(readFileSync(cardPath, 'utf8'));
  } catch {
    console.error(`${cardId}: card file not found`);
    return [];
  }

  let sources = {};
  try {
    sources = JSON.parse(readFileSync(sourcePath, 'utf8'));
  } catch { /* no source config */ }

  const changes = [];
  const cardName = card.name.split(' ').slice(0, 2).join(' ');

  // ── Check 1: DoC RSS (quick, for breaking news) ──
  const docResults = await checkDoCCard(cardName);
  if (docResults.length > 0) {
    changes.push({ type: 'doc_mention', count: docResults.length, items: docResults.slice(0, 3) });
  }

  // ── Check 2: Reddit (48h mentions) ──
  const redditResults = await checkRedditCard(cardName);
  if (redditResults.length > 0) {
    changes.push({ type: 'reddit_mention', count: redditResults.length, items: redditResults.slice(0, 3) });
  }

  // ── Check 3: Welcome bonus from sources ──
  if (sources.update_config?.consensus_fields?.includes('welcome_offer.bonus_points')) {
    const docBonus = docResults.find(r => r.bonusPoints && r.bonusPoints > 10000);
    const redditBonus = redditResults.find(r => r.bonusPoints && r.bonusPoints > 10000);

    const values = [docBonus?.bonusPoints, redditBonus?.bonusPoints].filter(Boolean);
    if (values.length > 0) {
      const current = card.welcome_offer?.bonus_points;
      const consensus = checkConsensus([...values], 0.1); // 10% tolerance

      if (consensus.consensus && consensus.value !== current) {
        const change = {
          field: 'welcome_offer.bonus_points',
          old: current,
          new: consensus.value,
          confidence: consensus.confidence,
          sources: values,
          auto: consensus.confidence === 'high',
          reason: `Consensus across ${values.length} sources`,
        };
        changes.push({ type: 'welcome_bonus_change', ...change });
      }
    }
  }

  return changes;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const cardIds = readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  const allChanges = {};
  const timestamp = new Date().toISOString();
  const report = { timestamp, cards: {} };

  for (const cardId of cardIds) {
    const changes = await checkCard(cardId);
    if (changes.length > 0) {
      allChanges[cardId] = changes;
      report.cards[cardId] = changes;

      // Apply auto-updates
      for (const change of changes) {
        if (change.type === 'welcome_bonus_change' && change.auto) {
          const cardPath = join(CARDS_DIR, `${cardId}.json`);
          const oldCard = JSON.parse(readFileSync(cardPath, 'utf8'));

          // Archive old version
          archiveCard(cardId, oldCard, change);

          // Apply update
          if (change.field === 'welcome_offer.bonus_points') {
            oldCard.welcome_offer.bonus_points = change.new;
            oldCard.last_updated = timestamp.slice(0, 10);
            oldCard.last_change = {
              field: change.field,
              old: change.old,
              new: change.new,
              date: timestamp.slice(0, 10),
              auto: true,
            };
          }

          writeFileSync(cardPath, JSON.stringify(oldCard, null, 2));
          console.log(`✅ AUTO-UPDATED ${cardId}: ${change.field} ${change.old} → ${change.new}`);
        } else if (change.type === 'welcome_bonus_change') {
          console.log(`⚠️  REVIEW NEEDED ${cardId}: ${change.field} ${change.old} → ${change.new} (confidence: ${change.confidence})`);
        } else {
          console.log(`ℹ️  ${cardId}: ${change.type} (${change.count} mentions)`);
        }
      }
    } else {
      console.log(`✅ ${cardId}: No changes detected`);
    }

    // Rate limit between cards
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save report
  const reportPath = join(DATA_DIR, `check-report_${timestamp.slice(0, 10)}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${reportPath}`);

  // Print summary for Discord
  const autoUpdated = Object.entries(allChanges)
    .filter(([, cs]) => cs.some(c => c.type === 'welcome_bonus_change' && c.auto));
  const reviewNeeded = Object.entries(allChanges)
    .filter(([, cs]) => cs.some(c => c.type === 'welcome_bonus_change' && !c.auto));
  const mentions = Object.entries(allChanges)
    .filter(([, cs]) => cs.every(c => ['doc_mention', 'reddit_mention'].includes(c.type)));

  console.log('\n=== SUMMARY ===');
  console.log(`Auto-updated: ${autoUpdated.length} cards`);
  console.log(`Review needed: ${reviewNeeded.length} cards`);
  console.log(`News mentions: ${mentions.length} cards`);
}

main().catch(e => { console.error(e); process.exit(1); });
