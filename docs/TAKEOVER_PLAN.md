# OpenCard 接手計畫

> 起始日期：2026-04-25
> 接手人：Claude (代理 Kacey)
> 範圍：根據 OPENCARD_HANDOVER.md + 現場 audit 寫的接手 roadmap

---

## TL;DR

**三件馬上要做的事(這週):**

1. **🚨 P0 — 停損**：CFPB pipeline 寫壞了 24 張卡的 `annual_fee`(amex-platinum 顯示 $12 而非 $895)。**今天就要 revert + 鎖寫**。
2. **🚨 P0 — 安全**：`vercel.json` 把 Upstash token 明文 commit 進 git。**Rotate token + 移到 Vercel env vars**。
3. **🟠 P1 — 把 30 個 pipeline 檔案壓回 1 個 canonical 版本**。目前 schumer_extractor v1+v2、run_extractor v2-v6、apply_* × 6 共存,沒人知道哪個是「現在用的」。

不解決 1 + 2,任何資料層的後續努力都白費(線上仍呈現錯資料)。

---

## 我看到了什麼

### A. 健康訊號

- **Schema 大部分整理過了**:`data/cards/*.json` 249 張、`last_updated` 全部都有、發卡行去重完成、`tags` 收斂成 11 個 enum、`sitemap.ts` 已經把 249 張卡 × 3 語言 = 747 個 card pages 列入(SEO 缺口已堵)。
- **API 結構合理**:`/api/cards`、`/api/cards?card_id=X`、`/api/cards?summary=1`、`/api/recommend`、`/api/chat`、`/api/cron/reminders`、完整的 `/api/my-cards/*` (subscribe/verify/unsubscribe/delete/save/remove/set-open-date)。
- **Email 訂閱基本功能完整**:Vercel cron 每月 1 號 + 20 號 9am 跑 `/api/cron/reminders`,email 用 SHA-256 hash 儲存,有 verify 流程。
- **Validation 框架已有**:`scripts/validate-all.ts` 480+ 行,covers schema + business 雙層檢查。

### B. 緊急問題(下面細說)

| # | 問題 | 嚴重度 | 即時處理 |
|---|---|---|---|
| 1 | CFPB pipeline 寫錯 annual_fee 到 24 張卡 | 🚨 線上錯資料 | revert,然後鎖寫 |
| 2 | `vercel.json` 把 Upstash token 暴露在 git | 🚨 secrets 外洩 | rotate + env vars |
| 3 | Pipeline 檔案沒 canonical 版本(30 個檔、6 版 v2-v6) | 🟠 維護不可能 | consolidate 成 1 entry point |
| 4 | `/api/cards` summary 參數語意反向(comment vs code 不一致) | 🟡 confusion | 修文件 + variable rename |
| 5 | `recurring_credits` 仍只 70/249(28%)有資料 | 🟠 主打功能空 | Plan B 第二條 pipeline |
| 6 | "Free Night Award amount: 35000" 把點數值寫到 dollar 欄位 | 🟡 amex-platinum 數據錯 | 人工修 + schema 強制 |
| 7 | 重複卡片(amex-bce + amex-blue-cash-everyday)沒 dedupe | 🟡 數據污染 | 寫 dedupe migration |

### C. 結構性問題

- **沒有 fact-store / provenance 模型**:CFPB pipeline 直接 overwrite `data/cards/*.json`。沒有歷史、沒有來源 hash、沒有信心分數。`docs/cfpb-pipeline-diagnosis-2026-04-22.md` 提的 fact-store 模型還沒蓋。
- **沒有 review queue**:CFPB extractor 信任 regex 結果直接寫 — 所以才會把 `12` 寫進 `annual_fee`。
- **沒有 CI gate**:`validate-all.ts` 存在但似乎沒掛 GitHub Actions(`.github/` 只有 1 個 dir,沒看到 workflow)— 跑了也只是 local。
- **AGENTS.md / CLAUDE.md 是 stub**(11 字元)— 沒有 agent guidance,新 agent 進來容易再亂改一次。

---

## Day 1 — 停損(今天/明天)

### 1. Revert CFPB-corrupted annual_fee

把 `cfpb_verified=true` 的 24 張卡的 `annual_fee` 反查到 Issuer 官方真實值。下面這個 script 是建議起手點(讀取 git 上一個 well-known commit 的版本當參照):

```bash
# 1. 先 inventory 受害卡片
node -e "
const fs = require('fs');
const path = require('path');
const cards = fs.readdirSync('data/cards').filter(f => f.endsWith('.json'));
const bad = [];
for (const f of cards) {
  const c = JSON.parse(fs.readFileSync('data/cards/' + f, 'utf8'));
  // CFPB-touched + 高年費卡看起來不對 → 進清單
  if (c.cfpb_verified && c.annual_fee != null && c.annual_fee > 0 && c.annual_fee < 50) {
    bad.push({ card_id: c.card_id, name: c.name, annual_fee: c.annual_fee });
  }
}
console.table(bad);
"

# 2. 從 origin/main 上一個沒被 CFPB pipeline 動過的 commit 取舊值(範例:32540a7 之前)
# 找出每張卡 annual_fee 第一次被改的 commit:
for card in amex-platinum amex-delta-reserve amex-hilton-honors-aspire ...; do
  git log --oneline -p -- "data/cards/${card}.json" | head -50
done

# 3. 手動 patch 回正確值,加 _quarantine flag
```

具體已知必須回去的值(交叉比對 issuer 官網 + 你之前的 audit 報告):

```
amex-platinum            12  → 895
amex-delta-reserve       12  → 650
amex-hilton-honors-aspire 12 → 550
amex-hilton-surpass      12  → 150
amex-hilton-honors        12  → 0
amex-marriott-bevy       12  → 250
amex-plum                12  → 250
amex-green               (檢查)→ 150
delta-skymiles-blue-amex 12  → 0
amex-everyday            95  → 0  (everyday 是 no-AF)
amex-everyday-preferred  95  → 95 (對的)
amex-bce / amex-blue-cash-everyday   12 → 0
amex-bcp / amex-blue-cash-preferred  12 → 95
centurion-card-amex      5   → 5000(初始)/ 10000(annually)
chase-ink-preferred-plus 8   → 195
penfed-platinum-rewards  2   → 0
```

(這份只是初稿 — 接手時 issuer 官網都要再確認一次。)

### 2. Rotate Upstash token

```bash
# 1. 進 Upstash console rotate token
# 2. 從 vercel.json 移除 UPSTASH_KV_REST_API_* 兩行
# 3. 改用 vercel env add UPSTASH_KV_REST_API_URL production
#                vercel env add UPSTASH_KV_REST_API_TOKEN production
# 4. 修 .gitignore 確保未來 vercel.json 不會 commit secrets
# 5. git filter-repo 或 BFG 把舊 commit 的 token 從歷史抹掉(可選)
```

### 3. 鎖死 CFPB pipeline 寫入

在 `scripts/pipelines/cfpb/` 開頭加 kill switch:

```python
# scripts/pipelines/cfpb/_DISABLED.flag
# 任何 apply_*.py 啟動時先讀這個 flag
import os, sys
if os.path.exists(os.path.join(os.path.dirname(__file__), '_DISABLED.flag')):
    print('CFPB pipeline disabled. Remove _DISABLED.flag to enable.')
    sys.exit(1)
```

並在所有 `apply_*.py` 和 `run_extractor_v6.py` 開頭加上這個 check。

---

## Week 1 — Pipeline consolidate + 防再壞

### A. Pipeline 重整(1-2 天)

`scripts/pipelines/cfpb/` 目前 30 檔案 / 2972 行。我建議的目標結構:

```
scripts/pipelines/cfpb/
├── README.md                 ← 解釋 pipeline 流程
├── config/
│   ├── issuer_mapping.json   ← 已有,保留
│   ├── card_aliases.json     ← 新建:card_id ↔ PDF canonical name
│   └── known_pdfs.json       ← 已有,保留
├── extract.py                ← 1 entry point(取代 run_extractor_v2-v6)
├── lib/
│   ├── pdf_text.py           ← PDF 抽文(pdfminer/pdfplumber wrapper)
│   ├── schumer_box.py        ← Schumer Box 抽取(取代 schumer_extractor + v2)
│   ├── name_match.py         ← canonical name 抽取 + fuzzy match
│   ├── filing_classifier.py  ← per-card / family / spanish 判斷
│   └── apply.py              ← 寫入 fact store(取代 apply_* × 6)
├── tests/
│   ├── fixtures/             ← 50 個典型 PDF 文字片段
│   └── test_schumer.py       ← regex / LLM 抽取測試
└── archive/                  ← 把 v2-v5 的舊版本搬進來保留歷史
```

**規則**:`extract.py` 是唯一 entry point,所有舊版搬進 `archive/` 不再執行。

### B. Schumer Box 抽取改 LLM-first

regex 已證明不可靠(`12 monthly billing cycles` → annual_fee=12)。改 LLM:

```python
# lib/schumer_box.py
PROMPT = """從以下 cardmember agreement 第一頁文字抽出 Schumer Box 數值。
只回 JSON 不解釋。空值用 null。

要求:
1. annual_fee 是「持卡每年支付給發卡行的固定費用」,**不是月費、不是首年免年費後第幾期、不是 monthly billing cycle 數字**
2. 找到了但確定數字寫不出來(如 "$0 to $550 depending on credit limit")回 {"annual_fee_min": 0, "annual_fee_max": 550, "annual_fee": null}
3. foreign_transaction_fee 是百分比(0 表示無手續費)
4. 所有 APR 是百分比

JSON 格式:
{
  "annual_fee": <number>|null,
  "annual_fee_min": <number>|null,
  "annual_fee_max": <number>|null,
  "foreign_transaction_fee_pct": <number>|null,
  "apr_purchases_min": <number>|null,
  "apr_purchases_max": <number>|null,
  "apr_cash_advances": <number>|null,
  "penalty_apr": <number>|null,
  "late_fee_max": <number>|null,
  "cash_advance_fee_pct": <number>|null,
  "cash_advance_fee_min": <number>|null,
  "card_canonical_name": <string>
}

PDF 文字:
"""
```

每張 PDF 1 次 call ≈ 2k tokens in / 200 tokens out。GPT-5 mini ~ $0.005/張。**248 張全部跑下來 < $2**。比 regex 對。

並加 sanity rule:
- `annual_fee in [0, 1, 2, 3, 5, 8, 10, 12, 15, 17, 18, 19]` → flagged for review(這些幾乎都是誤判)
- `annual_fee > 5000` → flagged(只有 Centurion / Hidden Casino 等罕見卡會這樣)

### C. Fact store + review queue(Week 1 後半)

直接照 `docs/cfpb-pipeline-diagnosis-2026-04-22.md` 那份的 `FactEvent` 模型實作,用 Upstash list:

```ts
// Key pattern: card_facts:{card_id}:{field_path}
// LPUSH 一個 JSON event,LRANGE 0 0 取最新

// 寫入路徑
async function ingestFact(fact: FactEvent) {
  const current = await getCurrentFact(fact.card_id, fact.field_path);
  
  // Sanity gates
  if (fact.field_path === 'annual_fee') {
    if (fact.value < 50 && fact.value > 0 && card_is_premium(fact.card_id)) {
      // 高端卡年費 < $50 = 一定是 regex bug
      return queueForReview(fact, 'sanity_low_premium_fee');
    }
  }
  
  // CCAD 直接 publish
  if (fact.source.type === 'cfpb_ccad' && fact.confidence >= 0.9) {
    if (current?.value !== fact.value) {
      // 值改了 → 進 review,別自動 overwrite
      return queueForReview(fact, 'value_changed');
    }
    return touchFact(current.id, fact.source); // 只更新 last_verified
  }
  // 其他來源全部進 queue
  return queueForReview(fact, 'non_authoritative');
}
```

**禁止 pipeline 直接寫 `data/cards/*.json`**。改成寫 fact_event,再由 review-approval flow 投到 cards JSON。

### D. CI gate

`.github/workflows/validate.yml`:

```yaml
on: [pull_request, push]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx tsx scripts/validate-all.ts
      - run: node scripts/lint-tags.js
      - run: node scripts/data-sanity-check.js
```

把 `validate-all.ts` 加上 sanity rules:`annual_fee` 範圍檢查、premium 卡(年費 ≥ $250 tag)如果 < $50 直接 fail。

---

## Week 2 — 把 CFPB 覆蓋從 16% 拉到 ~60%

(完全照 `docs/cfpb-pipeline-diagnosis-2026-04-22.md` Section "立即(本週):從 16% → ~60%" 的步驟,但這次:)

1. 用 LLM 抽 Schumer Box(替掉 regex)
2. 強制 sanity gate(premium 卡 fee 太低 → 進 queue)
3. 過濾 `Contrato_*.pdf` 西班牙文
4. card_aliases.json 半人工建立(每季新增 < 10 條)

預估完成後:
- ~150 張卡有 CCAD-verified `annual_fee` / `foreign_transaction_fee` / `penalty_apr` / `late_fee` / `apr_purchases` / `apr_cash_advances`
- Provenance: `source.url + content_hash + filing_quarter`,每張卡頁面都能顯示「驗證自 CFPB Q3 2025 filing」

---

## Month 1 — Plan B + 主打功能

### A. Plan B disclosure scraper(BoA + Synchrony + Capital One 零售)

`docs/plan-b-disclosure-pages.md` 已起草,但 URL list 還沒驗證。任務:

1. 對 BoA 17 張卡逐一找 disclosure URL(範例 `bankofamerica.com/credit-cards/cards/<card>/disclosures/`)
2. Playwright(已在 dependencies)抓 inline HTML 的 Schumer Box
3. 標 `confidence: 0.85`(因為來源是 issuer self-published)
4. 加 weekly cron 重抓

### B. recurring_credits 補資料(P0)

70/249 → 目標 200/249 (80%)。**這是 OpenCard 主打功能的命脈**。

策略:
- 已有的 `scripts/credits-scraper.ts` + `scripts/unified-scraper.ts` 是起手點 — 但讀完之後會發現它們也是手寫迭代(沒 fact store)
- 改用 LLM extraction over issuer marketing pages(比 CCAD 簡單,因為這些頁面 HTML 結構就是 list)
- 統一 `amount` 語意:必須是「單期」金額,搭配 `frequency` 算年化(目前混用)
- 補 `reset_type`(67/199 缺值)

### C. 修掉 amex-platinum 那組明顯錯資料

我看到 `data/cards/amex-platinum.json` 的 `recurring_credits` 有問題:

```json
{ "name": "Free Night Award", "amount": 35000, "frequency": "annual" }
```

- `35000` 是 Marriott Bonvoy 點數,不是美元 → 寫到 amount(美元)欄位錯
- Free Night Award 是 Marriott Brilliant 的 benefit,不是 Platinum
- "Saks Fifth Avenue" 標 `DISCONTINUED 2026` 但 `amount: 0` 還留著 → 應整個刪除

外加 `category` 欄位多筆缺失。整張卡需要重做一次。

### D. 重複卡片清理

DB 有疑似重複:
- `amex-bce` AND `amex-blue-cash-everyday`
- `amex-bcp` AND `amex-blue-cash-preferred`
- `delta-skymiles-blue-amex` AND `amex-delta-blue`

跑一次 dedupe migration,選 canonical id(建議短的`amex-bce`),把所有引用 redirect 到新 id。

---

## Month 2 — UX / SEO / 信任訊號

(這部分有 `docs/audit-2026-04-22.md` 已經寫得很完整,只需要動手做)

優先序:

1. **首頁 127k px 分頁/虛擬化** — 必須做,手機體驗 + SEO
2. **498 顆 emoji 按鈕加 aria-label** — 1 天 PR
3. **8 個 select 加 label** — 同上
4. **每張卡頁加 JSON-LD `FinancialProduct` schema** — 1 天
5. **每張卡頁加 og:image** — 用卡面卡片美術
6. **「Track this card」sticky CTA on detail page** — 提高訂閱轉換
7. **Database health 公開展示**(每張卡頁顯示 "Schumer Box verified Q3 2025 / Recurring credits last reviewed 14 days ago") — 信任訊號是免費的競品差異化

---

## 不做的事(刻意決定)

- ❌ **AgentMail Kacey 私人 email 被 block** — 這是 Amazon SES 該處理,不是我們的問題,等 Kacey 找 SES 重發或換 mailbox。
- ❌ **Bilt / Robinhood / Petal 等長尾卡的 CCAD 自動抓** — 變動少,半年人工一次。
- ❌ **MiniMax M2.7 isolated session 修穩定** — 這是 agent infra,不是 OpenCard product。
- ❌ **加新發卡行**(在還沒把 249 張現有的弄對之前)— 先把已有的修對,再擴張。

---

## 給接手者的 quick wins(第一天上手就能做)

| 任務 | 難度 | 影響 | 預估時間 |
|---|---|---|---|
| Revert 24 張卡的 annual_fee | 低 | 線上資料正確性 | 2 小時 |
| Rotate Upstash token + 移到 env vars | 低 | secrets 安全 | 30 分 |
| 在 cfpb pipeline 加 kill switch | 低 | 防再壞 | 15 分 |
| 修 `/api/cards` summary 參數語意(rename + comment 一致) | 低 | DX | 30 分 |
| 把 schumer_extractor.py / v2 之外的 4 個版本搬到 `archive/` | 低 | 維護性 | 30 分 |
| `.github/workflows/validate.yml` 加 CI | 中 | 防再壞 | 1-2 小時 |
| 在 amex-platinum.json 修 Free Night Award + Saks 兩筆 | 低 | 資料正確性 | 15 分 |
| 重複卡片(bce/bcp/delta-blue)dedupe | 中 | DB 整潔 | 半天 |

---

## 還沒搞清楚 — 要問 Kacey 的問題

1. **`vercel.json` 那個 Upstash token 是不是已經 rotated 過、目前 production 在用的是新的?** 如果 production 早就改 env vars,那 vercel.json 裡的就是 stale 範例 — 還是要刪,但緊急度降低。
2. **AGENTS.md / CLAUDE.md 為什麼是 stub(11 字元)?** 是還沒寫,還是刻意空的?要不要補?
3. **GitHub Actions 怎麼 deploy?** 看 `.github/` 是有 dir 但沒看到 workflow 檔。
4. **`reference-list.json`**(21k 行)是 NerdWallet 抓下來的快照?多久更新一次?
5. **`docs/TASKS.md` 講 "Jisoo / Rosé / Jennie / KIRO / Lisa" agent 分工** — 這些目前還在跑嗎?還是接手後改成 1 人 + Claude 流?

---

## 結語

這份 takeover plan 的精神是:**先停損,再修復,再擴張**。

別管 16% → 60% → 76% 這條 CFPB 覆蓋率曲線多誘人 — 在解決 P0 「線上資料正確性」之前,所有自動化都會放大錯誤而不是解決它。等 Day 1 三件事做完,Week 1 結構整理完,後面才能放心衝。

我建議:**今天的目標就是 Day 1 那三件事(revert、rotate、kill switch),不要超出**。

— Claude, 2026-04-25
