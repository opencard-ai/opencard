# Public Repo Leak Audit

> Date: 2026-04-26
> Repo: `https://github.com/opencard-ai/opencard` — **PUBLIC**
> Scope: Full git history (default branch + all branches)

---

## 嚴重度排行

| Severity | 項目 | Status |
|---|---|---|
| 🔴 **High** | Upstash Redis token | rotate **必做**;leaked since `9bbfdb3` |
| 🔴 **High** | Upstash read-only token | 同上;leaked in chat 2026-04-25 |
| 🔴 **High** | MiniMax API key (`sk-cp-...`) | rotate **必做**;leaked since `580beee` (跨 3 commits) |
| 🟠 Medium | 個人 Gmail `kccx****@gmail.com` | **已在 git history**(`f5cc83a` → `OPENCARD_HANDOVER.md`) |
| 🟠 Medium | AgentMail inbox 名稱(2 個)| 公開但會被攻擊者用作 phishing |
| 🟡 Low | Vercel projectId / orgId | 公開識別碼,本身非 secret 但 expose team 名 |
| 🟡 Low | Upstash 資料庫名 `wanted-pelican-80843` | enum target,沒 token 用不了但會被 brute force |
| 🟢 Info | Commit author `kaceyc@Kaceys-Mac-mini.local` | local hostname leak,無實質攻擊面 |
| 🟢 Info | Repo 體積膨脹 — 100+ CFPB PDF blob | Public PDF 不算 leak,但 repo 大了 ~25 MB |

---

## 詳情

### 🔴 1. Upstash Redis tokens

**Leaked 內容**:
- `UPSTASH_KV_REST_API_TOKEN`(主 RW token):`gQAAAAAAATvLAAIncDI0...`
- `UPSTASH_KV_REST_API_READ_ONLY_TOKEN`:`ggAAAAAAATvLAAIgcDI0...`
- 連線字串 `UPSTASH_KV_URL`、`UPSTASH_REDIS_URL`(內含 RW token)

**暴露位置**:
- Git history: `vercel.json`(commits `9bbfdb3`、`cfe1aeb`,active 約 3 天)
- Chat history(this conversation,2026-04-25)— RO token + RW token 都貼了

**攻擊面**:
- Read + write + delete 整個 `wanted-pelican-80843` 資料庫
- 取得所有 `opencard:user:*`(訂閱使用者 SHA-256 email + 訂閱卡片清單)
- 取得 `opencard:subscribers` 完整清單
- 寫入假資料、清空訂閱、改 cron 執行狀態

**影響**:
- 訂閱使用者 email hash 可被 rainbow-table 反推(常見 email 一查就到)
- 你的訂閱者數量、興趣卡片組合可被競品看到
- Subscription email 可被刪光,使用者收不到提醒(reputation 損失)

**Status**:你說 rotate 好了,但 **MiniMax 同時 rotate 了嗎需要確認**(下面)。

---

### 🔴 2. MiniMax API key (`sk-cp-...`)

**Leaked 內容**:
- `sk-cp-mFUA974Fysefoi8t8a...VOD_7Y`(完整 key)

**暴露位置**:
- Git history: `scripts/sync-news.mjs:9`,跨 3 commits(`580beee`、`770a49d`、`4f81d20`)
- Git history: `scripts/unified-scraper.ts:209`(被當 fallback 寫成 `process.env.MINIMAX_API_KEY || 'sk-cp-...'`,**靜默退回硬編碼 key**,問題比 sync-news 還嚴重)— 已改為 throw if missing
- Chat history(this conversation,2026-04-26)— 你**剛剛**又貼了一次,還說「這個是月費方案的」

**Status uncertain**:你昨天說「rotate 好了」但今天又貼了 `sk-cp-` 並說它是 active 月費。可能性:
- 你只 rotate 了 Upstash,MiniMax 還沒
- 或 `sk-cp-` 跟 `sk-api-` 是 MiniMax 不同帳戶 / 產品,兩個都 active

**攻擊面**:
- 任何撿到的人可以刷你月費 quota(直到上限)
- 可看你的 prompt(可能含使用者 query)
- 可改 prompt 製造誤導內容
- 月費方案 quota 用完後可能升級成 metered billing,出現帳單衝擊

**強烈建議**:進 MiniMax console 確認 `sk-cp-` 是不是還 active,如果是就立刻 invalidate。

---

### 🟠 3. 個人 Gmail `kccx****@gmail.com`

**暴露位置**:
- `OPENCARD_HANDOVER.md`(commit `f5cc83a`,昨天剛 commit)
- 檔案內容:`AgentMail kccx****@gmail.com 被 block — Amazon SES bounce`

**為什麼這算 leak**:
- 這是你個人 Gmail,連到 Amazon SES bounce → 表示你**用這個 email 註冊 AgentMail 帳號**
- 攻擊者拿這個 + 你 GitHub username `opencard-ai` → 可開始做 social engineering / phishing
- 可拿來查你其他註冊過的服務(haveibeenpwned)
- 跟你的 Anthropic / OpenAI / Vercel / Upstash 帳號 email 重複機率高

**修補**:
- HANDOVER.md 把 email 改成 `<personal-email>` placeholder
- 想徹底:用 BFG / git-filter-repo 抹掉 history 裡的這字串
- 替代地:把這部分搬到 `.env.local` 註解 / 私人 Notion

---

### 🟠 4. AgentMail inbox 名稱

**已 commit 到 public**:
```
data/opencard-email-state.json:    "inbox": "orangeisland539@agentmail.to"
docs/API.md:                       opencard@agentmail.to
app/[lang]/my-cards/page.tsx       opencard@opencardai.com  (your domain, fine)
```

`orangeisland539@agentmail.to` 跟 `delightfulschool306@agentmail.to`(我 audit 看到還有提過)是 AgentMail 自動生成的 sender mailbox。**Inbox 名稱本身公開不是大事** — agentmail 的 inbox 是你 own 的,別人寄信到那邊只會落到你 inbox。

**但**:攻擊者可以**從這個 inbox 發 phishing**(假冒 OpenCard 寄假信)— 受害者看到 sender 是 `orangeisland539@agentmail.to` 也許就點。實際做法:攻擊者註冊一個 `orangeisland540@agentmail.to`,長相類似,鋪 phishing。

**修補(可選)**:
- 短期:現在的 inbox name 沒風險,因為 mailbox 是你的
- 長期:換成 sender domain 是 `noreply@opencardai.com`(你 own 的 domain,SPF/DKIM/DMARC 設好),phishing 攻擊會被 mail server 擋下來

---

### 🟡 5. Vercel projectId / orgId

**Public 的內容**:
- `OPENCARD_HANDOVER.md` 有 `prj_SSAFkOhb...`
- `team_26NhyoUcl18rQH1AN4O4KxqJ`(在 `.vercel/project.json` 但 gitignored ✓)

**為什麼算 footprint**:
- `prj_*` 是 Vercel 內部 project ID,**公開不能直接用來部署 / deploy** — 需要 Vercel access token
- 但結合 `--token <leaked>` + `vercel deploy --project=prj_SSAF...` 就能 push 到你的 project
- 你 token 沒 leak(沒在 repo)所以目前安全
- `team_*` expose 出 Vercel team / org 名稱,可拿來做 social engineering

**修補**:
- HANDOVER.md 把 prj_ 改成 placeholder
- 確保 Vercel deploy token 永遠不入 git

---

### 🟢 6. Commit author email = local hostname

```
$ git log --format='%ae' --all | sort -u
kaceyc@Kaceys-Mac-mini.local
```

不是真正的 email(`.local` 不是有效 TLD),但暴露:
- 你電腦的 hostname `Kaceys-Mac-mini.local`
- 你的 username `kaceyc`

低風險。如果想乾淨,設一個 generic git identity:
```
git config user.email "kacey@opencardai.com"
git config user.name "Kacey"
```
未來 commit 就用這個。歷史 commit 改 = filter-repo,但這項不值得花力氣。

---

### 🟢 7. Repo 體積:25 MB CFPB PDFs

```
data/cfpb-cache/  → 113 PDFs, 25 MB
```

CFPB PDFs 是政府公開文件,不算 leak。**但**:
- repo clone 很慢
- 讀者下載這些不必要
- 應該 .gitignore 並改用 Vercel Blob / S3 / 即時抓

**修補(可選,P3)**:
```
echo 'data/cfpb-cache/*.pdf' >> .gitignore
git rm --cached data/cfpb-cache/*.pdf
git commit -m "chore: untrack CFPB PDF cache"
```
現有的 history 還在,要徹底瘦身用 BFG。

---

## 還有沒有別的 — 我的 audit 範圍

我跑過的搜尋:
1. ✅ Token-shape 字串(40+ 字元 base64-ish)在 git history 全 diff
2. ✅ 已知前綴(`sk-`、`AKIA`、`GOCSPX-`、`gQAA`、`ggAA`)
3. ✅ Email pattern 的個人 email
4. ✅ 電話 / 地址 pattern
5. ✅ `.env*` / `.key` / `.pem` 是否曾被 commit
6. ✅ Commit message 提到 secret / token / password
7. ✅ AgentMail inbox 名稱
8. ✅ Vercel / Upstash 內部識別碼
9. ✅ 訂閱使用者 PII(沒進 git ✓)
10. ✅ `OPENCARD_HANDOVER.md` 全文

我**沒找到**的(可能有但 audit 沒對到):
- 🔍 .next/ build 產物有沒有 leak inline secret(.next/ 是 gitignored,本機構建只在 dev)
- 🔍 image metadata(EXIF)— 可能有但需要 exiftool 才看得出
- 🔍 第三方 webhook URL / Discord webhook(沒看到 pattern,但你如果之後加了要小心)
- 🔍 GitHub Actions secrets — repo settings 看,我看不到

---

## 修補 priority

| 優先 | 動作 | 估時 |
|---|---|---|
| 🔴 **NOW** | 確認 MiniMax `sk-cp-` 是否 rotated;若否,進 console rotate | 5 分 |
| 🔴 **NOW** | (剛做了)`vercel.json` 移除 token + commit 推上線 | done |
| 🔴 **NOW** | 確認 Vercel env vars 已設新 Upstash token,production 還能 work | 5 分 |
| 🟠 P1 | 加 gitleaks pre-commit hook,防再 leak | 15 分 |
| 🟠 P1 | `OPENCARD_HANDOVER.md` 把 `kccx****@gmail.com` + `prj_*` 改成 placeholder | 5 分(working tree) |
| 🟢 P2 | BFG / filter-repo scrub history,移除 token 字串 + 個人 email | 30 分 |
| 🟢 P3 | `data/cfpb-cache/*.pdf` 從 repo 移除(改用 blob storage) | 1 hr |
| 🟢 P3 | git config user.email 換成 generic | 1 分(未來 commits) |

---

## 一個重要結論

**Public repo + leak 過的 token = rotate 是不可妥協的**。BFG 抹歷史只是「視覺乾淨」,因為:

1. GitHub Secret Scanning 早就把 leak token 索引到 partner database(Upstash / MiniMax 不在 GitHub partnership 裡 → 不會自動失效,但 GitHub 可能還是發 email 警告你)
2. 第三方 archive 服務(GitArchive、SourceGraph、ML 訓練 scraper、研究人員 academic crawl)有過去 commit 的副本
3. Anyone who cloned/forked 之前的版本本機都有

**Realistic 風險評估**:public repo + token leak 的時間 ≥ 1 小時,基本上要當作「已經被檢索」。Rotate 是停損,history scrub 是好習慣但不是緊急。

---

*我 audit 用的 bash command 都在 git history 的 chat log 裡,要重跑可以複製出來 review。*
