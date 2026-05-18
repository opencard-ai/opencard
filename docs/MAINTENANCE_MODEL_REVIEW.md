# OpenCard Catalog Maintenance — Step-Back Review

> Status: DRAFT — for Kacey to think through, not yet adopted
> Trigger: Kacey 2026-05-10 PM, "我其實已經不知道怎樣對維護核心資料庫最好，是否要退一步出來看？"
> Author: Claude, drafted from outside-perspective observation of 2026-04-26 → 2026-05-10 sessions

---

## Why this doc exists

After ~2 weeks of session work on the cron auto-updater (gates, fallback chains,
retries, source swaps, Phase 2 spec, methodology drafts, POC artifacts), Kacey
asked the meta-question: is this direction even right? This doc captures what
the work pattern looks like from outside, so Kacey can decide whether to keep
shipping more pipeline features or change the approach entirely.

This is intentionally NOT a recommendation to build something. It's a frame for
re-deciding before more code is written.

---

## 1. Four patterns observed (from session history)

| Pattern | Evidence | Implication |
|---|---|---|
| **Design docs are growing faster than working tools** | 4 in-flight design drafts (CARD_ADAPTOR_METHODOLOGY, card-adaptor-gstack-workflow, CARD_ADAPTOR_PHASE_2_SPEC, CARD_SOURCE_SWAP_BACKLOG) + 3 parallel mechanisms doing similar things (cron auto-updater, Scrapling POC, hand-run amex-gold Phase 2 POC) | Tooling proliferation is outpacing actual data-quality improvement |
| **Defenses are stacking without measurement** | This session: 3 blocking gates + 3xx headCheck + 22 unit tests. Prior sessions: retry @24K, Playwright fallback, is_elevated detector, FNA detector, jitter measurement, cards-loader filter… BUT no visible "live cron actually fails X% of the time on Y class of card" baseline being tracked over time | Optimizing for predicted failure modes, not observed ones |
| **Data quality ≠ pipeline quality** | Kacey's manual amex backfill: 17 cards, 100% accurate. Cron 2026-05-09 dry-run: 26 PRs → ~9-10 real updates, 3 regressions, 3 cosmetic = real hit rate ~35% | The cron is good at "finding changes" but Kacey's hands are doing "data quality" |
| **Distance to value** | Same hour spent: writing Phase 2 spec → potential value if 50 cards × 52 weeks all work out. Doing a Scrapling-assisted manual sweep → 17 cards correct today | Manual currently has shorter distance-to-value because the cron isn't proven yet |

---

## 2. Three root questions to ask before more architecture

| Q | Why this is root |
|---|---|
| **2.1 Who actually consumes the catalog, and which fields matter?** | Recommendation logic primarily reads `annual_fee` + `welcome_offer` + `earning_rates`. The amex-gold POC flagged stale `lounge_access` and conflicting `fhr_thc` fields — but how much do those actually matter to OpenCard's users today? If they don't surface in any UI / API consumer that users care about, "catalog precision on those fields" is solving a non-problem. |
| **2.2 What's the real maintenance hour-budget?** | If Kacey is willing to spend 2 hours/week reviewing changes manually → no automated PR mode is needed at all. If Kacey wants 0 hours/week → only then does full automation become the right target. The answer changes which maintenance model fits. |
| **2.3 What is the cron actually for?** | "Monitor for changes" / "open PRs" / "keep data fresh" are three different jobs. The current cron does all three; maybe it should only do one. |

---

## 3. Four maintenance models (not just cron-on/cron-off)

| Model | Description | Cost | Fit to current state |
|---|---|---|---|
| **A. Cron-as-monitor only** | Cron detects changes, emails / Slacks Kacey a digest. Never opens a PR. Kacey hand-edits when the digest flags something | Zero regression risk; Kacey's manual labor scales linearly with card count | Removes the 35% hit-rate problem entirely (no PRs = no bad PRs). Simple. |
| **B. Cron-as-PR-generator (current)** | Cron opens 26 PRs / week; Kacey reviews + merges / closes | Per-week review time × 50 cards. ~35% real-update hit rate today | What's running. Defenses (gates) are getting better but not great |
| **C. Cron-as-research-pipeline (= Phase 2 spec)** | Cron writes artifacts to `data/adaptor/runs/`; Kacey reads weekly review-diff.md digest; manually applies relevant ones | Building cost ~half-day to several days depending on L1/L2/L3 ambition (see CARD_ADAPTOR_PHASE_2_SPEC.md). Review burden moves to a weekly batch | Kacey's amex-gold POC already prototyped this manually. Methodology + Phase 2 spec point here |
| **D. Manual-first, cron-as-spotter** | Source of truth: Kacey + Scrapling-assisted sweeps + hand edits. Cron only fires to surface unexpected changes between manual cycles | Lowest tooling cost. Highest dependency on Kacey's bandwidth | **What Kacey has actually been doing this past 2 weeks** (17 amex hand-fixes + Scrapling POC + amex-gold artifact). The work that produced real catalog improvements |

---

## 4. The most important observation

Two parallel tracks are running:

- **Track 1 (claude-driven)**: gates, fallback chains, Phase 2 spec, CLI integration analysis. **Not yet visibly improving catalog quality.**
- **Track 2 (Kacey-driven)**: hand-edits to 17 amex cards, Scrapling POC, amex-gold artifact-first POC. **Measurably improving catalog quality.**

The natural question is: should Track 1 stop or keep going?

It's not obvious. Track 2 doesn't scale beyond Kacey's hours; Track 1 might
eventually offload work — but only if it converges on something Kacey actually
trusts. The risk is sunk-cost: if Track 1 keeps adding capability without
proving value, the maintenance burden is on Kacey to keep the half-built
system working.

---

## 5. Suggested next step (low-cost)

Pause new pipeline architecture work. Do these in order:

1. **Let 5/11 12:00 UTC cron fire as-is** — gates + 11-card source swap are
   already deployed. This is the first cron that has a real chance of being
   defensible.

2. **After the 5/11 run, measure**:
   - Of the PRs opened, how many were real catalog improvements?
   - How many were regressions the gates didn't catch?
   - How many were cosmetic (point_program rename etc)?
   - How long did Kacey spend reviewing them?
   - **Write down the numbers.** This is the missing baseline.

3. **Then** re-decide between models A/B/C/D using the numbers as evidence.
   Possible outcomes:
   - "35% hit rate is fine, gates caught the bad ones" → keep B, add small improvements
   - "Reviewing is taking 3 hrs/week, getting tedious" → move to A or C
   - "I keep doing it manually anyway because cron is wrong half the time" → D, and rip out the cron's apply mode

4. **Open question for Kacey to think about meanwhile**:
   - Is the catalog's real product use limited to a handful of fields? (Q2.1)
   - What's the actual hour-budget? (Q2.2)
   - Are 4 design docs in flight because the design isn't decided, or because writing docs feels like progress?

---

## 6. What this doc is NOT proposing

- ❌ Build Phase 2 CLI (deferred)
- ❌ Add more blocking gates (deferred)
- ❌ Multi-source / cross-source check (deferred)
- ❌ Existing-data sanity check (deferred)
- ❌ Anything else marked "Recommended next step" in prior session handoffs
- ❌ Switching to model D right now without data

The recommendation is one bit: **measure first, decide second**. Everything
that's already shipped (gates, source swaps, headCheck fix, workflow proposal)
stays in. New work pauses until 5/11 numbers are in.

---

## 7. Questions for Kacey to come back with

When you've sat with this for a bit and the 5/11 cron has fired, the answers
to these unblock everything else:

1. **Catalog consumers**: which fields actually drive user-visible behavior in
   OpenCard? (recommendation logic / reminder UI / `/api/cards` consumers / My
   Cards)

2. **Hour budget**: how many hrs/week are you willing to spend on catalog
   maintenance long-term?

3. **Honest verdict on Track 1**: which sessions of cron-pipeline work in the
   last 2 weeks improved your life vs. felt like wheel-spinning?

4. **Choose A/B/C/D** with the 5/11 numbers in hand. The other 3 models can
   be archived in `docs/`-history if it's clear which one fits.

5. **Methodology drafts**: do `CARD_ADAPTOR_METHODOLOGY.md` and
   `card-adaptor-gstack-workflow.md` still describe what you actually want to
   build, or have they drifted? If drifted: revise or shelve.

When you've answered these, we can do a focused 1-session sprint on whichever
direction wins. Don't pre-commit by writing more code.
