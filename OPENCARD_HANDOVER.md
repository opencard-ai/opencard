# OpenCard 專案交接報告

> 最後更新：2026-04-25
> 交接人：Kacey
> 接管者：待填寫

---

## 📋 專案概述

**OpenCard** 是一個信用卡福利比價網站，幫助用戶比較各類信用卡的福利、开卡礼、年费和 recurring credits。

- **網址**：https://opencardai.com
- **GitHub**：https://github.com/opencard-ai/opencard
- **技術棧**：Next.js 14 (App Router)、TypeScript、Tailwind CSS
- **托管**：Vercel

---

## 🔑 重要憑證與 API Tokens

> ⚠️ **所有真實 token 請聯繫 Kacey 獲取，勿將真實憑證寫入 git**

### Vercel Deploy Token
- **用途**：CLI 部署
- **取得方式**：聯繫 Kacey

### AgentMail API（Email 功能）
- **用途**：用戶訂閱郵件通知
- **取得方式**：聯繫 Kacey

### Upstash Redis（用戶訂閱資料）
- **用途**：儲存 My Cards 用戶訂閱資訊
- **URL & Token**：聯繫 Kacey

### Google Search Console API
- **用途**：每日 GSC 排名報告
- **取得方式**：聯繫 Kacey

---

## 📁 專案結構

```
opencard/
├── app/
│   ├── [lang]/              # 多語言支援（en, zh, es）
│   │   ├── cards/           # 卡片詳情頁
│   │   ├── my-cards/        # 用戶我的卡片頁面
│   │   └── page.tsx         # 首頁（卡片列表）
│   ├── api/                 # API 路由
│   └── components/          # React 元件
├── data/
│   ├── cards/               # 249 張信用卡 JSON 檔案
│   ├── reference-list.json  # NerdWallet 參考清單
│   └── opencard-email-state.json  # Email 監控狀態
├── scripts/
│   ├── batch-add-cards.js   # 批次新增卡片
│   ├── check-new-cards.js   # 新卡片追蹤
│   ├── sync-news.mjs        # News Feed 同步
│   ├── gsc-daily.ts         # GSC 報告
│   └── unified-scraper.ts  # 福利資料爬蟲
└── docs/
    ├── MAINTENANCE.md       # 維護手冊
    ├── TASKS.md             # 任務追蹤
    └── API.md               # API 文件
```

---

## 🗄️ 資料庫

### 卡片資料（249 張）
- **位置**：`data/cards/*.json`
- **命名規範**：`{issuer}-{card-name}.json`，全小寫、連字號分隔
- **重要欄位**：
  - `card_id`、`name`、`issuer`、`network`、`annual_fee`
  - `welcome_offer`：开卡礼
  - `recurring_credits`：年度福利
  - `earning_rates`：回饋比率
  - `last_updated`

### 用戶訂閱資料（Upstash Redis）
- **Key Pattern**：`opencard:user:{email}`、`opencard:subscribers`

---

## 🚀 部署流程

### 標準部署
```bash
git add . && git commit -m "message" && git push origin main
# 自動觸發 Vercel 部署
```

### 緊急部署（使用 token）
```bash
npx vercel --prod --yes --token <VERCEL_TOKEN>
```

### Vercel Project ID
```
prj_SSAFkOhbChUOTxUjU3mYEb3Qwy9D
```

---

## ⏰ Cron Jobs

| # | Job | Schedule | 用途 |
|---|-----|----------|------|
| 1 | OpenCard Email Monitor | 每 2 小時 | 監控新郵件 |
| 2 | OpenCard News Feed Sync | 1,7,13,19時 | 同步新聞 |
| 3 | OpenCard GSC Daily Report | 每天 9:30 | Google 搜尋報告 |

---

## 🔧 日常維護

### recurring_credits 修正（每季）
檢查 Amex Platinum、Chase Sapphire 等卡的福利金額：
- Uber Cash、Walmart+、Clear 等是否正確
- Saks Fifth Avenue（已停發）
- 金額是否為 annual 值

### Welcome Offer 更新（每季）
- 對比 DoC（Doctor of Credit）歷史最高 offer
- 修正 CSR（125k）、CSP（100k）等卡的 welcome offer

### 新卡片追蹤（每週）
```bash
# 比對 reference-list.json 和 data/cards/
```

### 資料庫品質檢查
```bash
node scripts/data-sanity-check.js
npx tsx scripts/validate-all.ts
```

---

## 📝 命名規範

### 卡片檔案
- **Issuer 優先**：`chase-sapphire-reserve`（非 `sapphire-reserve-chase`）
- **商務卡加 `-biz`**：`amex-business-platinum`
- **全小寫、連字號分隔**

### 正確範例
- `chase-sapphire-reserve.json`
- `amex-platinum.json`
- `amex-business-gold.json`

---

## 🔍 資料來源優先級

1. **Issuer 官網**（最準確）
2. **Doctor of Credit（DoC）**（welcome offer 歷史）
3. **NerdWallet / The Points Guy**（定位參考）
4. **Reddit**（僅作輔助）

---

## ⚠️ 已知問題

1. **AgentMail kccx0325@gmail.com 被 block** — Amazon SES bounce，待解決
2. **check-new-cards.js ESM 問題** — 使用 Python 代替
3. **MiniMax isolated session 不穩定** — 加 `model: minimax/MiniMax-M2.7`

---

## 📚 延伸閱讀

- `docs/MAINTENANCE.md` — 詳細維護手冊
- `docs/TASKS.md` — 任務追蹤

---

*本報告由 Kacey 整理於 2026-04-25*