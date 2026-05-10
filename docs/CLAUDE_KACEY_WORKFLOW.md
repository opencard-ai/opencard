# Claude × Kacey Working Agreement

> Status: PROPOSAL (not yet adopted) — Kacey reviews & edits before merging.
> Author: Claude (2026-05-10), drafted after observing 2026-05-09 session.

## Why this exists

Kacey runs parallel work in this repo (manual data cleanup, methodology
drafts, POC artifacts) while Claude does scoped code work in the same
working tree. The 2026-05-09 session ended with 17 unstaged Kacey-owned
files alongside Claude's commits — clean separation, but only because
Claude knew not to touch them. This doc makes that knowledge explicit so
neither side has to re-derive it next session.

---

## 1. Lane separation

| Lane | Default driver | Notes |
|---|---|---|
| Pipeline code (`scripts/auto-update-cards/`, `scripts/test-*.ts`) | Claude | Direct commit OK within stated scope |
| Frontend / app code (`src/`, `lib/`, `app/`) | Claude | Direct commit OK |
| Catalog data (`data/cards/*.json`) | Kacey | Hand-tuned ground truth. Claude reads but does not edit unless Kacey explicitly says so |
| Phase 2 POC artifacts (`data/adaptor/runs/`) | Kacey | POC territory, methodology still settling. Claude does not touch |
| Methodology / design drafts (`docs/CARD_ADAPTOR_METHODOLOGY.md`, `docs/card-adaptor-gstack-workflow.md`, `data/amex-scrapling-poc-report.md`, `CARD_BUILDER_SOP.md`) | Kacey | Claude reads, never edits |
| Spec / backlog docs from Claude work (`docs/CARD_ADAPTOR_PHASE_2_SPEC.md`, `docs/CARD_SOURCE_SWAP_BACKLOG.md`, this doc) | Claude proposes → Kacey approves | Concrete recommendations; Kacey decides whether to merge |
| Cron output (`data/auto-update-cards/runs/`) | Pipeline | Auto-generated, neither human edits |
| `package.json` deps + lockfile | Either | Coordinate via commit message; do not silently bump majors |
| GitHub Actions workflows (`.github/workflows/`) | Claude proposes → Kacey approves | Cron / CI behavior is high blast radius |

---

## 2. Three operating modes Claude uses

| Mode | When | Behavior | Example |
|---|---|---|---|
| **Execute** | Scope is clear, files are in Claude's lane, low blast radius | Make the change, run tests, commit; push only on Kacey's OK | "wire 3 blocking gates into extract.ts" |
| **Propose** | Cross-lane, architectural, or irreversible | Write a doc / chat message with options + recommendation; Kacey decides; Kacey executes | This doc; the source-swap backlog updates |
| **Research** | Open-ended question, web/discovery work | Use subagent + WebFetch / WebSearch; return a structured punch list; Kacey acts on it | The 11-card source URL research |

When Claude is unsure which mode applies, it should ask before starting.

---

## 3. Handoff mechanism (async — Claude session ↔ Kacey solo work)

### End of every Claude session
Claude writes `~/Documents/opencard-session-YYYY-MM-DD-handoff.md` with:
- HEAD SHA + branch + push status
- Commits made this session, grouped logically
- Files touched in Kacey's lane (should be 0 unless explicit ask)
- Pending TODOs handed forward
- 1-line resume instruction (`cd <repo> && claude --continue`)

### Start of every Claude session
Claude reads the most recent handoff doc + runs `git status` to learn what
Kacey changed solo. No work begins until the lane state is understood.

### Kacey's solo edits between sessions
No handoff needed. Claude treats `data/cards/*.json` and methodology docs
as source of truth on read.

---

## 4. Decision boundaries

| Decision type | Authority |
|---|---|
| Code changes within stated scope, in Claude's lane | Claude executes |
| New code files / new modules | Claude proposes diff in commit body, Kacey reviews via PR or post-hoc |
| Architecture / new pipelines / new product surfaces | Kacey decides — Claude surfaces trade-offs without pre-deciding |
| Catalog data values | Kacey decides absolutely |
| Adding npm dependencies | Claude proposes (incl. why), Kacey OKs |
| External / irreversible actions: prod env, force push, history rewrite, DB migration, deletion | Kacey approves explicitly per-action — authorization for one action does NOT carry over |
| Cron behavior / schedule changes | Kacey approves before merge |
| Closing or merging GitHub PRs | Kacey |

---

## 5. Conflict-avoidance rules (concrete)

Before any commit, Claude:
1. Runs `git status --short` and verbally confirms which files will be staged.
2. Stages files explicitly by name (`git add path/to/file`) — never `git add -A` or `git add .`.
3. Skips any file that's in Kacey's lane unless Kacey OK'd it this session.

If Claude needs to edit a Kacey-owned file as a side effect of a code task,
Claude pauses and proposes the diff in chat first.

If Kacey's unstaged work overlaps with Claude's intended change, Claude
asks before touching.

---

## 6. Push & destructive-op policy

| Op | Default |
|---|---|
| Local commit on `main` | OK after green tests |
| Push to `origin/main` | Requires Kacey's OK per push (memory: `feedback_risky_actions.md`) |
| Force push | Requires explicit Kacey OK; never to `main` without verbal "yes force push" |
| Branch deletion (incl. local) | Requires Kacey OK |
| `git reset --hard`, `git rebase`, `git filter-repo` | Kacey runs these, not Claude — unless explicitly delegated |
| Reverting a Kacey commit | Always ask first |

---

## 7. Things Claude must always do

- State scope before starting (1 sentence — "I'll do A and B").
- Use TodoWrite for any task with ≥ 3 steps.
- Write tests for new logic when feasible (cheap `scripts/test-*.ts` ad-hoc tests, following the `test-reminder-logic.ts` pattern).
- Run typecheck + lint before committing (pre-existing warnings are OK; new ones are not).
- Stage files by name only.
- Read prior handoff doc on session start.
- Write a handoff doc on session end.

## 8. Things Claude must never do

- Push without explicit OK.
- Touch unstaged Kacey work without permission.
- Mock LLM responses or DB in tests where real calls would catch divergence (memory: `feedback_*`).
- Add backwards-compat hacks for hypothetical future requirements.
- Run destructive git ops as a shortcut to fix unexpected state.
- Generate URLs without high confidence — always verify with WebFetch / cross-reference.
- Pre-decide architecture or data — surface options and let Kacey choose.

---

## 9. When this doc itself changes

- Claude proposes edits in chat; Kacey applies them. (This doc is in Kacey's design-doc lane semantically, even though Claude drafted v1.)
- After 2-3 sessions of real use, do a retro: which rules helped, which never came up, which got broken.

---

## 10. Open questions for Kacey

These are points the v1 draft is taking a position on — Kacey to confirm or
override:

1. **Push policy**: this doc says "Kacey approves per push." Is that still
   right after this proposal lands, or do you want a blanket "auto-push if
   tests pass on main" once trust is built? (Memory says ask per push.)
2. **PR-vs-direct-to-main**: Claude has been committing straight to `main`
   on this repo. Want to keep that, or move to a PR-per-feature model?
3. **`data/cards/*.json` ownership**: should Claude ever edit these
   directly (e.g. mechanical fixes from a backlog doc), or always propose
   the diff and let Kacey apply? Current default = always propose.
4. **Methodology docs**: Claude has been reading `CARD_ADAPTOR_METHODOLOGY.md`
   and `card-adaptor-gstack-workflow.md` to inform code work. Want them
   shared into Claude's working set as authoritative, or treat them as WIP
   drafts that may shift?

When you've decided, edit this doc with your answers and commit.
