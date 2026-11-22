# Architecture v0.2 §9.5 amendment: terminal vote outcomes

Date: 2026-11-21. Scope: Verify-to-Access Phase 1, PR #136.
This formally amends the frozen MVP §9.5 `votes.outcome` list. No other frozen requirement changes. The working `architecture.md` copy carries the same amendment.

The allowed values are `agreed`, `disagreed`, `gold_pass`, `gold_fail`, `unable`, `pending`, `disputed`, and `expired`.

Phase 1 amendment (2026-11-21, PR #136): `disputed` and `expired` are terminal vote outcomes. `disputed` closes pending votes when consensus cannot resolve a task; `expired` closes pending votes when an overdue open task or malformed quorum expires. Both reverse pending rewards without a reputation penalty, so terminal work does not remain `pending`. Migration 0005 also repairs historical pending votes on disputed tasks. This amendment changes only the §9.5 outcome list.
