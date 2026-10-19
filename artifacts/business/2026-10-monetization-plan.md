# OpenCard 變現計畫（2026-10）

> 撰寫：Grok Bot｜資料截止：2026-10-18（PT）｜狀態：草案。2026-10-18 晚上用 Mac Mini 上的 GSC 每日報表跟 Vercel CLI 補上實際數字
> 原則：數字只寫有查到的，查不到的一律標 **【未知】**。目標值是我們自己定的，不是現況。

---

## 0. 一句話結論

現在 OpenCard 的流量還太小，直接去申請發卡行或大型聯盟網路，被拒的機率很高。AdSense 已經被拒 3 次，Amazon Associates 也在 10/10 被關掉了。
所以前 3 個月要先把「可以被收錄的頁面」跟「真實流量」做起來，同時把揭露、法遵、主機方案這些基本功補齊。
大概第 3 個月開始申請 CardRatings 這類 sub-affiliate 拿第一筆收入，6 個月以後再挑戰 FlexOffers、CJ 的發卡行方案。

---

## 1. 現況盤點（有憑有據的才寫）

### 1.1 流量（GSC 每日報表 `.gsc-report-history.json`，資料到 2026-10-16）

| 區間 | 點擊 | 曝光 | CTR | 平均排名 |
|---|---|---|---|---|
| **近 28 天**（9/19–10/16） | **4** | **890** | **0.45%** | **約 24.1**（依曝光加權） |
| 近 7 天（10/10–10/16） | 1 | 319 | 0.31% | 22.1 |
| 前 6 週（9/1–10/12） | 7 | 2,286 | 0.31% | — |
| 近 3 個月 | **【未知】** | **【未知】** | — | — |

**趨勢**：
- 每週曝光從 9 月初的約 650 次掉到 10 月的 200–320 次。
- 平均排名則從約 33 名進步到約 20–22 名。
- 這應該是 8/8、8/28 那兩次收斂收錄範圍的結果：曝光變少，但留下來的頁面排名比較好。

**近 7 天的熱門頁面**（GSC 報表只存前 5 名）：
- /en：63 曝光、1 點擊、排名 22
- /en/cards/boa-student-customized-cash-rewards（noindex）：32 曝光
- /en/guides/premium-travel-card-comparison-framework：25 曝光、排名 **5.9**
- /en/cards/amex-biz-platinum：22 曝光
- /zh/cards/us-bank-cash-plus（noindex）：21 曝光

**近 7 天的查詢**：「credit cards」30 曝光、排名 8，落在首頁；其他是 premium travel 那篇指南的長尾問句，排名 6–10。

**收錄重點**：
- 近 7 天有曝光的頁面有 63 個，其中 48 個是 noindex 頁面，吃掉 **55%（175/319）的曝光**。
- 也就是說，被 noindex 擋掉的卡片頁其實有人在搜。

**重大技術問題（10/18 發現，已修正）**：
- 卡片頁跟大部分固定頁（about、find、elevated-offers 等）的 canonical 全部指向首頁 `/en`。
- 這等於跟 Google 說「這些頁面都是首頁的重複頁」，就算沒設 noindex 也很難被收錄。

**還不知道的**：
- 近 3 個月的完整數字、前 15 名查詢跟頁面、已收錄／未收錄頁數跟原因：**【未知】**。GSC API 的 OAuth 憑證直接寫在 cron 指令裡，我沒有拿出來用，要等 KC 提供正式的唯讀方式。
- Sitemap API 回報：提交 79 頁、indexed 0（這個欄位參考價值低）。

| Vercel Web Analytics | 已啟用（2026-04-16 開始），有資料；**訪客數【未知】**，CLI 跟公開 API 都查不到，要看 dashboard |
|---|---|

### 1.2 網站內容

- **卡片資料**：224 個 JSON 檔。其中 active 202、discontinued 19、transferred 2、invitation_only 1。首頁寫的是「Browse 205 cards」。
- **語系**：en / zh / zh-cn / es，共 4 種（`lib/i18n.ts`）。
- **頁面類型**：about、cards、compare、contact、elevated-offers、find、guides、methodology、my-cards、privacy、stay、terms、benefit-expiration-tracker。
- **指南**：英文 MDX 28 篇，加上 es / zh / zh-cn 版本，總共 103 個 MDX。
- **Sitemap**：修正前只有 **79 個 URL**（卡片頁只有 14 個，翻譯指南 0 個）。
  - 10/18 修正後變成 **342 個**：202 張 active 卡片（英文）、28 篇英文指南加 75 篇有完整譯文的翻譯指南、各語系的固定頁，並加上 hreflang。
  - 停發的卡片維持 noindex，也不放進 sitemap。
- **聯盟／推薦連結**：卡片資料裡 **0 個** OpenCard 自己的聯盟連結。出現 "referral" 的 4 處都是來源網址或內文，不是我們的推薦連結。
- **揭露文字**：
  - terms 有 "Affiliate Links" 段落；
  - methodology 寫「compensation does not determine ratings」；
  - 但**卡片頁或連結旁邊沒有就近揭露**（現在本來也還沒有聯盟連結）。
- **廣告**：AdSense 程式碼有放，只在部分高價值頁面、而且要使用者同意後才載入，ads.txt 也設好了。但 **AdSense 審核被拒 3 次**（2026-05-03、06-07、08-18），信上寫「網站有些問題，必須先修正」，**詳細原因【未知】**，要登入 AdSense「網站」頁才看得到。
- **Email 名單**：My Cards 有訂閱跟權益到期提醒信，算是有 email capture。**沒有確認有獨立的電子報**。**訂閱人數【未知】**。
- **My Cards 使用者數**：資料放在 Upstash Redis / Vercel KV，**沒有唯讀存取權，【未知】**。

### 1.3 帳號與渠道

| 渠道 | 狀態 |
|---|---|
| Amazon Associates（opencardai-20） | 2026-04-12 申請 → 07-12 收到警告（不到 3 筆合格銷售）→ **10-10 被拒、帳號關閉** |
| Google AdSense（pub-9241929717890328） | **被拒 3 次**，目前不能放廣告 |
| Facebook | 帳號 2026-04-12 建立，當天就因社群守則被停權，申訴期限 180 天（大約 10-09 到期），**應該已經救不回來了**。粉專狀態 **【未知】** |
| iChannels 通路王 | 有會員，但這是台灣的聯盟網路，跟美國信用卡沒有關係 |
| Vercel | 免費（Hobby）方案。Deployment Storage **100%／10 GB**（9/8、9/22、10/6 都有警告），ISR writes 在 8/25 用到 **75%／200k**。10/18 有 26 個部署，清到剩上線版加 2 個 rollback |
| Google Cloud | 免費試用 9/13 已經結束 |

---

## 2. 門檻 vs. 我們現在在哪

| 管道 | 公開的門檻／條件 | 我們的狀況 | 判斷 |
|---|---|---|---|
| **CardRatings**（sub-affiliate，信用卡專門） | 填申請表，說明網站、受眾、信用屬性、目前在推哪些卡。**沒有公布最低流量**，佣金寫「Varies」，**不公開** [1][2] | 內容跟主題都很對味，但流量太小 | 🟡 **第一個申請的目標**，等 sitemap 擴充、有穩定流量（建議 GSC 每 28 天 ≥ 100 次點擊）再送，成功率比較高 |
| **FlexOffers**（信用卡分類） | 信用卡分類「會挑」，需要證明流量真實、品質好。佣金看卡、看發卡行，**沒有統一標準** [3] | 不夠格 | 🔴 6 個月以後再試 |
| **CJ**（金融／fintech） | 要先過網路審核，再一家一家給廣告主審。頂級信用卡方案很多是「只限邀請」或法遵很嚴 [3][4] | 不夠格 | 🔴 6–12 個月 |
| **Impact** | 部分金融廣告主在上面，也是一家一家審，**門檻【未查到公開數字】** | 不夠格 | 🔴 6–12 個月 |
| **Bankrate / 其他聚合商** | 有合作夥伴網路，**條件跟佣金【未查到公開資料】** | — | ⚪ 需要直接詢問 |
| **發卡行直營（Amex、Chase、Capital One、Citi）** | 大多透過網路或聚合商。Amex、Chase 的門檻最高，通常要有既有的金融媒體實績 [4] | 不夠格 | 🔴 12 個月以後 |
| **Google AdSense** | 已經被拒 3 次 | 要先看清楚被拒原因 | 🟡 修好再重送，屬於輔助收入 |

**通用審核重點**（多個來源一致）[4][5]：
- 有 15–20 篇以上的實質金融內容（我們有 28 篇英文指南 ✅）；
- 每個信用卡頁面跟 footer 都有明顯的 FTC 揭露（⚠️ 目前只寫在 terms 和 methodology）；
- about、contact、privacy、terms 都要有（✅）；
- 申請時用網域信箱（✅ opencard@opencardai.com）；
- **流量要誠實報**，審核方會用 SimilarWeb、Ahrefs 交叉比對。

> 公開的佣金數字很少，而且大多是第三方整理的。例如有網站寫 Capital One 透過 FlexOffers／Bankrate「每個 funded customer 約 $70」[6]，**可信度低，不能拿來當財務預測**。真正的數字要等核准後在後台才看得到。

---

## 3. 個人推薦連結（Refer-a-Friend）：不要公開放在網站上

| 發卡行 | 規則重點 | 來源 |
|---|---|---|
| **Amex** | 英國條款寫得很明白：只能傳給親友，**禁止透過付費廣告或對公眾（公開部落格、搜尋引擎、贊助廣告）推廣**。美國版條款這次**沒抓到全文【待確認】**，但精神應該一樣 | [7][8] |
| **Chase** | 美國官網只說把個人化連結分享給「friends」，傳簡訊要先取得同意。英國條款明確**禁止公開分享做付費推廣，只能給認識的人** | [9][10] |
| **Capital One** | 官網說是給「friends and family」，有收入上限。**條款全文【待確認】** | [11][12] |
| **Citi** | **這次沒有查到條款【待確認】** | — |

**結論**：
- OpenCard 是商業網站，把站長的個人推薦連結放上去，最輕是被沒收獎勵，最重是帳號被關，還會讓之後申請正式聯盟方案時被扣分。
- **一律不放個人推薦連結**，只用正式的聯盟／合作管道。

---

## 4. FTC 揭露要怎麼做

依 FTC Endorsement Guides（16 CFR Part 255，§255.5「重大關係揭露」）跟 FTC 官方 FAQ、.com Disclosures [13][14][15]：

1. 有拿佣金就要**清楚、明顯**地揭露。FTC 給的範例是 "I get commissions for purchases made through links in this post"。
2. **要放在推薦或連結旁邊**，讀者看到連結的同時就要看得到揭露。只放一個「Disclosure」或「Legal」的超連結**不算**。
3. **只寫 "affiliate link" 或 "buy now" 不夠**；"paid link" 放在連結旁邊可以接受。
4. 不能藏在要捲很久、或要點「更多」才看得到的地方。手機版也要一樣明顯。
5. 中文版、西文版也要有**同等**的揭露，**用該語系寫**。

**要做的事**：
- 卡片頁的 CTA 旁邊放一行揭露；
- 指南頁開頭放揭露；
- footer 放「How we make money」的連結；
- 另外做一頁獨立的揭露頁（現在 terms 裡的段落保留）。
- **這些都要在第一個聯盟連結上線「之前」完成。**

---

## 5. 時程規劃

### 第 0–1 個月（2026-10 中 → 11 中）：先把地基打好，不急著賺錢

1. **拿回數據**：
   - ✅ 已經從 GSC 每日報表補上 28 天的數字；
   - 還缺：近 3 個月的資料、前 15 名查詢跟頁面、收錄原因（要 KC 提供正式的 GSC 唯讀權限，或直接從 GSC 介面匯出）、Vercel Analytics 訪客數。
2. **解決 Vercel 的問題**：
   - Hobby 方案**明文限定非商業用途**，有聯盟連結或 AdSense 就算商業用途，要升 Pro [16]；
   - Deployment Storage 已經 100%，要清掉舊部署，避免網站掛掉。
   - 👉 要由 KC 決定預算再升級。
3. **查清楚 AdSense 被拒的原因**：登入 AdSense，看「網站」頁的具體問題，列成修正清單。
4. **擴大可收錄的頁面**：
   - ✅ 10/18 已完成：sitemap 從 79 個 URL 擴到 342 個，修好全站 canonical 指向首頁的 bug，翻譯指南開放收錄；
   - 線上 sitemap 的 URL 都會回 200（7/3 那次 Sitemap 404 已經不存在）；
   - 接下來要盯 2–4 週的 GSC 收錄變化。風險是 AdSense 認為「內容太薄」，要搭配卡片頁的原創分析一起補強。
5. **把揭露的位置先做好**：寫好卡片頁、指南頁、footer 的揭露文字跟元件（先不放連結）。
6. **email 名單**：確認 My Cards 訂閱目前有多少人；評估要不要加「每月開卡優惠」電子報的訂閱入口。

### 第 1–3 個月（11 月 → 2027-01）：衝流量，準備申請

1. **內容**：
   - 每週 2–3 篇高意圖的比較文，例如「X vs Y」、「最適合 ○○ 的卡」、「2027 年 ○○ 卡值不值得辦」，從我們已經有的 elevated-offers 和卡片資料延伸；
   - **英文優先**，中文版跟著做，攻台美雙邊用戶。
2. **卡片頁**：每個月新開放 30–50 張卡給搜尋引擎收錄，每批放出去之前都先跑資料稽核（audit:weekly）。
3. **技術 SEO**：
   - 結構化資料（Product/Review 要小心，不要違反 Google 規則）；
   - 內部連結（指南 ↔ 卡片頁 ↔ compare）；
   - 速度也要顧到。
4. **社群渠道**：FB 已經不能用了，改用 Reddit（只分享內容，不能貼連結洗版）、X、Threads。
5. **大約第 3–5 個月**（實際基準只有 4 次點擊，比原本推估的還慢）：
   - GSC 有 ≥ 40–100 次點擊／28 天以後，送 **CardRatings** 申請；
   - 修好問題後重送 **AdSense**。

### 第 3–6 個月（2027-01 → 04）：第一筆收入

1. CardRatings 核准後，**先在 10–20 個流量最高的頁面**放連結，A/B 測試 CTA 的位置跟文案（揭露一定要在旁邊）。
2. 每週看點擊 → 申請 → 核准的轉換。數據跟編輯評分要完全分開，評分邏輯照 methodology，**不因為佣金調整排序**。
3. 開始累積實績，準備 **FlexOffers** 的申請資料。
4. 試發每月電子報（開卡優惠＋權益到期提醒），名單是我們自己的資產。

### 第 6–12 個月（2027-04 → 10）：擴大跟升級

1. 申請 **FlexOffers → CJ → Impact** 上的發卡行方案，拿實際轉換數據去談。
2. 如果 Capital One、Citi 等核准，**直營連結取代 sub-affiliate**，提高每筆收入。
3. 評估付費功能，例如 My Cards 進階提醒、家庭共用，或 B2B 資料授權。**要先有使用者數據再決定**。
4. 每季做一次法遵檢查：揭露、優惠資訊有沒有過期、各語系一致。

---

## 6. KPI 與目標

> 基準是 GSC 每日報表的實際數字（9/19–10/16）。下面的目標是我們訂的，不是預測。因為實際基準（4 次點擊）比原本推估的還低，目標整體往下修。

| KPI | 基準（現況） | 第 1 個月 | 第 3 個月 | 第 6 個月 | 第 12 個月 |
|---|---|---|---|---|---|
| GSC 點擊／28 天 | **4**（9/19–10/16） | 10 | 40 | 200 | 1,000 |
| GSC 曝光／28 天 | **890** | 1,500 | 4,000 | 12,000 | 40,000 |
| GSC 平均排名 | 約 24 | ≤ 24 | ≤ 20 | ≤ 18 | ≤ 15 |
| Sitemap URL 數 | 342（10/18 修正後；修正前 79） | 342 | 依新卡跟新文章增加 | — | — |
| 已收錄頁數（GSC） | **【未知】** | 補齊 | +100 | +250 | +400 |
| 英文指南／比較文 | 28 | 32 | 50 | 70 | 100 |
| email 訂閱數 | **【未知】** | 補齊 | 100 | 300 | 1,000 |
| 已核准的聯盟方案數 | 0 | 0 | 1（CardRatings） | 1–2 | 3＋ |
| 聯盟月收入 | $0 | $0 | 開始有收入 | **等有轉換數據才設定** | **同左** |
| 資料準確度（稽核錯誤數） | 看 audit:weekly 報告 | 0 個 critical | 0 個 critical | 0 個 critical | 0 個 critical |

---

## 7. 團隊分工

| 小組 | 負責 | 每週產出 |
|---|---|---|
| **卡片資料組**（card-adaptor／audit bots） | 卡片資料正確性、優惠更新、audit:weekly、新卡上架、決定哪些卡可以放進 sitemap | 稽核報告、新增或修正的卡片數、可收錄名單 |
| **成長與內容組** | SEO 研究、指南和比較文、多語系、社群、聯盟申請跟後台管理、電子報 | 新文章數、GSC 週報、轉換報表 |
| **產品與 QA 組**（QA bots） | 揭露元件、聯盟連結追蹤、My Cards 功能、效能、404 監控、Vercel 用量 | 上線紀錄、錯誤數、用量警告 |
| **KC（決策）** | 預算（Vercel Pro）、聯盟合約簽署、最終審核 | 每月一次 review |

---

## 8. 前三大風險

1. **流量起不來，申請一直被拒**
   - 現在只確定 28 天 10 次點擊，AdSense 被拒 3 次，Amazon 被關。
   - 👉 對策：
     - 先擴大收錄、做高意圖內容；
     - 申請前先確認達標，不要一直送一直被拒；
     - 從門檻最低的 CardRatings 開始。
2. **主機方案跟穩定性**
   - Vercel Hobby **不能商用**，Deployment Storage 已經 100%，ISR 用量也偏高。
   - 👉 對策：開始變現前就升 Pro、清理部署、監控用量。
3. **法遵跟資料正確性**
   - 優惠資訊過期、揭露沒放對位置、公開貼個人推薦連結，都可能違反 FTC 規定或發卡行規則，也會害聯盟帳號被終止。
   - 👉 對策：
     - 揭露先上；
     - 不放個人推薦連結；
     - audit:weekly 持續跑；
     - 評分跟佣金完全脫鉤。

---

## 9. 目前缺的存取權

- **GSC 完整報表**（近 3 個月、前 15 名查詢跟頁面、收錄原因）：OAuth 憑證只寫在 cron 指令裡，要 KC 提供正式的唯讀方式（例如 service account 加進 GSC 使用者）。
- **Vercel Analytics 訪客數、目前 storage／ISR 的確切百分比**：CLI 查不到（Hobby 方案沒有 usage API），要看 dashboard。
- **AdSense 被拒原因**：要登入 AdSense 才看得到。
- **My Cards 使用者數、email 訂閱數**：要 Upstash 的唯讀權限。
- **FB 粉專狀態**：要確認。
- **Amex US／Capital One／Citi 推薦條款全文**：還沒取得。

---

## 參考來源

1. CardRatings 聯盟申請頁：https://www.cardratings.com/affiliate.html
2. Lasso 整理的 CardRatings 方案（佣金 Varies）：https://getlasso.co/affiliate/cardratings/
3. LinkJolt，2026 信用卡聯盟方案（FlexOffers、CJ）：https://www.linkjolt.io/blog/affiliate-programs-for-credit-cards
4. brandID，信用卡聯盟審核重點：https://brandid.app/blog/best-credit-card-affiliate-programs/
5. RevShare，信用卡聯盟方案整理：https://www.revshare.so/programs/best-affiliate-programs-for-credit-cards
6. AdCompares，Capital One 方案（第三方，可信度低）：https://adcompares.com/affiliate/programs/credit-card/
7. Amex UK 推薦條款：https://www.americanexpress.com/uk/legal/refer-a-friend/terms-and-conditions.html
8. Amex US 推薦頁：https://www.americanexpress.com/en-us/referral
9. Chase US Refer-A-Friend 說明：https://www.chase.com/personal/credit-cards/education/basics/chase-refer-a-friend
10. Chase UK 推薦條款：https://www.chase.co.uk/gb/en/legal/refer-a-friend-2-terms-and-conditions/
11. Capital One Refer a Friend：https://www.capitalone.com/credit-cards/refer-a-friend/
12. Capital One 說明中心：https://www.capitalone.com/help-center/credit-cards/getting-credit-card-referral-bonus/
13. FTC Endorsement Guides FAQ：https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
14. 16 CFR 255.5：https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255/section-255.5
15. FTC .com Disclosures：https://www.ftc.gov/system/files/documents/plain-language/bus41-dot-com-disclosures-information-about-online-advertising.pdf
16. Vercel Fair Use Guidelines（Hobby 不能商用）：https://vercel.com/docs/limits/fair-use-guidelines
