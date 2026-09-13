# Offer watcher repair — 2026-09-13

Runtime state checked: external watcher and adaptor watcher are DISABLED. Preserve disabled state. This is not a new publication schedule.

## Review protocol
1. Run `npx tsx scripts/offer-watch/review.ts` for real config coverage + committed-card baseline. Never infer coverage from applied artifacts or prior chat. Working-tree configs include uncommitted work; committed HEAD is not proof of deployed version.
2. Collect evidence only for actual candidate changes. Official page content must support the precise value; the `official` boolean is a reviewer's assertion, not automated domain verification. Unsupported, stale, targeted, conflicting or unknown fields are verification requests, not patch approvals.
3. Save candidate array to a dated task artifact. Shape: `{card_id, fields: {"welcome_offer.bonus_points": 100000}, evidence: {url, checked_at, official, audience, conflicts}}`. Audience must be explicit; do not relabel targeted as public. Evidence dates reflect actual fetch, not article publication.
4. Run review with candidate artifact and optional previous report path. Store output as a new report. Include old/new terms, evidence URL, audience and checked date. Only `notify:true` entries are notification candidates; unchanged covered cards generate no request. Rechecks with a new timestamp alone do not notify again.
5. Split actionable differences, fetch failures, verification-needed and stale observations. Do not run full run-all for a small focused delta. No patch/push/deploy in a watcher.
6. No new differences or changed blockers: NO_REPLY. One summary, no daily catalog dump.

Acceptance: known-covered cards never proposed missing; current Chase 100K compared to current baseline, not hardcoded historical 150K; tests cover unchanged, targeted, conflicts, stale evidence, unknown fields and stable fingerprints.
