# 🚨 Security Notice — Multiple Tokens Exposed in Git

> Created: 2026-04-25
> Severity: HIGH
> Status: **Pending user action — Claude cannot rotate tokens**

## Summary

Two production secrets were found hardcoded in committed files. Both must be rotated.

| Secret | File | Committed since |
|---|---|---|
| Upstash Redis token (`UPSTASH_KV_REST_API_TOKEN`) | `vercel.json` | 9bbfdb3, ~3 days |
| MiniMax API key (`MINIMAX_API_KEY`) | `scripts/sync-news.mjs` | 580beee → 770a49d → 4f81d20, multiple commits |

Both committed to `main`. If the repo is or has ever been public, treat both as fully compromised.

---

## Exposure 1: Upstash Redis token

`vercel.json` had this committed to `main` for ~3 days:

```json
"env": {
  "UPSTASH_KV_REST_API_URL": "https://wanted-pelican-80843.upstash.io",
  "UPSTASH_KV_REST_API_TOKEN": "gQAAAAAA...[REDACTED — see git history at 9bbfdb3 for full string]"
}
```

Commits in chain:

```
9bbfdb3 fix: add Upstash env vars to vercel.json     ← token first added
cfe1aeb fix: move Upstash env to runtime env         ← token still in file, just moved key
```

If the repo is public on GitHub (https://github.com/opencard-ai/opencard), this token has been crawlable for ~72 hours. Even if private, anyone with read access can recover it from `git log`.

## What this token can do

`UPSTASH_KV_REST_API_TOKEN` is a master credential for the `wanted-pelican-80843` Redis instance — it grants **read + write + delete** on every key, including:

- `opencard:user:*` — your users' email subscription state (SHA-256 hashed emails, but still PII metadata)
- `opencard:subscribers` — full subscriber list

An attacker can:
- Read all subscribers
- Delete all subscriptions (resulting in cron reminders going to nobody)
- Write fake data
- Run arbitrary commands within Upstash REST API permissions

## What I (Claude) did

Removed the token from `vercel.json` in the working copy.

```diff
-  "env": {
-    "UPSTASH_KV_REST_API_URL": "...",
-    "UPSTASH_KV_REST_API_TOKEN": "..."
-  },
```

This is **necessary but not sufficient**. The git history still contains the leaked token.

## What you (Kacey) must do — in this order

### 1. Rotate the token NOW

```
Upstash console → Database `wanted-pelican-80843` → Settings → Tokens
→ Regenerate REST token
→ Copy new token
```

The old token is **invalid the moment you regenerate**, so do this when you have ~5 minutes to also update Vercel (otherwise prod cron will fail).

### 2. Set the new token in Vercel env vars (NOT in vercel.json)

```bash
# CLI option:
vercel env add UPSTASH_KV_REST_API_TOKEN production
# (paste new token)
vercel env add UPSTASH_KV_REST_API_URL production
# (paste https://wanted-pelican-80843.upstash.io)

# Or via Vercel dashboard:
# Settings → Environment Variables → Add
# Name: UPSTASH_KV_REST_API_TOKEN
# Value: <new token>
# Environment: Production (and Preview if you want)
```

The code already reads `process.env.UPSTASH_KV_REST_API_URL` and `process.env.UPSTASH_KV_REST_API_TOKEN` (see `app/api/cron/reminders/route.ts:5-7`). It will pick up Vercel env vars automatically once they're set.

### 3. Trigger a fresh deploy

```bash
git commit -m "security: remove Upstash token from vercel.json"
git push origin main
# Vercel auto-deploys.
```

### 4. Verify cron + subscription endpoints still work

```bash
# Test cron endpoint with a manual call (replace CRON_SECRET):
curl -H "Authorization: Bearer <CRON_SECRET>" https://opencardai.com/api/cron/reminders

# Test subscription:
curl -X POST https://opencardai.com/api/my-cards/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your test email>","cards":["amex-platinum"]}'
```

If both still work, the new token is wired up correctly.

### 5. (Optional but recommended) Scrub git history

Even after rotation, keeping the old token in git history is bad hygiene. Tools:

```bash
# Option A: BFG (fastest)
brew install bfg
bfg --replace-text passwords.txt   # passwords.txt: one secret per line
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# Option B: git filter-repo (newer, recommended by GitHub)
brew install git-filter-repo
git filter-repo --replace-text passwords.txt
```

Then `git push --force` (only do this if you're sure no one else has the repo cloned).

If the repo is public, also **report exposure to GitHub Secret Scanning** — GitHub will notify Upstash automatically and mark the secret as known-compromised, but rotation is still your responsibility.

---

## Exposure 2: MiniMax API key

`scripts/sync-news.mjs:9` had this hardcoded:

```js
const MINIMAX_API_KEY = "sk-cp-mFUA9...[REDACTED — see git history at 580beee for full string]";
```

The key is committed in at least three commits (`580beee`, `770a49d`, `4f81d20`).

### What I did

Replaced the line with `process.env.MINIMAX_API_KEY` and added an explicit fail-fast if the env var is missing:

```js
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
if (!MINIMAX_API_KEY) {
  console.error("ERROR: MINIMAX_API_KEY env var not set...");
  process.exit(1);
}
```

### What you must do

1. **Rotate the key** in the MiniMax console (https://platform.minimax.io)
2. **Set the new key** in:
   - Vercel env vars (if `sync-news.mjs` runs in production cron — check)
   - Your local `.env.local`
   - Wherever you run scripts manually
3. The script `scripts/sync-news.mjs` runs as cron `OpenCard News Feed Sync` per HANDOVER.md. Verify it picks up the new env var and runs successfully on the next cycle (1, 7, 13, 19 hour).

---

## Other secrets that might also be exposed — please verify

I checked these and they look OK:

- ✅ `.env.local` is gitignored (`.gitignore:.env*`) — checked: not in `git log`
- ✅ `GSC_CLIENT_SECRET` (`GOCSPX-z-8K0...`) was never committed (checked via `git log -S`)
- ✅ `AGENTMAIL_API_KEY` is not in any committed file (only in `.env.example` as `am_us_xxx` placeholder)
- ✅ `CRON_SECRET` is not in any committed file

But please double-check by running:

```bash
# Look for anything that looks like a token in committed files
git log -p --all | grep -iE '(token|secret|key|api_key)' | grep -iE '[a-z0-9]{20,}' | head -20

# Check current working tree for any secret-shaped values you don't recognize
grep -rE '"[a-zA-Z0-9_-]{40,}"' --include='*.json' --include='*.ts' --include='*.tsx' --include='*.mjs' .
```

## Why this matters beyond just the token

The pattern of "commit secret to vercel.json → notice it → move it → still committed" suggests the workflow doesn't have a pre-commit hook to catch secrets. Strong recommendation:

```bash
# Install gitleaks pre-commit hook (one-time)
brew install gitleaks
gitleaks protect --staged
# Or via pre-commit framework:
brew install pre-commit
echo "repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks" > .pre-commit-config.yaml
pre-commit install
```

This will catch the next time someone (you or an agent) tries to commit something that looks like a token.

---

**Summary of what's done vs what's pending:**

| Step | Status |
|---|---|
| Remove Upstash token from working `vercel.json` | ✅ Done by Claude |
| Replace MiniMax key in `sync-news.mjs` with `process.env.MINIMAX_API_KEY` | ✅ Done by Claude |
| Rotate Upstash token | ⏳ Pending — must be done by user |
| Rotate MiniMax key | ⏳ Pending — must be done by user |
| Set both new tokens in Vercel env vars + local `.env.local` | ⏳ Pending — must be done by user |
| Verify production cron + sync-news still work | ⏳ Pending — must be done by user |
| Scrub git history (BFG / git-filter-repo) | ⏳ Optional — must be done by user |
| Add gitleaks pre-commit | ⏳ Optional — recommended |
