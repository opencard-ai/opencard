<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OpenCard agent rules

These rules apply throughout this repo. Keep every `AGENTS.md` and `CLAUDE.md`
under 200 lines; put procedures in `docs/agents/` and link them below.
Current task instructions override historical examples in older runbooks.

- Never push to `main`. Every change goes through a PR and `npm run validate`.
- Never force push. Use commit author/email `OpenCard <opencard@opencardai.com>`.
- Keep secrets out of chat, commits, and PRs; never print key files.
- News-only PRs may auto-merge when checks pass; every other PR needs KC's
  approval. Merge only with the reviewed head pinned:
  `gh pr merge N --squash --match-head-commit <sha> --author-email opencard@opencardai.com`.
  A task that says not to merge overrides merge permission, including news.
- Issuer official sources are canonical for card terms. Third-party sources
  support discovery and corroboration; unresolved conflicts require review.
- Never treat Upstash as the source of truth or write to it from agent workflows.
- Author / site credit is **Ko-Chen Cheng** (English name; not pinyin).
- Respect Kacey's file ownership and unstaged work; stage files by name only.
- Do not run `npm run lint:tags` from agent workflows.

read `docs/agents/delivery.md` when preparing, validating, pushing, or merging a PR.
read `docs/agents/workflow.md` when starting work, crossing ownership lanes, or handing off.
read `docs/agents/data-sources.md` when researching, scraping, or proposing card-data changes.
