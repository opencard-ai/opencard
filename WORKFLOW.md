# OpenCard 信用卡資料庫建置流程

*建立時間：2026-04-13*
*適用範圍：資料庫建置、補卡、新增卡片*

---

## 核心概念：來源優先

銀行官方截圖 > 論壇共識 > 個人猜測

---

## 流程一：完整市場普查（確定該收哪些卡）

### Step 1：找來銀行內部系統截圖
- 目標：每個發卡機構的完整卡列表（如 mobile app "Add Credit Card" 清單）
- 為什麼：用銀行自己的列表，確保不會漏掉任何一張卡
- 來源：論壇截圖、朋友提供、爬蟲（任何能完整呈現卡名+年費清單的截圖）

### Step 2：建立 MASTER_CARD_LIST.md
- 把所有截圖轉文字，整理成每家銀行的完整卡清單
- 格式：`[ ] 卡名 ($年費)` — 清楚標示已研究 vs 缺口

### Step 3：對比人氣論壇確認優先順序
- 爬 r/churning、The Points Guy、Doctor of Credit、NerdWallet 等
- 找出各來源共同推薦的卡（= 大眾化的熱門卡）
- 分層：
  - **Tier 1 (4+ sources)**：必收，市場共識最高的卡
  - **Tier 2 (2-3 sources)**：建議收，有特定受眾
  - **Tier 3 (1 source)**：niche 卡，可選

### Step 4：設定目標
- **精實版**：40-50張，涵蓋所有 Tier 1 + 多數 Tier 2
- **完整版**：80-100張，涵蓋所有有意義的卡

---

## 流程二：研究階段（分頭進行）

### 原則
- 每批研究 3-4 張卡（太多會逾時）
- 每張卡至少 2 個來源交叉驗證
- 研究完成馬上寫入磁碟（不要等到最後）

### 每人任務模板
```
研究 [issuer] 的 [N] 張卡：
1. card-name-1
2. card-name-2
...

每張卡收集：
- Welcome bonus（確切數字，含消費門檻/時間限制）
- Annual fee（含是否有首年免年費）
- Earning rates（各類別回饋率）
- Annual credits（各項抵銷額度）
- Foreign transaction fee
- 旅遊保險內容
- FHR/THC 適用與否
- 資訊來源（至少 2 個）

寫入：data/research/[issuer]/[card-id].json
```

### 來源優先順序
1. 銀行官網（最高權威）
2. Doctor of Credit（美國最大信用卡資訊站）
3. US Credit Card Guide（中文讀者友好）
4. The Points Guy / NerdWallet（大型綜合資訊）
5. Reddit r/churning（第一手經驗分享）

---

## 流程三：共識核查

### 自動化核查（auto-check.mjs）
```bash
node bin/auto-check.mjs
```
- 對每張卡的 welcome bonus 和 annual fee 做多來源驗證
- 共識 2+ 來源 → 自動更新
- 單一來源 → 標記待審查
- 差異過大 → Discord alert

### 人工覆核（更新網站前必做）
在 ISSUES.md 查看標記為 `needs_review` 的卡，確認：
- [ ] annual_fee 是否與官網一致
- [ ] welcome bonus 是否為 current offer（有些是有期限的）
- [ ] earning rates 是否有誤

---

## 流程四：寫入網站資料庫

### 確認 JSON Schema
所有卡統一使用以下 Schema：
```json
{
  "card_id": "string",
  "name": "string",
  "issuer": "string",
  "network": "Visa|MC|Amex|Discover",
  "annual_fee": number,
  "foreign_transaction_fee": number,
  "credit_required": "Excellent|Good|Fair",
  "welcome_offer": {
    "spending_requirement": number,
    "time_period_months": number,
    "bonus_points": number or null,
    "free_nights": number or null,
    "description": "string",
    "point_program": "string"
  },
  "earning_rates": [
    {"category": "string", "rate": number, "notes": "string or null"}
  ],
  "annual_credits": [
    {"name": "string", "amount": number or null, "frequency": "string", "description": "string"}
  ],
  "travel_benefits": {...},
  "fhr_thc": {"fhr_eligible": boolean, "thc_eligible": boolean},
  "insurance": {...},
  "sources": [{"url": "string", "notes": "string"}],
  "confidence": "high|medium|low",
  "last_verified": "ISO date"
}
```

### 寫入 steps
1. 確保所有 research JSON 符合 schema
2. 執行 `build-master.mjs` 重建 MASTER.json
3. 確認 metadata（total_cards, verified, needs_review）
4. 確認網站 UI 能正確讀取新欄位

---

## 流程五：持續更新（新卡片上線）

### 觸發時機
- 新卡上市（銀行公告、論壇發現）
- 現有卡 offer 變更（Doctor of Credit RSS alert）
- 季節性 elevated offer（常見於 Q1）

### 更新步驟
1. 找到該卡的最新資訊（2+ 來源）
2. 更新 research JSON 檔案
3. 執行 `build-master.mjs`
4. 檢查 ISSUES.md 是否還有該卡

### 自動化監控（待建）
- 每週抓 Doctor of Credit RSS（auto-check.mjs）
- 論壇關鍵字 alert（當某卡被大量討論時自動通知）

---

## 常見問題

**Q：研究 agent 逾時怎麼辦？**
A：每批上限 3-4 張卡，timeout 設 300s。未完成的 agent 之後單獨補。

**Q：銀行截圖從哪裡來？**
A：目前主要來源是 Discord 截圖。未來可考慮爬蟲或 API。

**Q：confidence 等級怎麼定義？**
A：
- High：2+ 來源一致，且資料與官網完全符合
- Medium：1 來源完整，其他來源部分確認
- Low：只有 1 來源，或來源之間有矛盾

---

*最後更新：2026-04-13*
