# Security Setup Guide

> Living document — keep updated as we add more guards.

## Threat we're defending against

> "Future me / future agent / future contributor accidentally commits a token,
> the repo is public, and 60 seconds later it's in someone's training data."

Defense in depth, in order of when they fire:

```
[ Local pre-commit ]  ──blocks──▶  [ GitHub Actions on PR ]  ──blocks──▶  [ Daily scheduled scan ]
        ↑                                    ↑                                       ↑
   gitleaks +                          gitleaks-action                       full git history scan
   secret detection                    on every push/PR                       (scheduled cron)
```

If any layer catches a secret, the commit/PR is rejected and we rotate.

---

## One-time setup (per developer / agent)

```bash
# 1. Install pre-commit (Python tool that runs all hooks)
brew install pre-commit
# or:  pipx install pre-commit
# or:  pip install pre-commit

# 2. Install gitleaks (the actual secret scanner)
brew install gitleaks

# 3. Install the hooks into your local .git/hooks/
cd /path/to/opencard
pre-commit install

# 4. (Optional) run all hooks against existing files to catch anything stale
pre-commit run --all-files
```

That's it. From now on every `git commit` runs gitleaks + JSON validation +
card data validation before completing.

## Daily-use cheatsheet

```bash
# Ran into a hook failure? See what gitleaks found:
gitleaks protect --staged --config .gitleaks.toml --verbose

# Scan the entire repo + history (slower):
gitleaks detect --config .gitleaks.toml --redact

# Hook flagged something you're sure is a false positive?
# 1. Add a regex/path/stopword to .gitleaks.toml [allowlist]
# 2. Commit the .gitleaks.toml change first, then your real change

# Bypass hooks for ONE commit (only when really necessary; logged):
git commit --no-verify -m "..."
# Server-side scan still catches it. Don't bypass to push secrets.

# Update hook versions periodically:
pre-commit autoupdate
git add .pre-commit-config.yaml
git commit -m "chore: bump pre-commit hooks"
```

## What's in `.gitleaks.toml`

Custom rules for tokens we've leaked before, so future leaks of the
same shape get caught even if they have different values:

| Rule ID | Pattern | Why it exists |
|---|---|---|
| `upstash-rest-token` | `g[Qg]AAAAAA...` (50+ chars) | Upstash leaked in `vercel.json` 2026-04-22 |
| `upstash-redis-url-with-token` | `rediss://default:TOKEN@*.upstash.io` | Same root cause, different format |
| `minimax-api-key` | `sk-(cp\|api)-...` | MiniMax leaked in `sync-news.mjs` + `unified-scraper.ts` |
| `anthropic-api-key` | `sk-ant-...` | Future-proof for when we use Claude |
| `agentmail-api-key` | `am_(us\|eu\|test\|live)_...` | We use AgentMail, key looks like this |
| `google-oauth-client-secret` | `GOCSPX-...` | We have GSC OAuth |
| (default ruleset) | AWS, GCP, Stripe, GitHub, etc. | gitleaks built-ins |

## Allowlist — false positives we suppress

| What | Why |
|---|---|
| `package-lock.json`, `pnpm-lock.yaml` | Full of integrity hashes that look like base64 secrets |
| `.next/`, `node_modules/`, `build/`, `dist/` | Build outputs — not source |
| `data/cfpb-cache/*.pdf` | Public CFPB documents, gitignored anyway |
| `scripts/pipelines/cfpb/archive/` | Stubbed-out scripts, code preserved as comments for git-blame |
| `sha256-...`, SRI hashes | Subresource Integrity hashes |
| `prj_*`, `team_*` | Vercel internal IDs, public identifiers |
| 40-char hex | Git SHAs |
| `gQAAAAAA...[REDACTED`, `sk-cp-mFUA9...[REDACTED` | docs/SECURITY_NOTICE.md references already-redacted strings |

## Server-side gate (`.github/workflows/gitleaks.yml`)

Three triggers:
- **Push to main** — final gate before deploy
- **Pull request** — early signal during code review
- **Daily 12:00 UTC** — full-history scan, catches secrets that slipped past
  pre-commit (e.g. someone used `--no-verify`)

Workflow uses `gitleaks/gitleaks-action@v2`. No license needed for OSS use; if
opencard moves to paid, set `GITLEAKS_LICENSE` repo secret.

## What this DOESN'T defend against

- **Secret in a binary** (image EXIF, PDF metadata, .key files) — gitleaks
  scans text only. Images/PDFs are checked by `check-added-large-files` for
  size but not contents.
- **Secret in commit message** — gitleaks only scans diff content.
- **Secret in branch name or PR title** — out of scope.
- **Token leaked through observability** (Vercel logs, Upstash dashboard,
  Sentry, etc.) — those need separate redaction at the logging layer.

## Operational checklist when a leak is detected

```
1. ROTATE THE TOKEN (immediately, before anything else)
   - Provider's console → regenerate
   - Update Vercel env vars + .env.local
   - Verify production still works

2. Scrub the file in working tree (replace with process.env.X)

3. Document the incident in docs/SECURITY_NOTICE.md
   - Which token, which file, which commits, severity
   - Status of rotation (pending vs done)

4. Decide on history scrub
   - Public repo + leak ≥ 1 hour: rotate is mandatory; history scrub is
     cosmetic (it's already crawled). Skip unless it's a high-severity creds.
   - Private repo + small audience: BFG / git-filter-repo + force push, then
     ask collaborators to re-clone.

5. Verify gitleaks rule covers the leaked pattern
   - If not, add a custom rule to .gitleaks.toml so the same token shape gets
     caught next time.

6. Run `gitleaks detect --config .gitleaks.toml --redact` to confirm the
   working tree is clean.
```

## Related docs

- [docs/SECURITY_NOTICE.md](./SECURITY_NOTICE.md) — tracking the 2026-04-25 incident
- [docs/PUBLIC_REPO_LEAK_AUDIT.md](./PUBLIC_REPO_LEAK_AUDIT.md) — full audit of what's been exposed
- [docs/TAKEOVER_PLAN.md](./TAKEOVER_PLAN.md) — overall roadmap
