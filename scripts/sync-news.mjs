import fs from 'fs';
import path from 'path';
import { fetchRSS, prepareNews } from './news-sync-core.mjs';

// Load .env.local if present (for cron/local runs — parses KEY=VALUE lines, skips comments)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch (_) {}

// Configuration
const MINIMAX_API_URL = "https://api.minimax.io/anthropic/v1/messages";
const MINIMAX_MODEL = "MiniMax-M2.7";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;


const SOURCES = [
  { name: "doctor_of_credit", type: "rss", url: "https://www.doctorofcredit.com/feed/" },
  { name: "doctor_of_credit_banking", type: "rss", url: "https://www.doctorofcredit.com/category/banking/page/1/feed/" },
];

const OUTPUT_PATH = path.join(process.cwd(), 'data/news.json');

async function translateBatch(items, lang) {
  if (lang === 'en') return items.map(i => ({ ...i, title_en: i.title, summary_en: "" }));

  if (!MINIMAX_API_KEY) throw new Error('MINIMAX_API_KEY is required for missing translations');

  const langNames = { zh: "Chinese (Traditional)", es: "Spanish" };
  const dataList = items.map((u, i) => ({ idx: i, title: u.title }));

  const prompt = `Translate this news list into ${langNames[lang]}.
Output ONLY a JSON array: [{"idx":number,"title":"translated title","summary":"1-sentence summary"},...]
List: ${JSON.stringify(dataList)}`;

  try {
    const res = await fetch(MINIMAX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      console.error(`Translation HTTP ${res.status} for ${lang}`);
      return items.map(i => ({ ...i, [`title_${lang}`]: i.title, [`summary_${lang}`]: "" }));
    }

    const data = await res.json();
    let raw = (data.content || [])
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("");
    try {
      // Try to extract array of objects [{idx, title, summary}, ...]
      // Strategy: find [ then scan for matching ] at top-level, then extract objects
      let parsed = null;
      const rawTrim = raw.trim();
      if (rawTrim.startsWith('[')) {
        let depth = 0, end = -1;
        for (let i = 0; i < rawTrim.length; i++) {
          const c = rawTrim[i];
          if (c === '[') depth++;
          else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end > 0) {
          try { parsed = JSON.parse(rawTrim.slice(0, end + 1)); } catch(e) {}
        }
      }
      // Fallback: try any JSON array or object
      if (!parsed) {
        const jsonMatch = raw.match(/\[[\s\S]*\]/s) || raw.match(/\{[\s\S]*\}/s);
        try { parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw); } catch(e) {}
      }
      return items.map((item, i) => {
        const translation = (parsed || []).find(r => r.idx === i);
        return {
          ...item,
          [`title_${lang}`]: translation ? translation.title : item.title,
          [`summary_${lang}`]: translation ? translation.summary : "",
        };
      });
    } catch (e) {
      console.error(`Translation JSON parse failed for ${lang}`);
      return items.map(i => ({ ...i, [`title_${lang}`]: i.title, [`summary_${lang}`]: "" }));
    }
  } catch (e) {
    console.error(`Translation request failed for ${lang}`);
    return items.map(i => ({ ...i, [`title_${lang}`]: i.title, [`summary_${lang}`]: "" }));
  }
}

// --- Main ---
async function sync() {
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    if (!Array.isArray(previous.items)) throw new Error('Invalid previous news feed');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = await prepareNews({
    previous,
    sources: SOURCES,
    fetchSource: src => fetchRSS(src.url),
    translate: translateBatch,
  });
  if (!result.changed) {
    console.log('No news content changes; skipped write (no deployment needed).');
    return;
  }
  // Atomic replacement prevents readers seeing a partially written feed.
  const temporary = `${OUTPUT_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(result.output, null, 2));
    fs.renameSync(temporary, OUTPUT_PATH);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`Written ${result.output.items.length} news items to data/news.json`);
}

sync().catch(() => {
  console.error('News sync failed; existing feed preserved. Check RSS availability and translation configuration.');
  process.exitCode = 1;
});
