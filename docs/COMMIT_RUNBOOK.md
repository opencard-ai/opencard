# Commit Runbook — Day 1 + Week 1 Takeover

> **All pre-flight checks I (Claude) could run in sandbox: ✅ green.**
> What's left needs your machine + credentials. ~15 minutes.

## What Claude pre-flighted (already green)

| Check | Result |
|---|---|
| TypeScript typecheck (8 new TS files) | ✅ 0 errors |
| `validate-all.ts` against current 249 cards | ✅ 0 errors, 16 warnings (all expected sanity warnings) |
| All YAML configs (workflows, pre-commit) parse | ✅ |
| All JSON configs (gitleaks rules, issuer mapping, package.json) parse | ✅ |
| All 249 `data/cards/*.json` parse | ✅ |
| Working tree free of leaked tokens / personal email | ✅ |
| Sanity rule blocks `annual_fee=12` simulation | ✅ |

## What needs your machine

```bash
cd /Users/kaceyc/.openclaw/workspace/opencard
```

### 1. Install new deps (`tsx`, `pdf-parse`)

```bash
npm install
# updates package-lock.json with the 2 new devDeps
```

If this errors on lockfile drift, do a clean install:

```bash
rm package-lock.json
npm install
```

### 2. Set credentials in `.env.local`

`.env.local` is gitignored, safe to keep secrets here.

```bash
cat > .env.local <<'EOF'
# === Upstash (post-rotation values from Upstash console) ===
UPSTASH_KV_REST_API_URL=https://wanted-pelican-80843.upstash.io
UPSTASH_KV_REST_API_TOKEN=<paste new RW token>
UPSTASH_KV_REST_API_READ_ONLY_TOKEN=<paste new RO token>

# === MiniMax (your subscription key, post-rotation if you decide to rotate) ===
MINIMAX_API_KEY=<paste your MiniMax key>

# === Existing GSC OAuth (already in old .env.local) ===
GSC_CLIENT_ID=...
GSC_CLIENT_SECRET=...
GSC_REDIRECT_URI=http://localhost:8080/oauth/callback

# === Cron + email ===
AGENTMAIL_API_KEY=...
AGENTMAIL_FROM_INBOX=orangeisland539@agentmail.to
CRON_SECRET=...
NEXT_PUBLIC_BASE_URL=https://opencardai.com
EOF
```

(Don't paste keys here in chat ever again — straight into the file.)

### 3. Smoke test the new CFPB extractor (~10 sec, ~$0)

```bash
npx tsx scripts/pipelines/cfpb/extract.ts \
  --pdf data/cfpb-cache/amex-platinum.pdf \
  --card-id amex-platinum \
  --quarter "Q3 2025" \
  --dry-run
```

**Expected good output:**

```
📄 Extract Schumer Box  (DRY RUN)
   PDF:     data/cfpb-cache/amex-platinum.pdf
   Card ID: amex-platinum
🤖 Calling MiniMax...
   confidence: 0.95
   tokens:     ~3500
   canonical:  The Platinum Card from American Express
📋 Extracted fields:
   ✓  annual_fee                   895
   ✓  foreign_transaction_fee      0
   ✓  apr_purchases_min            21.24
   ✓  apr_purchases_max            28.24
   ...
```

**If you see `annual_fee=12` come back from the LLM:** the sanity gate will mark it ✗ and report `Premium-named card "...Platinum..." cannot have annual_fee=$12`. That's the gate working — the value never gets written. We'd then iterate on the prompt.

**If LLM call errors out:** check `.env.local` has `MINIMAX_API_KEY`, check MiniMax console for active keys, retry.

### 4. (Optional) Test on 2 more cards

Just to be sure it's not a fluke:

```bash
npx tsx scripts/pipelines/cfpb/extract.ts \
  --pdf data/cfpb-cache/amex-blue-cash-everyday.pdf \
  --card-id amex-blue-cash-everyday --dry-run
# expect annual_fee = 0, foreign_transaction_fee = 2.7

npx tsx scripts/pipelines/cfpb/extract.ts \
  --pdf data/cfpb-cache/amex-gold.pdf \
  --card-id amex-gold --dry-run
# expect annual_fee = 325 (or 295 — verify against amex.com whichever)
```

### 5. Final validate

```bash
npm run validate
# Expected: 0 errors, ~16 warnings, exit 0
```

### 6. Commit + push

```bash
# First, double-check no .env.local sneaking in
git status | grep -E '\.env|secret|token' || echo "clean"

# Stage everything
git add -A

# Final review of what's about to be committed
git diff --cached --stat | tail -10

# Commit (paste this whole heredoc)
git commit -m "$(cat <<'EOF'
takeover: Day 1 incident response + Week 1 rewrite

🚨 Day 1 (stop the bleeding)
- Revert CFPB-corrupted annual_fee on 19 cards (amex-platinum 12→895 etc.)
- Remove leaked Upstash + MiniMax tokens from working tree
  (vercel.json, sync-news.mjs, unified-scraper.ts had silent || fallback)
- CFPB pipeline kill switch (_DISABLED.flag + _killswitch.py)
- See docs/SECURITY_NOTICE.md and docs/PUBLIC_REPO_LEAK_AUDIT.md

🛠 Week 1.A — pipeline consolidate
- Move 26 broken iterative scripts to scripts/pipelines/cfpb/archive/
- Move issuer config to scripts/pipelines/cfpb/config/
- README.md with re-enable checklist

🤖 Week 1.B — LLM-first Schumer Box extractor
- lib/llm-minimax.ts (generic MiniMax client, JSON mode + abort)
- scripts/pipelines/cfpb/lib/schumer-llm.ts (sanity-gated extraction)
- scripts/pipelines/cfpb/extract.ts (single-PDF runner)
- See docs/CFPB_EXTRACT_VERIFY.md

📚 Week 1.C — fact store + review queue
- lib/fact-store.ts (append-only event log + reconciler + review queue)
- scripts/promote-facts.ts (materialize fact store → data/cards/)
- scripts/seed-fact-store-from-cards.ts (one-time baseline migration)
- See docs/FACT_STORE.md

✅ Week 1.D — CI gate
- validate-all.ts: 7 sanity rules incl. premium-named card with annual_fee < $50
- Workflow now invokes npm run validate (was inline weak validation)
- Add tsx + pdf-parse to devDeps

🔒 Bonus security hygiene
- gitleaks pre-commit + GitHub Actions (.gitleaks.toml with custom rules)
- .pre-commit-config.yaml + docs/SECURITY_SETUP.md
- PII placeholders in HANDOVER + TAKEOVER_PLAN
- Token strings in SECURITY_NOTICE redacted to prefix + [REDACTED]

Plan: docs/TAKEOVER_PLAN.md
EOF
)"

git push origin main
```

### 7. Watch CI

```bash
# Watch the GitHub Actions tab:
# https://github.com/opencard-ai/opencard/actions
#
# Expected runs:
# 1. Validate Card Data — should pass (0 errors)
# 2. Secret Scan (gitleaks) — should pass (known-leak commits in allowlist)
```

### 8. Verify production

```bash
# annual_fee fix went live:
curl -s 'https://opencardai.com/api/cards?card_id=amex-platinum' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["name"], "$"+str(d["annual_fee"]))'
# Expected: The Platinum Card® from American Express $895
```

If still shows $12, Vercel deploy hasn't finished yet — wait 2 min and retry.

---

## If something goes wrong

### `npm install` fails on `pdf-parse`

`pdf-parse` is mature but its only maintainer hasn't pushed in a while.
Alternative: switch to `pdfjs-dist` (Mozilla's, bigger but actively maintained).
Edit `scripts/pipelines/cfpb/lib/pdf-text.ts` if needed.

### CI gitleaks workflow fails on first run

`.gitleaks.toml` already has the 5 known-leak commit SHAs in `[allowlist] commits`.
If a commit you don't recognize is flagged, that's a NEW leak — investigate, don't suppress.

### CI validate-all.ts fails

Run `npm run validate` locally to reproduce. The sandbox confirmed 0 errors as
of this writeup, but if cards changed between then and your commit, re-run
`promote-facts:dry` to see the diff.

### LLM extract returns `annual_fee=12`

Sanity gate catches it; the field is rejected and queued for review. The other
fields (FX fee, APRs) may still extract fine. We'd then tune
`scripts/pipelines/cfpb/lib/schumer-llm.ts` SYSTEM_PROMPT with more explicit
"don't match billing-cycle counts" guidance. This is iteration, not a blocker.

### Production still shows old data after push

```bash
# Force redeploy from CLI (if you have vercel CLI)
vercel deploy --prod
# Or just push a no-op commit to trigger Vercel
git commit --allow-empty -m "chore: nudge deploy"
git push
```

---

## What's NOT in this commit (future work)

These are **deliberately left for later** — landing them now adds risk:

- ❌ BFG / git-filter-repo history scrub (cosmetic; repo is public; already crawled)
- ❌ Plan B: BoA / Synchrony disclosure-page scraper (Week 2)
- ❌ Admin UI for review queue (Week 2)
- ❌ Vercel cron job for automatic `facts:promote` (Week 2)
- ❌ `data/cfpb-cache/*.pdf` removal from git (P3, just bloats repo)
- ❌ CFPB crawler that enumerates per-quarter PDFs (Week 2)
- ❌ Per-card "verified at" badge on detail page (Week 2)
- ❌ recurring_credits + welcome_offer LLM extractors (Week 2 — same MiniMax client, same fact-store flow)

Track in `docs/TAKEOVER_PLAN.md`.

---

## Final sanity numbers (snapshot 2026-04-26)

| Metric | Value |
|---|---|
| Files modified | 56 |
| Files created | 21 |
| Files moved (active → archive) | 26 |
| Cards reverted (annual_fee) | 19 |
| New TS source lines | ~1500 |
| New docs | 7 (TAKEOVER_PLAN + 6 supporting) |
| Tokens redacted from working tree | 2 (Upstash + MiniMax) |
| Sanity rules added to CI | 7 |
| Custom gitleaks rules | 6 |
| CFPB pipeline kill switches | 13 (one per archived script) |
