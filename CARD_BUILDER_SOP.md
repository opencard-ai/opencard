# OpenCard 信用卡資料庫建置流程

*建立時間：2026-04-13*
*適用範圍：資料庫建置、補卡、新增卡片*

---

## 核心概念：來源優先

銀行官網資料 > 論壇共識 > 其他資訊

---

## 流程一：完整市場普查（確定該收哪些卡）

### Step 1：從各大銀行官網著手
- 目標：每個主要發卡機構的完整卡列表（American Express、Chase、Citi、Capital One、Bank of America、Wells Fargo、US Bank、Discover 等）
- 方法：直接訪問銀行官網的信用卡頁面，或透過銀行 mobile app 的「Add Credit Card」功能找到完整清單
- 為什麼：銀行官網是最完整的卡片來源，不會漏掉任何一張卡

### Step 2：建立 MASTER_CARD_LIST.md
- 整理每家銀行的完整卡清單（卡名、年費、等級）
- 格式：`[ ] 卡名 ($年費)` — 清楚標示已研究 vs 缺口
- 銀行清單涵蓋：Amex、Chase、Citi、Capital One、Bank of America、Wells Fargo、US Bank、Discover、Barclays、HSBC 等

### Step 3：對比人氣論壇確認優先順序
- 爬 r/churning、Doctor of Credit、The Points Guy、NerdWallet 等
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
- 新卡上市（銀行官網公告、論壇發現）
- 現有卡 offer 變更（Doctor of Credit RSS alert）
- 季節性 elevated offer（常見於 Q1）
- **當得知有資料庫未收錄的卡片時，立即啟動流程一 + 流程二比對並收錄**

### 更新步驟
1. 找到該卡的最新資訊（2+ 來源）
2. 更新 research JSON 檔案
3. 執行 `build-master.mjs`
4. 檢查 ISSUES.md 是否還有該卡

### 自動化監控（待建）
- 每週抓 Doctor of Credit RSS（auto-check.mjs）
- 論壇關鍵字 alert（當某卡被大量討論時自動通知）

---

## 流程六：AI 功能開發規範

### 核心原則
AI Card Assistant / AI Card Finder 是 OpenCard 的核心賣點功能。每次部署前必須確保 AI 功能正常運作。

### 部署前 AI 功能檢查
- [ ] 測試 `/api/chat` endpoint 回應正常（200 OK + 有效 JSON）
- [ ] 在網站 UI 實際發送一則訊息，確認 AI 回覆正確
- [ ] 確認所有語言版本的 AI 功能入口都能正常使用

### 對話狀態管理
- **禁止在用戶輸入後清除對話歷史**：用戶送出訊息後，歷史紀錄必須保留
- 對話 reset 只能由用戶主動觸發（例如按「新對話」按鈕）
- 所有路徑（`/chat`、`/ai-assistant`、卡片詳情頁內嵌等）必須使用**同一套對話邏輯**
- 禁止不同路由有不同的 state management 實作

### 選項晶片（Suggestion Chips）
- 所有選項晶片文字必須在**所有語言版本同步翻譯**
- 新增晶片時，必須同時更新所有 locale 檔案
- 翻譯不到位時寧可不顯示，也不要顯示英文原文混雜

### UX 基本要求
- **Enter 鍵送出訊息**是基本 UX 要求，不可移除
- Shift+Enter 換行
- 送出按鈕與 Enter 鍵行為必須一致

---

## 流程七：多語言 UI 翻譯覆蓋率標準

### 原則
翻譯要嘛做到位，要嘛不做。半翻譯比不翻譯更糟——它讓網站看起來像壞掉的。

### 必須翻譯的項目

#### earning_rates 類別名稱
- 所有 `earning_rates[].category` 的值必須有對應翻譯
- 新增 earning category 時，必須同步更新所有 locale 的翻譯檔
- 範例對照：
  - Dining → 餐飲 / 飲食 / 레스토랑
  - Travel → 旅行 / 여행
  - Groceries → 超市 / 식료품

#### 靜態標題與頁面文字
- 「Our Mission」「About Us」「How It Works」等靜態標題**必須翻譯**
- 頁尾（Footer）所有文字必須翻譯
- 導航列（Navbar）所有項目必須翻譯

#### 半翻譯標籤處理原則
- 如果一個標籤無法準確翻譯，**保留英文原文**而非硬翻
- 禁止出現「半中半英」的標籤（例如「Travel 旅行」這種混合）
- 專有名詞（如 Amex、Chase）保留英文

#### 新聞標籤翻譯對照表
維護一份標籤翻譯對照表於 `locales/tag-mapping.json`：
```json
{
  "credit-cards": { "en": "Credit Cards", "zh-TW": "信用卡", "zh-CN": "信用卡", "ko": "신용카드" },
  "rewards": { "en": "Rewards", "zh-TW": "回饋", "zh-CN": "回馈", "ko": "리워드" },
  "travel": { "en": "Travel", "zh-TW": "旅行", "zh-CN": "旅行", "ko": "여행" }
}
```

### 發布前翻譯覆蓋率檢查清單
- [ ] 所有 locale 檔案的 key 數量一致（無遺漏 key）
- [ ] earning_rates 類別名稱全部有翻譯
- [ ] 靜態標題全部有翻譯
- [ ] 新聞標籤全部有翻譯
- [ ] 選項晶片全部有翻譯
- [ ] 無「半翻譯」混合文字出現
- [ ] 執行 `diff` 比對各 locale 檔案 key 差異

---

## 流程八：頁面驗收標準

### 資料顯示規範
- 無資料時顯示 **「N/A」** 或 **「—」**，**禁止顯示「00」「0」或空白**
- 數字欄位無資料時：`N/A`
- 文字欄位無資料時：`—`
- 列表欄位無資料時：不顯示該區塊，或顯示「暫無資料」

### 導航與按鈕
- 返回按鈕**只能有一個** ←（禁止出現重複的返回按鈕）
- 返回按鈕行為：回到上一頁（`router.back()`），而非固定路由
- 麵包屑（breadcrumb）與返回按鈕不可同時出現在同一行

### 元件渲染檢查
- 頁面不可出現**大片空白區域**（通常是元件未正確載入或 CSS 問題）
- 卡片列表頁：至少要有 loading skeleton 或 empty state
- 圖片：必須有 fallback（預設圖片或 placeholder）
- 所有頁面在 mobile / tablet / desktop 三種寬度下檢查

### AI 功能命名統一
- AI 功能在所有語言版本中的命名必須統一：
  - EN: "AI Card Finder" / "AI Card Assistant"
  - ZH-TW: 「AI 選卡助手」/「AI 卡片助理」
  - ZH-CN: 「AI 选卡助手」/「AI 卡片助理」
  - KO: 「AI 카드 파인더」/「AI 카드 어시스턴트」
- 禁止同一語言版本中出現不同名稱指涉同一功能

---

## 流程九：網站定位說明

### 市場範圍聲明
- 網站必須在顯眼位置（首頁 hero 區、About 頁面）明確標示：
  > **「OpenCard 目前僅涵蓋美國信用卡市場」**
- 英文版："OpenCard currently covers US credit cards only."
- 此聲明不可隱藏在 FAQ 或 footer 小字中

### 非英語市場的說明
- 繁體中文版：「本站資訊僅適用於美國信用卡，提供中文介面方便華語使用者查閱」
- 簡體中文版：「本站信息仅适用于美国信用卡，提供中文界面方便华语用户查阅」
- 韓文版：「본 사이트는 미국 신용카드 정보만 제공합니다. 한국어 인터페이스는 편의를 위해 제공됩니다」
- 目的：避免非美國用戶誤以為涵蓋當地市場

---

## 流程十：上線前合規檢查

### Privacy Policy 頁面
- [ ] 必須有獨立的 Privacy Policy 頁面（`/privacy`）
- [ ] 說明收集哪些用戶資料（cookies、analytics、聊天紀錄等）
- [ ] 說明資料如何使用與儲存
- [ ] 說明第三方服務（Google Analytics、AI API 等）的資料共享
- [ ] 提供聯絡方式供用戶查詢資料處理

### Terms of Service 頁面
- [ ] 必須有獨立的 Terms of Service 頁面（`/terms`）
- [ ] 聲明網站資訊僅供參考，不構成金融建議
- [ ] 免責聲明：資料可能有誤，以銀行官方為準
- [ ] 使用條款：禁止爬蟲、資料轉售等

### FTC 廣告揭露要求
- [ ] 如有聯盟行銷連結（affiliate links），必須在**顯眼位置**揭露
- [ ] 揭露文字範例："Some links on this site are affiliate links. We may earn a commission at no extra cost to you."
- [ ] 揭露必須在連結**之前或旁邊**，不可只放在頁尾
- [ ] 每個含有 affiliate link 的頁面都必須有揭露

### 金融廣告合規
- [ ] 信用卡資訊頁面加上免責聲明："Information is for reference only. Please verify with the card issuer."
- [ ] 不可使用「保證核卡」「一定拿到」等誤導性語言
- [ ] Welcome bonus 資訊標注「條件適用」（terms apply）
- [ ] 年費與費率資訊標注「可能變動」（subject to change）

---

## 常見問題

**Q：研究 agent 逾時怎麼辦？**
A：每批上限 3-4 張卡，timeout 設 300s。未完成的 agent 之後單獨補。

**Q：資料來源與官網衝突怎麼辦？**
A：**以銀行官網為準**。論壇、截圖、第三方網站都是參考，銀行官網的資料是最終答案。

**Q：confidence 等級怎麼定義？**
A：
- High：2+ 來源一致，且資料與官網完全符合
- Medium：1 來源完整，其他來源部分確認
- Low：只有 1 來源，或來源之間有矛盾

---

*最後更新：2026-04-15*
