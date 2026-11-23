# Scope, ownership, and handoffs

Extracted from `docs/CLAUDE_KACEY_WORKFLOW.md`, sections 1–9. That document
remains an unchanged proposal and historical rationale; current task directions
and `AGENTS.md` take precedence over its older commit/push permissions.

At session start, inspect Git status and understand existing lane state before
work. State the intended scope in one sentence. Track tasks with three or more
steps in TodoWrite when available, or an equivalent task list.

| Files / decisions | Authority and behavior |
| --- | --- |
| Pipeline code (`scripts/auto-update-cards/`, `scripts/test-*.ts`), frontend (`src/`, `lib/`, `app/`) | Agent executes within stated scope, with tests and PR review. |
| `data/cards/*.json` | Kacey owns curated values; read, but edit only with explicit authorization. |
| `data/adaptor/runs/` | Kacey's Phase 2 POC territory; do not touch without authorization. |
| `docs/CARD_ADAPTOR_METHODOLOGY.md`, `docs/card-adaptor-gstack-workflow.md`, `data/amex-scrapling-poc-report.md`, `CARD_BUILDER_SOP.md` | Kacey's methodology/design drafts; read, do not edit without explicit direction. |
| `docs/CARD_ADAPTOR_PHASE_2_SPEC.md`, `docs/CARD_SOURCE_SWAP_BACKLOG.md` | Agent proposes; Kacey decides whether to merge. |
| `docs/CLAUDE_KACEY_WORKFLOW.md` | Propose edits in chat; Kacey applies them unless explicitly delegated. |
| `data/auto-update-cards/runs/` | Generated pipeline output; do not hand-edit. |
| `package.json` and lockfile | Coordinate changes in commit messages; no silent major bumps. Adding dependencies needs Kacey's OK and a rationale. |
| `.github/workflows/`, cron schedules | Agent proposes; Kacey approves before merge. |
| New code files/modules | Explain the proposed diff in the commit body for Kacey's review. |
| Architecture, pipelines, product surfaces, catalog values | Surface options and trade-offs; Kacey decides. |

Execute when scope is clear and within the agent's lane. Propose options and a
recommendation for cross-lane, architectural, or irreversible work; Kacey decides
and executes unless delegated. Ask before starting when the mode is unclear.
Research should return a structured, verified punch list; the original Claude
workflow calls for a research subagent and WebFetch/WebSearch when applicable.

Before touching a Kacey-owned file as a side effect, propose the diff and obtain
permission. Never touch overlapping unstaged Kacey work without permission.
Read Kacey's solo catalog/methodology edits as the current curated baseline.
Do not pre-decide architecture or data. Do not add compatibility hacks for
hypothetical future requirements. Do not mock LLM responses or databases where
real calls would catch divergence; never use that advice to bypass the Upstash
write prohibition. Verify URLs by fetching or cross-referencing; do not invent them.

Claude-specific session handoff (from workflow section 3):
- Read the latest `~/Documents/opencard-session-YYYY-MM-DD-handoff.md` at startup
  along with Git status; understand Kacey's intervening work before editing.
- At session end, write that dated handoff with HEAD SHA, branch, push status,
  commits grouped logically, Kacey-lane files touched (normally zero), pending
  TODOs, and a one-line resume command (`cd <repo> && claude --continue`).
- Honor task filesystem limits if that destination is unavailable; report the
  limitation and provide the handoff at an authorized destination.
