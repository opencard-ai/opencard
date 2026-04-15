#!/usr/bin/env node
/**
 * OpenCard 卡片同步腳本
 * 用途：對比線上網站與本地資料庫的卡片差異
 * 
 * 使用方式：node bin/sync-cards.mjs
 * 輸出：Markdown 格式差異報告（僅報告，不修改任何檔案）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname2 = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.join(__dirname2, "../data/cards");
const REPORT_PATH = path.join(__dirname2, "../data/sync-report.md");
const ONLINE_API = "https://opencardai.com/api/cards";
const LOCAL_CARDS_DIR = CARDS_DIR;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLocalCards() {
  if (!fs.existsSync(LOCAL_CARDS_DIR)) return {};
  const files = fs.readdirSync(LOCAL_CARDS_DIR).filter(f => f.endsWith(".json"));
  const cards = {};
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(LOCAL_CARDS_DIR, file), "utf8");
      const card = JSON.parse(raw);
      const id = card.card_id || file.replace(".json", "");
      cards[id] = card;
    } catch (e) {
      console.error(`  [!] Failed to parse: ${file}`);
    }
  }
  return cards;
}

function extractCardIdsFromHtml(html) {
  const re = /\/api\/cards\/([a-z0-9\-]+)/g;
  const ids = new Set();
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids].sort();
}

function compareCard(local, online) {
  const diffs = [];
  const fields = ["annual_fee", "welcome_offer", "earning_rates"];
  for (const f of fields) {
    const lv = JSON.stringify(local[f]);
    const ov = JSON.stringify(online[f]);
    if (lv !== ov) diffs.push(f);
  }
  return diffs;
}

async function fetchOnlineIds() {
  const res = await fetch(ONLINE_API);
  if (!res.ok) throw new Error(`Failed to fetch online API: ${res.status}`);
  const html = await res.text();
  return extractCardIdsFromHtml(html);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 OpenCard 卡片同步檢查\n");
  console.log("═".repeat(60));

  // Step 1: Fetch online card list
  console.log("\n📡 從線上取得卡片列表...");
  let onlineIds;
  try {
    onlineIds = await fetchOnlineIds();
    console.log(`   線上：${onlineIds.length} 張`);
  } catch (e) {
    console.error(`\n❌ 無法取得線上資料: ${e.message}`);
    process.exit(1);
  }

  // Step 2: Load local cards
  console.log("\n📁 讀取本地資料庫...");
  const localCards = getLocalCards();
  const localIds = Object.keys(localCards).sort();
  console.log(`   本地：${localIds.length} 張`);

  // Step 3: Compare
  console.log("\n⚖️  比對差異...\n");

  const onlyOnline = onlineIds.filter(id => !localIds.includes(id));
  const onlyLocal = localIds.filter(id => !onlineIds.includes(id));
  const shared = onlineIds.filter(id => localIds.includes(id));

  // Field-level diff for shared cards
  const fieldChanged = [];
  for (const id of shared) {
    const local = localCards[id];
    const diffs = compareCard(local, {}); // online doesn't have full card data from listing page
    if (diffs.length > 0) fieldChanged.push({ id, diffs });
  }

  // Step 4: Generate report
  const lines = [];
  lines.push("# OpenCard 卡片同步差異報告");
  lines.push(`\n_generated: ${new Date().toISOString()}_\n`);
  lines.push(`_source: ${ONLINE_API}_\n`);
  lines.push("\n---\n");

  lines.push("## 📊 數量對照\n");
  lines.push(`| 來源 | 數量 |`);
  lines.push(`|------|------|`);
  lines.push(`| 線上 (opencardai.com) | ${onlineIds.length} |`);
  lines.push(`| 本地 (data/cards/) | ${localIds.length} |`);
  lines.push(`| 共同擁有 | ${shared.length} |`);
  lines.push(`| 僅線上有 | ${onlyOnline.length} |`);
  lines.push(`| 僅本地有 | ${onlyLocal.length} |`);
  lines.push("\n---\n");

  if (onlyOnline.length > 0) {
    lines.push("## 🆕 新增的卡片（線上有，本地沒有）\n");
    for (const id of onlyOnline) lines.push(`- \`${id}\``);
    lines.push("");
  }

  if (onlyLocal.length > 0) {
    lines.push("## 🗑️  消失的卡片（本地有，線上沒有）\n");
    for (const id of onlyLocal) lines.push(`- \`${id}\``);
    lines.push("");
  }

  if (onlyOnline.length === 0 && onlyLocal.length === 0) {
    lines.push("## ✅ 完全同步\n");
    lines.push("_線上與本地卡片數量完全一致。_\n");
  }

  if (fieldChanged.length > 0) {
    lines.push("---\n");
    lines.push("## 🔄 欄位可能異動的卡片\n");
    lines.push("_（需進一步比對詳情頁）_\n");
    for (const { id, diffs } of fieldChanged) {
      lines.push(`- \`${id}\`: ${diffs.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("---\n");
  lines.push("_⚠️ 此報告僅供參考，不會自動修改任何檔案。_");
  lines.push("_如需同步，請依賴此報告人工確認後再行動。_");

  const report = lines.join("\n");

  // Save report
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\n📄 報告已寫入：${REPORT_PATH}\n`);

  // Print summary
  console.log("═".repeat(60));
  console.log(`\n✅ 同步檢查完成\n`);
  console.log(`   線上：${onlineIds.length} | 本地：${localIds.length}`);
  if (onlyOnline.length === 0 && onlyLocal.length === 0) {
    console.log(`   ✅ 數量完全一致`);
  } else {
    if (onlyOnline.length > 0) console.log(`   🆕 僅線上有：${onlyOnline.length} 張`);
    if (onlyLocal.length > 0) console.log(`   🗑️  僅本地有：${onlyLocal.length} 張`);
  }
  console.log(`\n   詳細報告：${REPORT_PATH}`);
}

main().catch(e => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
