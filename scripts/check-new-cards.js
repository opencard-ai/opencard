#!/usr/bin/env node
/**
 * check-new-cards.js
 *
 * 讀取參考清單（248張卡），
 * 對比 data/cards/ 中所有已存在的 card_id，
 * 輸出三個列表：新增、停發、不變（Markdown 表格格式，方便貼到 TASKS.md）。
 *
 * 使用方式：
 *   node scripts/check-new-cards.js
 */

const fs = require("fs");
const path = require("path");

const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(PROJECT_ROOT, "data/cards");

// ── Paths ─────────────────────────────────────────────────────────────────────

const REFERENCE_LIST = path.join(PROJECT_ROOT, "data/reference-list.json");

// ── Load reference list ───────────────────────────────────────────────────────

let reference;
try {
  reference = JSON.parse(fs.readFileSync(REFERENCE_LIST, "utf-8"));
} catch (err) {
  console.error(`❌  無法讀取參考清單：${err.message}`);
  console.error(`    預期路徑：${REFERENCE_LIST}`);
  process.exit(1);
}

const referenceCards = Array.isArray(reference) ? reference : reference.cards;
if (!Array.isArray(referenceCards)) {
  console.error("❌  參考清單中找不到卡片陣列");
  process.exit(1);
}

const referenceIds = new Set(referenceCards.map((c) => c.card_id).filter(Boolean));

console.log(
  `📋  參考清單：${referenceIds.size} 張卡片\n`
);

// ── Load existing cards ───────────────────────────────────────────────────────

let existingIds = new Set();
if (fs.existsSync(CARDS_DIR)) {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  existingIds = new Set(files.map((f) => f.replace(/\.json$/, "")));
}

console.log(`📁  現有卡片：${existingIds.size} 張\n`);

// ── Classify ──────────────────────────────────────────────────────────────────

const newCards    = []; // 在參考清單中，但還沒建檔
const discontinued = []; // 已建檔，但不在參考清單中（可能已停發）
const unchanged   = []; // 兩邊都有

for (const id of referenceIds) {
  if (existingIds.has(id)) {
    unchanged.push(id);
  } else {
    newCards.push(id);
  }
}

for (const id of existingIds) {
  if (!referenceIds.has(id)) {
    discontinued.push(id);
  }
}

// ── Sort ──────────────────────────────────────────────────────────────────────

newCards.sort();
discontinued.sort();
unchanged.sort();

// ── Output ───────────────────────────────────────────────────────────────────

function cardRows(ids) {
  if (ids.length === 0) return "| — | — | — |";
  return ids
    .map((id) => {
      const meta = referenceCards.find((c) => c.card_id === id) || {};
      return `| ${meta.name ?? id} | ${id} | ${meta.issuer ?? "—"} |`;
    })
    .join("\n");
}

const md = `
## 📊 卡片比對報告

- **參考清單：** ${referenceIds.size} 張
- **現有卡片：** ${existingIds.size} 張
- **新增（待建檔）：** ${newCards.length} 張
- **停發（待確認）：** ${discontinued.length} 張
- **不變：** ${unchanged.length} 張

---

### 🆕 新增（${newCards.length} 張）— 在參考清單但不在 data/cards/

| 卡名 | card_id | Issuer |
|------|---------|--------|
${cardRows(newCards)}

---

### 🛑 停發（${discontinued.length} 張）— 在 data/cards 但不在參考清單

| 卡名 | card_id | Issuer |
|------|---------|--------|
${cardRows(discontinued)}

---

### ✅ 不變（${unchanged.length} 張）— 兩邊都有

| 卡名 | card_id | Issuer |
|------|---------|--------|
${cardRows(unchanged)}
`;

console.log(md.trim());