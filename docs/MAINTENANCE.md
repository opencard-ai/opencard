# OpenCard 資料庫維護手冊

> 最後更新：2026-04-15

## 設計原則

### 資料來源優先級

```
1. 官網（Issuer Official Website）
2. Doctor of Credit（DoC）
3. NerdWallet / The Points Guy（TPG）
4. Reddit（r/churning 等，僅作為輔助參考）
```

**理由**：
- **官網排第一**：法律意義上的正式條款。NerdWallet 常有數週至數月延遲，年費調整或 earning rate 改版後，官網已更新但 NerdWallet 還沒跟上的情況很常見。
- **DoC 排第二**：系統性記錄 welcome offer 歷史調整的時間點和金額，是確認「這個 offer 是否是史上最高」的最佳來源。
- **NerdWallet / TPG 排第三**：適合快速掌握卡片整體定位、確認哪些 benefits 值得深入研究，以及交叉驗證官網資料。
- **Reddit 排最後**：r/churning 偏向個人數據點分享，參考價值較低，僅在特殊情況（如特殊 retention offer）時參考。

### 建檔流程

```
NerdWallet（初步了解）
    ↓
官網（抓正確數字）
    ↓
DoC（確認 welcome offer 是否為當前最佳）
    ↓
Reddit（如有疑問）
```

---

## 資料結構

每張卡的 JSON 必須包含以下欄位：

```typescript
interface CreditCard {
  card_id: string;           // 唯一識別碼，如 "amex-gold"
  name: string;              // 顯示名稱
  issuer: string;             // 發行銀行
  network: string;           // Visa / Amex / Mastercard 等
  annual_fee: number;         // 年費（美元）
  foreign_transaction_fee: number;
  credit_required: string;    // Excellent / Good / Fair / Poor

  welcome_offer?: {
    spending_requirement?: number;
    time_period_months?: number;
    bonus_points?: number;
    estimated_value?: number;
    point_program?: string;
    description?: string;
  };

  earning_rates: Array<{
    category: string;         // 如 "Restaurants"、"Groceries"
    rate: number;             // 如 4（代表 4x）
    notes?: string;
  }>;

  annual_credits: Array<{
    name: string;
    amount: number;
    frequency: string;        // "Monthly" / "Annual" / "Semi-Annual"
    description: string;
  }>;

  travel_benefits: {
    lounge_access?: { name: string; type: string }[];
    hotel_status?: { program: string; tier: string; complimentary: boolean }[];
    other_benefits?: { name: string; description: string }[];
  };

  fhr_thc: {
    fhr_eligible: boolean;     // Fine Hotels & Resorts
    thc_eligible: boolean;     // The Hotel Collection
  };

  insurance: {
    trip_cancellation?: boolean;
    trip_delay?: boolean;
    rental_insurance?: string;  // "Primary" / "Secondary" / "None"
    purchase_protection?: boolean;
    extended_warranty?: boolean;
  };

  tags: string[];              // 如 ["american-express", "restaurants"]
  sources: Array<{ url: string; notes?: string }>;
  last_updated: string;        // ISO 8601 時間戳
}
```

---

## Issuer 涵蓋率目標（共 248 張參考清單）

| Issuer | 目標張數 | 目前狀態 | 備註 |
|--------|---------|---------|------|
| Chase | ~42 | ✅ | 最大缺口 |
| American Express | ~31 | ✅ | |
| Citi | ~22 | ✅ | |
| Barclays | ~21 | ⚠️ | 部分缺漏 |
| Capital One | ~18 | ✅ | |
| Bank of America | ~16 | ✅ | |
| U.S. Bank | ~13 | ✅ | |
| Synchrony | ~13 | ⚠️ | 部分零售卡可選建 |
| Wells Fargo | ~8 | ✅ | |
| Navy Federal CU | ~7 | ⚠️ | 需親自確認 |
| Discover | ~6 | ✅ | |
| TD Bank | ~6 | ✅ | |
| PenFed CU | ~4 | ⚠️ | |
| 其他 | ~31 | ⚠️ | 按需求建檔 |

---

## 維護行事曆

### 季度專注批次（每季一個 issuer 家族）

| 季度 | 專注 Issuer | 預計新增張數 |
|------|-----------|------------|
| Q2 2026（4-6月） | Chase + Barclays | ~63 張 |
| Q3 2026（7-9月） | American Express + Citi | ~53 張 |
| Q4 2026（10-12月） | Capital One + BofA + Synchrony | ~45 張 |
| Q1 2027（1-3月） | 其他 issuer + 缺失填補 | ~87 張 |

### 月份差異追蹤（每週）

用 diff 腳本對比 NerdWallet 熱門卡列表 vs 現有 `data/cards/`，標記：
- 新增卡片（需建立 JSON）
- 停發卡片（需標記 `status: discontinued`）
- 年費 / offer 變動（更新 `last_updated`）

---

## 樹狀檢視（2026-Q2 開發目標）

未來將支援「by 發行銀行」樹狀展開，而非一次展示全部卡片。

**的好處**：
- 使用者可依發卡銀行導航，減少視覺負擔
- 支援大量卡片擴展（目標 248+ 張）
- 減少首次載入時間

**實作方向**（待开发）：
- 在 `CardGrid` 加入 issuer group mode
- 依 issuer 分類，預設全部折疊
- 每個 issuer 顯示該銀行下有多少張卡、已研究/未研究狀態

---

## 品質標準

### 最低標準（每張卡必須）
- ✅ `card_id`、`name`、`issuer`
- ✅ `annual_fee`
- ✅ 至少一筆 `earning_rates`
- ✅ `last_updated` 時間戳

### 建議標準（完整建檔）
- ✅ `welcome_offer`（含 spending requirement + bonus value）
- ✅ 主要 `annual_credits`
- ✅ `insurance` 欄位
- ✅ `sources`（至少一個官方 URL）

---

## 工具腳本

### 批次比對腳本（用 NerdWallet 對比現有）
```
scripts/compare-nerdwallet.js
```

### 批次建檔腳本
```
scripts/batch-add-cards.js
```
用途：讀取 JSON 格式的卡片清單，自動在 `data/cards/` 建立對應 JSON，並寫入 `last_updated` 時間戳。

---

---

## recurring_credits 維護（新增章節，2026-04-17）

### 維護頻率

recurring_credits 跟一般卡片資料不同——銀行**隨時可能調整福利**，所以維護比 welcome offer 更頻繁。

| 維護項目 | 頻率 |
|---------|------|
| 旗艦卡（年費 $250+）| 每季結束前 7 天內確認 |
| 一般卡片 | 每半年一次 |
| 緊急異動（如銀行突然公告）| 收到社群反饋後 48 小時內更新 |

### 維護行事曆

| 季度 | 專注維護 |
|------|---------|
| Q2 2026（4-6月）| Amex Platinum/Gold/Green、Chase CSR/CSP |
| Q3 2026（7-9月）| Capital One Venture X/Savor、Amex BCP/BCE |
| Q4 2026（10-12月）| Citi Premier/Custom Cash、Wells Fargo Autograph、其餘旗艦卡 |

### 資料錯誤回報處理流程

收到用戶回報（opencard@opencardai.com）後：
1. 24 小時內確認收到回報
2. 查證官方來源
3. 確認有誤 → 48 小時內更新 + 回覆用戶
4. 每筆更新附上 `last_updated` 時間戳

### 品質標準（recurring_credits）

每張卡的 recurring_credits 必須：
- ✅ `name` — 官方名稱（如 "$100 Resy Credit"）
- ✅ `amount` — 金額（numeric）
- ✅ `frequency` — monthly / quarterly / semi_annual / annual / cardmember_year
- ✅ `category` — dining / travel / shopping / gas / entertainment / other
- ✅ `description` — 限制條件說明（如 "Enrollment required"）

*本文件隨專案演化持續更新。*
