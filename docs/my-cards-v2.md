# OpenCard — 個人信用卡管理中心 (My Cards V2)

> 紀錄日期：2026-04-17
> 討論成員：KC + Kacey + KIRO (PM) + Jisoo (UX) + Rosé (待完成)

---

## 1. 願景

把「我的卡片」從目前的「已持有卡片 checkbox 清單」升級為**個人信用卡管理中心**。

用戶不只是記錄自己有哪些卡，而是：
- 知道每張卡的可用福利
- 收到個人化的福利到期提醒
- 不再錯過任何回饋

**核心價值主張：** 主動提醒，省錢實際。

---

## 2. 頁面架構

```
┌─────────────────────────────────────────────┐
│  📊 儀表板（Dashboard）                      │
│  ・即將到期福利（30天內）                      │
│  ・本月可刷額外回饋的機會                      │
├─────────────────────────────────────────────┤
│  💳 我的卡片（Card Portfolio）                 │
│  ・已持有卡片清單                            │
│  ・每張卡的福利一覽                           │
│  ・加卡雷達（新卡推薦）                        │
├─────────────────────────────────────────────┤
│  🔔 提醒中心（Alerts）                        │
│  ・所有待處理事項清單                         │
│  ・通知設定（email 開關、頻率）                │
└─────────────────────────────────────────────┘
```

**設計原則：** 用戶第一眼看到「我該做什麼」，而不是「我有哪些卡片」。價值在 action，不在 inventory。

---

## 3. 福利提醒邏輯

### 3.1 自動福利來源（無需用戶手動設定）

從卡片資料庫的 `recurring_credits` 欄位自動帶出：

```json
// Amex Platinum 資料庫範例
"recurring_credits": [
  { "name": "$100 Resy Credit", "frequency": "quarterly", "category": "dining" },
  { "name": "$75 lululemon", "frequency": "quarterly", "category": "shopping" },
  { "name": "$300 Hotel Credit", "frequency": "semi_annual", "category": "travel" },
  { "name": "$200 Airline Fee Credit", "frequency": "annual", "category": "travel" },
  { "name": "Clear + Global Entry", "frequency": "annual", "category": "travel" }
]
```

### 3.2 提醒觸發時機（統一月曆節奏）

| 時間 | 內容 |
|------|------|
| **每月 1 號** | 本月能用的福利：$100 Resy 可使用、加油 3% 等 |
| **每月 20 號** | 月底前 10 天催促進度：季度 credit 還剩 $40 未使用 |

**為什麼不用 +90 天循環？**
- 用戶認知統一（不用記每張卡什麼時候刷新）
- 系統邏輯更簡潔
- 避免「某張卡 2/15 刷新、某張卡 3/20 刷新」的混亂

### 3.3 提醒觸發完整時機表

| 福利類型 | 提醒時機 |
|---------|---------|
| 季租回饋（加油/超市/外送）| 每月 1 號 + 20 號 |
| 上/下半年特定優惠 | 該半年度最後 45 天 |
| 年度點數/回饋清零 | 到期前 14 天 + 7 天 |
| 年費到期 | **提前 45 天**（給足剪卡時間）|

**年費到期：方案 A + 方案 B 結合**
- 用戶加卡時詢問「持卡日期（選填）」
- 方案 A：用戶自填開卡日 → 精準算到期日
- 方案 B：用戶不填 → 照樣顯示「持卡年費 $X，提醒每年重新評估是否值得續持」

---

## 4. Email 收集 UX

### 4.1 最佳時機

**第一次進入 My Cards 頁面**，配合價值引導：

```
用戶新增第一張卡片 → 首次進入 My Cards 頁面
        ↓
引導：「開啟個人化福利提醒，確保每季回饋不漏接」
        ↓
一行解釋 + email 輸入框 + 行銷同意勾選
```

### 4.2 Email 價值交換（必須立即可見）

收集時就預覽「你會收到什麼」，而非空口說「我們會通知你」。

```
開通福利提醒後，每月 1 號你會收到：
✅ $100 Resy 餐飲 credit 可使用（Amex Platinum）
✅ 本季度加油回饋還有 $40 未刷滿（Chase Freedom）
✅ 3 張卡年費即將到期，價值 $450
```

### 4.3 隱私合規

- email 為自願填寫
- 行銷同意需主動勾選（不預設打勾）
- 說明用途：「用於發送個人化福利到期提醒」

---

## 5. 技術方案

### 5.1 架構選擇

| 組件 | 方案 |
|------|------|
| Email 發送 | AgentMail API（已有 key）|
| 用戶資料儲存 | Vercel KV（email + card_id 清單）|
| 提醒排程 | Vercel Cron Job（每天檢查一次）|

### 5.2 cron job 邏輯

```
每天凌晨 1 次
  ↓
查詢 Vercel KV：所有有 email 的用戶
  ↓
依據其持有卡片的 recurring_credits，計算：
  - 本月 1 號應有哪些福利
  - 本月 20 號應催促進度
  ↓
批次發送（用 AgentMail）
```

**這個規模用一個 cron 服務所有人，不是每用戶一個 cron。**

| 用戶規模 | 單日發送量 |
|---------|-----------|
| 3,000 人 | 數百到數千封（取決於持有卡片數）|

### 5.3 資料模型

```
UserProfile {
  email: string          // 用戶 email
  cards: string[]        // 持有的 card_id 清單
  card_open_dates?: { [card_id]: string }  // 可選：用戶自填開卡日
  marketing_optin: bool  // 行銷同意
  created_at: timestamp
}

CardRecurringCredits (卡片資料庫新增欄位) {
  recurring_credits: [
    {
      name: string       // "$100 Resy Credit"
      frequency: string   // "quarterly" | "semi_annual" | "annual"
      category: string   // "dining" | "travel" | "shopping" | "gas"
    }
  ]
}
```

### 5.4 資安說明

**localStorage 目前存的資料：**
```json
// key: opencard_existing_cards
["chase-sapphire-reserve", "amex-platinum"]
```

| 資料 | 敏感性 |
|------|--------|
| card_id 清單 | **零** — 僅為公開產品代號，無個人識別性 |
| email | 存在 Vercel KV，透過 AgentMail API 處理 |
| 真實卡號 | **從未儲存** |

**威脅模型：** XSS 攻擊者拿到 card_id 清單，無法做任何實質危害（無卡號、無法交易）。

**PCI DSS：不適用** — 我們不做支付卡儲存，只做卡片 metadata。

---

## 6. MVP 版本

### ✅ MVP 先做

1. **卡片資料庫新增 `recurring_credits` 欄位**
   - 先補旗艦卡（Amex Platinum, Chase Sapphire Reserve, CSR, Amex Gold 等 10-15 張）
   - 志願者模式：社群幫忙補其餘卡片

2. **My Cards 頁面改版**
   - 每張卡下面顯示自動帶出的福利列表
   - 用戶無需任何設定

3. **Email 收集**
   - 首次進入 My Cards 頁面時引導
   - 行銷同意勾選

4. **每月 1 號 + 20 號提醒 cron job**
   - 用 Vercel Cron + AgentMail
   - 批次處理所有用戶

### ❌ MVP 不做

- Push notification（先專注 email）
- 用戶自填福利到期日（MVP 全自動）
- 加卡雷達（新卡推薦）
- 消費缺口計算

---

## 7. 市場定位

| 競品 | 限制 |
|------|------|
| MaxRewards | 月費 $9，只做美國市場，無 AI 整合 |
| AwardWallet | 專注點數/里程，不做福利週期提醒 |
| Credit Karma | 無個人卡片管理 |
| Mint（已關閉）| 無 |

**差異化：** 中文市場 + 信用卡福利週期提醒 + AI 推薦整合，三者同時做到者市場無同類。

---

## 8. 待完成項目

- [ ] `recurring_credits` 欄位結構確認
- [ ] AgentMail API 整合測試
- [ ] Vercel KV 串接
- [ ] Cron job 實作
- [ ] Email 收集 UI
- [ ] My Cards V2 頁面
- [ ] 第一批旗艦卡福利補錄（10-15 張）

## 9. V2 / V3 待討論項目（暫緩）

以下項目已討論確認可以做，但 MVP 先不做，列入未來規劃：

| 項目 | 說明 | 所需資料 |
|------|------|---------|
| **Push Notification** | 瀏覽器推播通知 | 需要 Service Worker + 用戶授權 |
| **加卡雷達** | 定期 AI 推薦新卡 | 需要 cron job 跑推薦模型 |
| **消費缺口計算** | 計算「還差幾次刷」才免年費 | 需要用戶自填已刷次數/金額 |
| **年費到期日** | 結合 A（用戶自填開卡日，精準計算）+ B（不填則用 annual_fee 一般提醒）| 需要用戶自填持卡日期（可選欄位）|

> 筆記時間：2026-04-17（KC 確認 MVP 方向）
