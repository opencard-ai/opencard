# OpenCard Architecture — v3.0
## Based on credit-card-wiki (Existing Infrastructure)

**credit-card-wiki** = 資料庫 + CMS 底層（已完整建置）
**OpenCard** = 前端展示 + AI 推薦引擎 + 附屬連結變現

---

## 現有系統（credit-card-wiki）

### 資料格式（已完整定義）
每張卡的 JSON Schema 包含：
```json
{
  "card_id": "chase-sapphire-preferred",
  "name": "Chase Sapphire Preferred Card",
  "issuer": "Chase",
  "network": "Visa Signature",
  "annual_fee": 95,
  "foreign_transaction_fee": 0,
  "credit_required": "Good-Excellent",
  "welcome_offer": { ... },
  "earning_rates": [ ... ],
  "annual_credits": [ ... ],
  "travel_benefits": { "lounge_access": [], "hotel_status": [], "other_benefits": [] },
  "fhr_thc": { "fhr_eligible": true, "thc_eligible": false, ... },
  "insurance": { "trip_cancellation": true, ... },
  "hotel_program": { ... },
  "application_rules": { ... },
  "last_updated": "2026-04-09",
  "sources": [ ... ],
  "tags": [ ... ]
}
```

### CMS 架構（Decap CMS）
- Admin UI: `https://opencard.ai/admin`（或自架）
- 支援創建/編輯/刪除卡片（透過 Git commit）
- 每個異動都版本化、可回溯
- 不需要直接改 JSON 檔

### 卡片現況
```
14 張卡片（JSON）：
├── amex-hilton-aspire, amex-hilton-honors, amex-hilton-surpass
├── amex-platinum-personal
├── apple-card
├── bofa-atmos-ascent, bofa-atmos-summit, bofa-customized-cash, bofa-travel-rewards
├── chase-marriott-boundless
├── chase-sapphire-preferred, chase-sapphire-reserve
├── citi-strata-elite
└── discover-customized-cash

飯店計畫：
├── Hilton Honors
├── Marriott Bonvoy
├── IHG Rewards
└── World of Hyatt
```

---

## OpenCard 新增功能

### 1. AI 推薦引擎（新增）
```
輸入：用戶消費習慣、偏好
查詢：讀取 credit-card-wiki/cards/*.json 整個卡池
評分：根據用戶條件對所有卡評分排序
輸出：Top 3 推薦 + 附屬連結
```

### 2. 動態頁面生成（新增）
```
/ → 全部卡片列表（動態讀取 JSON）
/cards/[card_id] → 單張卡頁面（由 JSON 模板生成）
/compare → 卡片比較工具
/recommend → AI 對話入口
```

### 3. 附屬連結系統（新增）
```json
// 在現有 JSON 中新增一個欄位
{
  "card_id": "chase-sapphire-preferred",
  "affiliate": {
    "awin_id": "...",
    "cj_id": "...",
    "direct_link": "https://chase.com/applynow?src=...",
    "commission_tier": "high",
    "payout_per_approval": 75
  }
}
```

### 4. 展示廣告整合（新增）
- 側邊欄廣告（固定位置）
- 文章內嵌橫幅（每 500 字一個）
- AI 對話框下方（相關推薦旁）

---

## 更新流程

### 新增卡片
```
1. 進入 Decap CMS admin
2. 點「Add Card」
3. 填入表單（與現有 JSON schema 一致）
4. 點 Save → 自動 commit 到 Git
5. GitHub webhook 觸發 Vercel rebuild
6. 新頁面自動上線（URL: /cards/[card_id]）
```

### 更新卡片資訊
```
1. CMS 編輯現有卡片
2. 更新內容（年費、改版、新福利等）
3. 自動更新 last_updated 時間戳
4. 頁面自動刷新
```

### AI 資料同步
```
Vercel build 時：
1. git pull 最新 cards/ JSON
2. 重新生成靜態頁面
3. 更新 AI 引擎的卡片索引
4. Deploy 完成
```

---

## 架構圖

```
┌─────────────────────────────────────────────────────────┐
│                    OpenCard Frontend                     │
│  (Next.js + Tailwind + Vercel)                         │
│                                                          │
│  / (首頁)    /cards/[id]  /compare  /recommend         │
│  │           │              │         │                │
│  └───────────┴──────────────┴─────────┘                │
│                      │                                  │
│                      ▼                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │  AI Recommendation Engine                         │   │
│  │  (MiniMax Haiku/Sonnet)                          │   │
│  │  Reads: full card pool JSON                       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           credit-card-wiki (CMS + Data)                 │
│                                                          │
│  Decap CMS (admin/)  ←  內容團隊用這個新增/編輯卡片    │
│         │                                                 │
│         ▼                                                 │
│  cards/*.json (14 張卡完整資料)                          │
│  hotel-programs/ (飯店計畫)                             │
│         │                                                 │
│         ▼                                                 │
│  GitHub repo (版本控制)                                  │
│         │                                                 │
│         ▼                                                 │
│  Vercel rebuild (GitHub webhook)                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    變現層                               │
│                                                          │
│  Awin / CJ Affiliate (信用卡申請佣金 $50-200+/筆)       │
│  Google AdSense (展示廣告，被動收入)                   │
│  Direct brand deals (中期目標)                          │
└─────────────────────────────────────────────────────────┘
```

---

## 合規框架（全團隊共識）

所有頁面必備：
```
1. FTC 揭露聲明（每頁）
2. 「本內容不構成理財建議」免責
3. AI 推薦結果附加說明（核卡與否由銀行決定）
4. 資訊更新時間戳（last_updated）
5. 資料來源連結
```

---

## 技術棧

| 層面 | 技術 | 備註 |
|------|------|------|
| 前端框架 | Next.js + Tailwind | SSG + 動態路由 |
| 資料來源 | credit-card-wiki/cards/*.json | Git 版本控制 |
| CMS | Decap CMS (已有) | 內容管理 |
| AI | MiniMax (Haiku + Sonnet) | 意圖分類 + 推薦生成 |
| 部署 | Vercel | 連結 GitHub repo |
| 附屬追蹤 | 自建連結表 | 記錄點擊、轉化 |
| 廣告 | Google AdSense | 金融廣告 CPM 高 |

---

## 目前擁有什麼（credit-card-wiki）

✅ 14 張完整卡資料（JSON）
✅ Decap CMS admin 系統
✅ Git 版本控制
✅ 飯店計畫資料
✅ 資料格式定義完整

## OpenCard 需要做什麼

🔲 Next.js 前端
🔲 AI 推薦引擎
🔲 附屬連結追蹤系統
🔲 動態路由（讀取 JSON 生成頁面）
🔲 變現整合（Awin + AdSense）
