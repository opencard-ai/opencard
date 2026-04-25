#!/usr/bin/env node
/**
 * batch-add-cards.js
 *
 * 讀取 JSON 檔案（包含多張卡片資料陣列），
 * 對每張卡片檢查是否已存在於 data/cards/[card_id].json，
 * 若不存在則建立，並自動補上 last_updated 時間戳。
 *
 * 使用方式：
 *   node scripts/batch-add-cards.js data/research/OUTPUT/amex-research.json
 */

const fs = require("fs");
const path = require("path");

const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(PROJECT_ROOT, "data/cards");

// ── CLI ──────────────────────────────────────────────────────────────────────

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("❌  使用方式：node scripts/batch-add-cards.js <卡片清單.json>");
  process.exit(1);
}

const resolvedInput = path.isAbsolute(inputPath)
  ? inputPath
  : path.resolve(PROJECT_ROOT, inputPath);

if (!fs.existsSync(resolvedInput)) {
  console.error(`❌  檔案不存在：${resolvedInput}`);
  process.exit(1);
}

// ── Load ─────────────────────────────────────────────────────────────────────

let raw;
try {
  raw = JSON.parse(fs.readFileSync(resolvedInput, "utf-8"));
} catch (err) {
  console.error(`❌  無法解析 JSON：${err.message}`);
  process.exit(1);
}

// 支援 { cards: [...] } 或直接的 [...]
const cards = Array.isArray(raw) ? raw : raw.cards;

if (!Array.isArray(cards) || cards.length === 0) {
  console.error("❌  JSON 中找不到卡片陣列（預期 'cards' 欄位或頂層陣列）");
  process.exit(1);
}

// ── Process ──────────────────────────────────────────────────────────────────

let added = 0;
let skipped = 0;
let errors = 0;
const timestamp = new Date().toISOString();

console.log(`\n📦  發現 ${cards.length} 張卡片，開始處理...\n`);

for (const card of cards) {
  if (!card.card_id) {
    console.warn(`⚠️  跳過缺少 card_id 的卡片：${JSON.stringify(card).slice(0, 60)}`);
    errors++;
    continue;
  }

  const destPath = path.join(CARDS_DIR, `${card.card_id}.json`);

  if (fs.existsSync(destPath)) {
    skipped++;
    process.stdout.write(`  ⏭  跳過（已存在）：${card.card_id}\n`);
    continue;
  }

  // 合併 last_updated
  const cardWithTimestamp = {
    ...card,
    last_updated: timestamp,
  };

  try {
    fs.writeFileSync(destPath, JSON.stringify(cardWithTimestamp, null, 2) + "\n", "utf-8");
    added++;
    process.stdout.write(`  ✅  新增：${card.card_id}\n`);
  } catch (err) {
    console.error(`  ❌  寫入失敗：${card.card_id} — ${err.message}`);
    errors++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n───────────────`);
console.log(`處理了 ${cards.length} 張`);
console.log(`已新增  ${added} 張`);
console.log(`跳過    ${skipped} 張`);
if (errors > 0) console.log(`錯誤    ${errors} 筆`);
console.log(`───────────────\n`);