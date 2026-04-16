# OpenCard 協作任務池（2026-04-15）

> 這份文件用於 agent 分工。所有 agent 請從這裡認領任務。

---

## 任務分組原則

| 角色 |擅長| 適合任務|
|------|---|---------|
| **Jisoo** (Gemini 2.5 Pro) | 深度研究、分析 | Issuer 官網研究、福利比對 |
| **Rosé** (Gemini 2.5 Flash) | 快速查詢、翻譯 | NerdWallet 列表抓取、資料格式化 |
| **Jennie** (MiniMax M2.7) | 資料處理、統計 | 批次 JSON 生成、差異比對 |
| **KIRO** (Claude Sonnet 4.5) | 複雜 Coding、系統設計 | UI 開發、批次腳本、工具建設 |
| **Lisa** (Claude Sonnet 4.6 Bedrock) | Code Review、安全 | PR 審查、資料驗證 |

---

## 🔴 高優先：卡片資料填補

### 任務切割方式

每個 issuer 視為一個獨立任務包，格式如下：

```
ISSER: [issuer 名稱]
張數: [待建張數]
資料來源優先級: 官網 > DoC > NerdWallet > Reddit
產出: 在 data/cards/ 建立對應 JSON，格式符合 MAINTENANCE.md 標準
```

### Issuer 任務包（可平行執行）

| # | Issuer | 張數 | 狀態 | 負責人 |
|---|--------|------|------|--------|
| 1 | Chase | ~42 | ✅ 已完成（42張全部寫入 research/OUTPUT/） | Jisoo |
| 2 | American Express | ~31 | ✅ 研究完成（31張已寫入 research/OUTPUT/） | Rosé |
| 3 | Citi | ~22 | ✅ 研究完成（16張缺口卡已寫入 research/OUTPUT/） | Lisa |
| 4 | Barclays | ~21 | ✅ 研究完成（18張缺口卡已寫入 research/OUTPUT/） | Jennie |
| 5 | Bank of America | ~16 | ✅ 研究完成（14張缺口卡已寫入 research/OUTPUT/boa-*.json） | Jisoo |
| 6 | Capital One | ~18 | ✅ 研究完成（11張缺口卡已寫入 research/capital-one/） | Jennie |
| 7 | U.S. Bank | ~13 | ✅ 研究完成（3張缺口卡已寫入 research/OUTPUT/） | Lisa |
| 8 | Synchrony | ~13 | ✅ 研究完成（11張缺口卡已寫入 research/OUTPUT/） | Lisa |
| 9 | Wells Fargo | ~8 | ✅ 研究完成（7張缺口卡已寫入 research/OUTPUT/） | Rosé |
| 10 | Navy Federal CU | ~7 | ✅ 研究完成（7張缺口卡已寫入 research/OUTPUT/） | Rosé |
| 11 | Discover | ~6 | ⬜ 待認領 | |
| 12 | TD Bank | ~6 | ⬜ 待認領 | |
| 13 | PenFed CU | ~4 | ⬜ 待認領 | |
| 14 | 其他（~31張） | ~31 | ⬜ 待認領 | |

---

## 🟡 中優先：系統建設

### 批次建檔腳本 `scripts/batch-add-cards.js`
- **負責人**: KIRO
- **輸入**: issuer + 卡片資料陣列
- **輸出**: 在 `data/cards/` 建立標準化 JSON，自動補 `last_updated`
- **狀態**: ⬜ 待開發

### Diff 追蹤腳本 `scripts/check-new-cards.js`
- **負責人**: Jennie
- **功能**: 每週拿 NerdWallet 熱門卡列表對比 `data/cards/`，輸出新增/停發/變動
- **狀態**: ⬜ 待開發

### Issuer Group UI（樹狀檢視）
- **負責人**: KIRO
- **功能**: 依 issuer 分類，折疊式展示，減少單頁載入
- **狀態**: ⬜ 設計中

---

## 🟢 低優先：研究 / 驗證

### Welcome Offer 核查（對照 DoC 歷史）
- **負責人**: Jisoo
- **範圍**: 現有 138 張 + 新增卡片
- **確認**: 每張卡的 offer 是否為「史上最高」（DoC 有記錄）

### 資料品質審查
- **負責人**: Lisa
- **檢查**: JSON 格式一致性、required 欄位缺失、sources URL 有效性

---

## 輸出格式標準

每張卡 JSON 必須包含：
```json
{
  "card_id": "[kebab-case]",
  "name": "[官方名稱含®]",
  "issuer": "[銀行名]",
  "network": "Visa|Mastercard|Amex|Discover",
  "annual_fee": 0,
  "foreign_transaction_fee": 0,
  "credit_required": "Excellent|Good|Fair|Poor",
  "earning_rates": [
    { "category": "All Purchases", "rate": 2 }
  ],
  "annual_credits": [],
  "travel_benefits": {},
  "fhr_thc": { "fhr_eligible": false, "thc_eligible": false },
  "insurance": {},
  "tags": ["issuer-slug"],
  "sources": [{ "url": "https://[official].com/..." }],
  "last_updated": "2026-04-16T00:00:00.000Z"
}
```

---

## 認領方式

在 `TASKS.md` 這個檔案裡編輯「負責人」欄位，格式：
```
| # | Issuer | ... | 負責人 | ← 填入 agent 代號
```

例如：`Jisoo` / `Rosé` / `Jennie` / `KIRO` / `Lisa`

---

*更新時間：2026-04-16T13:10:00Z*
