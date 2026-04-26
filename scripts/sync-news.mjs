import fs from 'fs';
import path from 'path';
import { get } from 'node:https';
import { decode } from 'html-entities';

// Configuration
const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";
const MINIMAX_MODEL = "MiniMax-M2.7";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
if (!MINIMAX_API_KEY) {
  console.error("ERROR: MINIMAX_API_KEY env var not set. See docs/SECURITY_NOTICE.md for why this is no longer hardcoded.");
  process.exit(1);
}

const SOURCES = [
  { name: "doctor_of_credit", type: "rss", url: "https://www.doctorofcredit.com/feed/" },
  { name: "doctor_of_credit_banking", type: "rss", url: "https://www.doctorofcredit.com/category/banking/page/1/feed/" },
];

const LOCALES = ["en", "zh", "es"];
const OUTPUT_PATH = path.join(process.cwd(), 'data/news.json');

// --- Helpers ---
function fetchHttps(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": "OpenCard/1.0", Accept: "*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHttps(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const titleM = item.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/);
    const links = [...item.matchAll(/<link>(.*?)<\/link>/g)].map((m) => m[1]);
    const link = links[links.length - 1] || links[0] || "";
    const dateM = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const cats = [...item.matchAll(/<category>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/category>/g)].map(
      (m) => m[1] || m[2]
    );
    if (titleM) {
      const rawTitle = (titleM[1] || titleM[2] || "").trim();
      items.push({
        title: decode(rawTitle),
        url: link.trim(),
        source: "Doctor of Credit",
        categories: cats,
        ts: dateM ? new Date(dateM[1]).toISOString() : new Date().toISOString(),
      });
    }
  }
  return items;
}

async function translateBatch(items, lang) {
  if (lang === 'en') return items.map(i => ({ ...i, title_en: i.title, summary_en: "" }));
  
  const langNames = { zh: "Chinese (Traditional)", es: "Spanish" };
  const dataList = items.map((u, i) => ({ idx: i, title: u.title }));
  
  const prompt = `Convert this news list into ${langNames[lang]}. 
Output ONLY a JSON object: {"results":[{"idx":number,"title":"translated title","summary":"1-sentence summary"}]}
List: ${JSON.stringify(dataList)}`;

  const res = await fetch("https://api.minimax.io/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MINIMAX_API_KEY}` },
    body: JSON.stringify({ 
      model: "MiniMax-M2.5", 
      messages: [{ role: "user", content: prompt }], 
      temperature: 0.1,
      internal_thought: false
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`API Error for ${lang}:`, errText);
    return items.map(i => ({ ...i, [`title_${lang}`]: i.title, [`summary_${lang}`]: "" }));
  }

  const data = await res.json();
  let raw = data.choices?.[0]?.message?.content || "";
  try {
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const jsonMatch = raw.match(/\{.*\}/s);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return items.map((item, i) => {
      const translation = (parsed.results || []).find(r => r.idx === i);
      return {
        ...item,
        [`title_${lang}`]: translation ? translation.title : item.title,
        [`summary_${lang}`]: translation ? translation.summary : "",
      };
    });
  } catch (e) {
    console.error(`Parse failed for ${lang}:`, e, raw.substring(0, 300));
    return items.map(i => ({ ...i, [`title_${lang}`]: i.title, [`summary_${lang}`]: "" }));
  }
}

// --- Main ---
async function sync() {
  console.log("Fetching RSS...");
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  let allItems = [];

  for (const src of SOURCES) {
    try {
      const xml = await fetchHttps(src.url);
      const items = parseRSS(xml).filter(i => new Date(i.ts).getTime() > cutoff);
      allItems.push(...items);
    } catch (e) {
      console.error(`Failed to fetch ${src.name}:`, e);
    }
  }

  // Deduplicate and Sort
  const uniqueItems = Array.from(new Map(allItems.map(i => [i.url, i])).values());
  uniqueItems.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const limitedItems = uniqueItems.slice(0, 15);

  console.log(`Processing ${limitedItems.length} items for ${LOCALES.join(', ')}...`);
  
  // Create multi-language entries
  let processed = [...limitedItems];
  for (const lang of LOCALES) {
    console.log(`Translating to ${lang}...`);
    const translated = await translateBatch(limitedItems, lang);
    processed = processed.map((item, i) => ({
      ...item,
      [`title_${lang}`]: translated[i][`title_${lang}`],
      [`summary_${lang}`]: translated[i][`summary_${lang}`],
    }));
  }

  const output = {
    items: processed,
    fetched: new Date().toISOString()
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log("Done! Written to data/news.json");
}

sync().catch(console.error);
