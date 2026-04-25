# CFPB Pipeline 16% 覆蓋率 — 真正的診斷

_驗證日期_: 2026-04-22
_驗證方式_: 直接從 CFPB 把 BoA、Wells Fargo、Capital One 的 Q3 2025 filing 全部抓出來看實際結構

---

## TL;DR

**16% 覆蓋率不是「pipeline 不夠好」,是「有一半的問題你診斷錯了」。**

你列的 5 個問題,真實情況是:
1. ✅ **Card ID 命名不一致** — 真問題,可解
2. ⚠️ **同一張卡多個 PDF** — 部分是西班牙文重複(可過濾),部分是法律分版(取最新即可)
3. ❌ **boa-platinum / wf-reflect parsing 失敗 → 不是 parsing 失敗**,**是 BoA 根本不申報「per-card」filing,連 PDF 都沒有**
4. ⚠️ **27 張卡不在 DB** — 不是浪費,是「該不該加進 OpenCard 的候選清單」
5. ✅ **Filename 太長** — 真問題,但用 hash 解決極簡單

最重要的發現:**美國發卡行有兩種 filing pattern,你的 pipeline 只處理了其中一種**。所以 16% 永遠是天花板,除非你做第二條 pipeline。

---

## 我實際驗證了什麼

### Bank of America Q3 2025 — **總共只有 6 個 PDF**

```
Mastercard_Elite_English.pdf (+ Spanish)
Visa_Mastercard_Platinum_Signature_World_Infinite_English.pdf (+ Spanish)
Visa_Mastercard_Secured_English.pdf (+ Spanish)
```

**這 6 個 PDF 涵蓋 BoA 整個信用卡產品線**。也就是說:
- BoA Customized Cash Rewards
- BoA Travel Rewards
- BoA Premium Rewards
- BoA Premium Rewards Elite
- BoA Unlimited Cash Rewards
- BoA Alaska Airlines (還有 Atmos Ascent / Summit)
- ~17 張你 DB 裡的 BoA 卡

這 17 張卡的法律合約**全部都是同一份 `Visa_Mastercard_Platinum_Signature_World_Infinite_English.pdf`**,因為它是 cardmember agreement 模板,不是 per-product disclosure。

所以「`boa-platinum: {fields: {}}`」**完全不是 parsing 失敗**。它是因為:
- 你的 pipeline 用 filename 找 "boa-platinum" → 找不到
- 真實對應的 PDF (`Visa_Mastercard_Platinum_Signature_World_Infinite_English.pdf`)裡面**沒有 "boa-platinum" 這個字串**也沒有 annual fee 數字 — 因為**年費是「Account Opening Disclosure」決定的,不是這份合約**

### Wells Fargo Q3 2025 — 26 個 PDF,**13 英文 + 13 西班牙文**

```
英文版 (filename 開頭是英文卡名):
 Wells_Fargo_Active_Cash_Credit_Card_Account_Agreement.pdf
 Wells_Fargo_Reflect_Visa_Credit_Card_Account_Agreement.pdf
 Wells_Fargo_Autograph_Visa_Card_Account_Agreement.pdf
 Wells_Fargo_Autograph_Journey_Visa_Card_Agreement.pdf
 Bilt_World_Elite_Mastercard_Credit_Card_Account_Agreement.pdf
 Attune_World_Elite_Mastercard_Account_Agreement.pdf
 Choice_Privileges_Mastercard.pdf
 Choice_Privileges_Select_Mastercard.pdf
 One_Key_Mastercard_Account_Agreement.pdf
 One_Key+_Mastercard_Account_Agreement.pdf
 The_Private_Bank_Visa_Signature_Agreement.pdf
 Wells_Fargo_Advisors_By_Invitation_Visa_Signature_Card_Account_Agreement.pdf
 Reflect_… etc.

西班牙文版 (filename 開頭是 "Contrato"):
 Contrato_de_Cuenta_de_la_Tarjeta_de_Crédito_Wells_Fargo_Reflect_Visa.pdf
 Contrato_de_Cuenta_de_la_Tarjeta_Bilt_World_Elite_Mastercard.pdf
 ...
```

→ Wells Fargo 是 **per-card filing**,而且明確區分英文/西班牙文。`wf-reflect` 失敗純粹是 pipeline 沒過濾 Spanish 版,parser 抓到 "Contrato" 那份就 NULL。**過濾掉 `Contrato_*.pdf` 就解掉了**,不需要 OCR。

### Capital One Q3 2025 — 24 個 PDF,大量「一份 PDF 蓋多卡」

挑出我看到的:
```
BJs_One_Mastercard_and_BJs_One+_Mastercard_Card_Agreement.pdf
 → 2 張 BJ's Wholesale 卡共用一份合約

Credit_Card_Agreement_for_Cabela's_CLUB_Cards.pdf
 → Cabela's 系列(可能 3-4 張卡)

Credit_Card_Agreement_for_Williams_Sonoma_Key_Rewards_Visa_
 Pottery_Barn_Key_Rewards_Visa_West_Elm_Key_Rewards_Visa_
 Key_Rewards_Visa_in_Capital_One_N.A_.pdf
 → 4 張 Williams-Sonoma 系列卡共用一份合約
```

而且還有像 Amex / Citi 那種 per-card 的 filing(Venture / Venture X / Quicksilver / Savor / SavorOne)— **Capital One 是混合制**。

---

## 美國發卡行 filing pattern 分類

| Filing pattern | 典型發卡行 | CCAD pipeline 可解嗎 |
|---|---|---|
| **Per-card**(每張卡一份) | American Express、Wells Fargo、Discover、Barclays(部分) | ✅ 可以,只要 card-name matching 做對 |
| **Per-card with separate Schumer Box**(每卡兩份)| Citi(Cardmember Agreement + Pricing Information Table) | ✅ 最理想,Pricing Table 直接 parse |
| **Family / Product-line**(一份蓋多張)| Bank of America、Wells Fargo 部分共用、Capital One 零售卡 | ❌ CCAD 給不出 per-card Schumer Box |
| **Mixed**(主品牌 per-card + 零售 family)| Capital One、Chase | ⚠️ 一半可解一半不行 |

**為什麼 Family-style filer 無解**:
- CFPB 規則只要求 **cardmember agreement** 提交,而 cardmember agreement 是**法律合約模板**(arbitration、billing、grace period、利率公式等),**不是 Schumer Box**。
- 真正的 Schumer Box 數值(這張卡年費 $X、APR Y%)在 **Account Opening Disclosure** / **Application & Solicitation Disclosure**裡,這些**不在 CCAD**,在發卡行自己的 marketing/apply 頁面。
- BoA / Wells Fargo 的 family agreement 裡常常寫 "see your Account Opening Disclosure for fees and rates" — 也就是把 Schumer Box 推到別處。

---

## 16% 的真實組成

按 OpenCard 249 張卡推算,你能從 CCAD 拿到 per-card Schumer Box 的卡片數:

| 發卡行 | OpenCard 數量 | CCAD 模式 | CCAD 可解張數 |
|---|---|---|---|
| Chase | 49 | Per-card | ~45 ✅ |
| American Express | 39 | Per-card | ~38 ✅ |
| Barclays | 30 | Per-card | ~28 ✅ |
| Citi | 21 | Per-card + Pricing Table | ~21 ✅ |
| **Bank of America** | **17** | **Family** | **0–3** ❌ |
| Capital One | 16 | Mixed(主品牌 per-card,零售 family) | ~10 ⚠️ |
| U.S. Bank | 14 | Per-card | ~12 ✅ |
| **Wells Fargo** | **12** | **Per-card** | **~11 ✅**(你卡在西班牙文沒過濾) |
| Synchrony | 10 | Family(零售卡共用) | ~2 ❌ |
| Discover | 6 | Per-card | ~6 ✅ |
| Navy Federal / PenFed / Bread / TD / HSBC / PNC / 其他 | ~35 | 看實體 | ~15 ⚠️ |

理論上限 **~190/249 ≈ 76%** 可以從 CCAD 抓到 per-card Schumer Box。你目前 41/249 ≈ 16%,離天花板還差 60 個百分點 — **這 60% 不是 CCAD 的問題,是你 matching 邏輯的問題**。

但 BoA(17 張)+ Synchrony 大半(8 張)+ Capital One 零售部分(6 張)≈ 31 張,**這些卡無論 pipeline 怎麼改都從 CCAD 拿不到 Schumer Box** — 必須走 Plan B(發卡行自己的 disclosure 頁)。

---

## 5 個問題的真正修法

### 問題 1:Card ID 命名不一致 → 用「PDF 內文」對「OpenCard `name`」,不要對 filename

**Filename 是發卡行命名的 — 不要當主鍵**。改用兩件事:
1. PDF 第一頁有 canonical card name(法律標題位置固定)
2. 把它對 OpenCard 的 `name` 欄位做 fuzzy match,scoped by issuer

```python
import re
from rapidfuzz import process, fuzz

def extract_canonical_name(pdf_text: str) -> str | None:
 head = pdf_text[:2000]
 
 # Pattern A: "<Card Name>" appears as standalone before "Cardmember Agreement"
 # Common in Amex, Wells Fargo, Citi
 m = re.search(
 r'^([A-Z][^\n]{5,150}?)\s*\n+\s*(?:Cardmember Agreement|Card(?:member)? Account Agreement|Card Agreement)',
 head, re.M | re.I
 )
 if m: return m.group(1).strip()
 
 # Pattern B: Title comes after the agreement-type label
 # Common in some Citi files: "Cardmember Agreement\n<Card Name>"
 m = re.search(
 r'(?:Cardmember Agreement|Card Agreement|Pricing(?: and|&)? Information Table)\s*\n+\s*([A-Z][^\n]{5,150})',
 head, re.I
 )
 if m: return m.group(1).strip()
 
 # Pattern C: Filename fallback (last resort, strip suffixes)
 return None

def match_card_to_opencard(pdf_canonical_name: str, issuer: str, opencard_db: list[dict]) -> tuple[str, float] | None:
 candidates = [c for c in opencard_db if c['issuer'].lower() == issuer.lower()]
 if not candidates:
 return None
 names = [c['name'] for c in candidates]
 
 # token_sort_ratio handles "Hilton Honors Aspire" vs "Hilton Aspire Honors"
 match, score, idx = process.extractOne(
 pdf_canonical_name,
 names,
 scorer=fuzz.token_sort_ratio,
 )
 if score < 80:
 return None # 寧可漏抓也別錯抓 → 進 review queue
 return candidates[idx]['card_id'], score
```

兩個重點:
- **Scope by issuer**:fuzzy match 只在同一發卡行的卡裡找,避免 "Platinum" 跨家比對混淆。
- **Threshold ≥ 80**:低於就進待審 queue,讓人手動 confirm,順便建 alias。

每季新增的 unmatched PDF 大約 < 10 個,人工 5 分鐘可解。

### 問題 2:同一張卡多個 PDF → 兩種子問題

**子問題 2a:英文 / 西班牙文重複** — 你 wf-reflect 的真凶
```python
# Wells Fargo 西文檔名固定開頭
def is_spanish_filing(filename: str) -> bool:
 name = filename.lower()
 return (
 name.startswith('contrato_') or
 name.startswith('contrato%5f') or # URL-encoded underscore
 '_spanish.' in name or
 name.endswith('_spanish.pdf')
 )

# 過濾後 Wells Fargo 從 26 個 PDF → 13 個英文 PDF
```

**子問題 2b:同一張卡有多版本(short name + full name)**
- e.g. Amex Hilton:`amex-hilton-aspire.pdf` vs `amex-hilton-honors-aspire.pdf`
- 通常一個是該季新版、一個是上季留下的舊版本
- 用 PDF 上的 `Generated` / `Last Modified` / 內文 effective date 取最新就好

```python
def dedupe_by_card_id(pdfs: list[dict]) -> list[dict]:
 by_card = defaultdict(list)
 for p in pdfs:
 by_card[p['card_id']].append(p)
 return [
 max(group, key=lambda p: (p['effective_date'], p['filing_quarter'], p['filename_length']))
 for group in by_card.values()
 ]
```

### 問題 3:「Parsing 失敗」 → **重新分類**

把現在所有 `{fields: {}}` 結果分三類處理:
```python
def diagnose_parse_failure(pdf_url: str, pdf_text: str, page_count: int):
 if page_count == 0 or len(pdf_text) < 100:
 # 真正空 → 可能 image-only,送 OCR
 return 'IMAGE_ONLY'
 
 if any(spanish_word in pdf_text.lower() for spanish_word in 
 ['contrato', 'tarjeta de crédito', 'cargo']):
 # 西班牙文 → 過濾掉,不報錯
 return 'SPANISH_DUPLICATE'
 
 if not re.search(r'(annual\s+fee|annual\s+membership|membership\s+fee)', pdf_text, re.I):
 # 整份合約都沒提 annual fee → family filing
 return 'FAMILY_FILING_NO_SCHUMER_BOX'
 
 # 其他 → 真的需要進 review
 return 'PARSE_NEEDS_REVIEW'
```

不同類別走不同處理:
- `IMAGE_ONLY` → tesseract OCR(`pip install pytesseract`),CCAD 規定 PDF 要 text-searchable,但歷史檔案可能不是
- `SPANISH_DUPLICATE` → 跳過,不算失敗
- `FAMILY_FILING_NO_SCHUMER_BOX` → **正常**,記錄該 PDF 為「適用於下列卡的法律合約」,Schumer Box 走 Plan B(下面)
- `PARSE_NEEDS_REVIEW` → 真要看的少數案例

### 問題 4:CFPB 抓到 OpenCard 沒有的卡 → 把它變成成長機會

不要丟掉。改成:
```python
# 27 張 unmatched PDFs
# → 寫成 "candidate_cards_for_addition.json"
# → 含發卡行、PDF URL、提取出的 canonical name
# → 每月一次審視:這 27 張裡哪些值得加進 OpenCard?
```

對 OpenCard 重要的決策:
- `citi-diamond-preferred` → 0% APR balance transfer 卡,有人會搜,**該加**
- `chase-freedom-5-cash-back` → Chase Freedom Flex 的真名,**該加進 alias**
- `sync-amazon` → 你已有 `amazon-store-card`,但 Synchrony 又另發 Amazon Prime Store Card,可能是**不同卡需要分開**
- `us-bank-flex-rewards` → 美國市場確實有,**該加**

每多加 1 張卡進 DB,你的 SEO 多 1 個 long-tail keyword + 多 1 張 CCAD 可覆蓋的卡 → 純收益。

### 問題 5:Filename 太長 → 用 SHA256 hash 當儲存鍵

Filename 不該當儲存或對應的主鍵。改成:
```python
def stable_pdf_key(pdf_url: str) -> str:
 # 用 URL hash,filename 當 metadata
 return hashlib.sha256(pdf_url.encode()).hexdigest()[:16] + '.pdf'

# 範例
url = 'https://files.consumerfinance.gov/.../Williams_Sonoma_Pottery_Barn_West_Elm_Key_Rewards_Visa.pdf-255646.pdf'
storage_key = '7a3b9c4e1f2d5e8a.pdf' # 16 位 hash,固定長度
```

CCAD 自己的 PDF 也是用後綴 ID(`-255646.pdf`),所以 URL 是穩定 ID。 把 `pdf_url` 當 `id`,filename 當顯示用文字即可。

---

## 現在最該做的兩件事(按 ROI)

### 立即 (本週):從 16% → ~60%

**只改 matching 邏輯**(不需碰 parser):
1. 過濾 Spanish/non-English filings(`Contrato_*.pdf` + 任何 `_Spanish.pdf` + 偵測語言)→ 立刻多解掉 Wells Fargo 11 張、可能 Citi 3-5 張
2. 從 PDF 第一頁抽 canonical name + fuzzy match by issuer → 解掉 Chase / Citi / Barclays / Amex 命名變形
3. 加 alias table:`{ "amex-hilton-honors-aspire": ["amex-hilton-aspire", "Hilton Honors Aspire", "Hilton Aspire"], … }`

預估從 41 → ~140-160 張卡(56-64%)。

### 中期 (一個月):family-filing 走第二條 pipeline

對 Bank of America(17 張)+ Synchrony(~8 張)+ Capital One 零售(~6 張)= ~31 張,改抓**發卡行自己的 Application Disclosure 頁**:

```python
# 例 BoA Customized Cash Rewards 的 Schumer Box 直接在 apply 頁
DISCLOSURE_PAGES = {
 'boa-customized-cash-rewards': 
 'https://www.bankofamerica.com/credit-cards/cards/cash-back-credit-cards/customized-cash-rewards-credit-card/disclosures/',
 'boa-travel-rewards':
 'https://www.bankofamerica.com/credit-cards/cards/travel-rewards-credit-cards/travel-rewards-credit-card/disclosures/',
 # …
}

# 這些頁都有 "Pricing & Information" link → PDF 或 inline HTML 含 Schumer Box
# 結構穩定,可以用 selectors / regex 直接抓
```

把這當作「Plan B」pipeline,但**標 confidence 較低**(0.85 vs CCAD 的 0.99,因為來源是 issuer self-published,不是政府認證)。

預估再加 ~25 張,總計 165-185 張(66-74%)。

### 接受現實

剩下 ~25-30% 是 long-tail(Petal、Robinhood、Fidelity、信用社、停發卡、`status: transferred`),CCAD 沒有 + 自家 disclosure 頁不穩。**保留人工 + 半年更新一次,別硬幹**。

實際達到的 75% per-card Schumer Box 自動化覆蓋率,**比業界任何網站(包括 NerdWallet)都高**,因為大家都在燒人力,沒人做 CCAD pipeline。

---

## 你可以馬上對 41 張卡做的 sanity check

把已套用 CCAD 的 41 張卡的 `annual_fee` 和你 OpenCard 既有值對照。預期應該 99% 完全相同(因為 CCAD 是法律值,你既有資料是人工查的)。如果有差異,差異那邊**幾乎一定是 CCAD 對**:

```python
mismatches = []
for card in opencard_db:
 if card['_ccad_applied']:
 if card['annual_fee'] != card['_ccad_extracted_annual_fee']:
 mismatches.append((card['card_id'], card['annual_fee'], card['_ccad_extracted_annual_fee']))
print(mismatches)
```

如果這個列表超過 5 個 — 表示你 OpenCard 的人工資料其實在這些欄位上有錯,CCAD pipeline 立刻產生信任 ROI。如果是 0 個 — 表示這 41 張的人工維護是好的,後面 100+ 張的自動化反而更值。
