# Delivery and review

Extracted from `docs/CLAUDE_KACEY_WORKFLOW.md` (sections 4–8) and the
validation/security guidance in `docs/COMMIT_RUNBOOK.md` and
`docs/SECURITY_NOTICE.md`. The workflow is labeled a proposal; retain its
nonconflicting safeguards. `AGENTS.md` supersedes historical examples allowing
main pushes, force pushes, broad staging, or agent database writes.

1. Inspect `git status --short` before work and before every commit. State scope
   and identify the exact files to stage; never include unrelated work.
2. Work on a branch from `origin/main`. Every change requires a PR against main;
   never push to main or force push. Push only with task/user authorization.
3. Configure Git author and email as `OpenCard <opencard@opencardai.com>`.
   Use `gh auth setup-git` for GitHub authentication; never print credentials.
4. Run `npm run validate` and relevant tests before committing. For new logic,
   write meaningful tests when feasible (existing `scripts/test-*.ts` patterns).
   For code changes, also run typecheck and lint; pre-existing warnings are OK,
   new warnings are not. Do not run `npm run lint:tags` in agent workflows.
5. Stage explicit paths (`git add path/to/file`), never `git add .` or `git add -A`.
   Review the staged diff for scope and secrets before committing.
6. Open a PR, report validation results and any pre-existing failures, and wait
   for CI. Do not hide failures or change unrelated application code to fix them.
7. News-only PRs may auto-merge after checks pass. All other PRs need KC's
   approval. Cron/schedule and GitHub Actions changes need Kacey's review before
   merge. Closing PRs is Kacey's decision. A task forbidding merge always wins.
8. When authorized to merge, obtain the reviewed PR head SHA and use exactly:
   `gh pr merge N --squash --match-head-commit <sha> --author-email opencard@opencardai.com`.
   Verify the merged receipt; do not assume a merge request completed.

Keep secrets out of chat, commits, PRs, and logs. Never print key files or
recover leaked credentials from history. Use approved environment/secret
storage, not committed values. Read `docs/SECURITY_NOTICE.md` when handling an
incident and `docs/SECURITY_SETUP.md` when configuring secret scanning; historical
credential examples and history-scrub commands are not agent authorization.

Production environment changes, migrations, deletions, and other irreversible
external actions need explicit per-action approval. Branch deletion requires
Kacey's OK. Kacey runs `git reset --hard`, `git rebase`, and `git filter-repo`
unless explicitly delegated. Never use destructive Git operations as a shortcut
for unexpected state; ask before reverting a Kacey commit. Force push remains
forbidden even where older docs describe approval exceptions.
