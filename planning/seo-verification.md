# SEO verification — 2026-09-13

Owner: Kacey (main agent). Status: prepared; live inspection and historical attribution pending.
Priority: P1. Dependencies: authorized GSC property access and historical page-level exports / deployed policy evidence.
Acceptance: evidence saved for each target; comparable fixed-cohort pre/post results with explicit coverage and uncertainty; no automatic index-policy change.

## Three retained-core inspection targets

These English card URLs are present in the current curated indexable-card registry and sitemap. “Retained” here describes current intended policy, not verified Google indexing.

1. https://opencardai.com/en/cards/chase-sapphire-reserve
2. https://opencardai.com/en/cards/amex-platinum
3. https://opencardai.com/en/cards/capital-one-venture-x

For each URL, record the inspection timestamp, property, coverage state/verdict, last crawl time, crawl result, robots permission, indexing permission, user-declared canonical and Google-selected canonical. Also capture the served HTTP status, canonical and robots metadata separately; a live page test does not prove indexed status. Retain the raw inspection artifact and a concise interpretation. Do not request indexing or change noindex merely because traffic is low.

## August 28 policy-change attribution protocol

1. Identify the deployed commit/time of the August 28 policy reduction. Reconstruct the before/after sitemap and card/guide robots policies from those revisions; do not substitute today's registry for historical policy. Confirm the reported 50-to-14 card reduction against revisions.
2. Build a frozen union of known URLs and assign mutually exclusive historical groups: retained indexable, intentionally removed/noindex, newly indexable, and unknown. Include English cards, translated cards, translated guides, and static pages as applicable. Preserve locale and page-type dimensions. Record the policy evidence and effective date per URL.
3. Export finalized GSC page-level metrics for matched seven-day windows: August 21–27 (before) and September 4–10 (after), excluding August 28–September 3 as an initial crawl-transition week. Follow with September 11–17 only once finalized. Keep property, search type, country/device filters and extraction method identical; paginate as supported and record row limits, omitted data and extraction time.
4. Apply the same fixed URL groups to both windows, including URLs with no returned rows. Treat missing rows as no reported metrics, not proof of zero real traffic or a newly published page. Sum clicks/impressions; recompute CTR from totals and impression-weight average position. Report each cohort's absolute and percentage changes and its contribution to the observed sitewide impression difference.
5. Inspect the three retained targets above and representative excluded URLs. Compare crawl dates against rollout. Drill into fixed page/query pairs for retained pages before interpreting position improvements; disappearing low-ranked queries can improve an aggregate without a real ranking gain.
6. Reconcile page-level totals against sitewide totals. Explain privacy filtering, aggregation differences and any row caps. Separate concurrent content/offer changes, demand/seasonality and indexing lag. A before/after decomposition is descriptive, not causal proof that noindex caused the entire decline.

## Operational reporting limitations

The new daily cohort baseline is captured on its first successful live run, stored in `.gsc-cohort-baseline.json`, and must be preserved. It cannot reconstruct August 28. “New” means currently indexable but absent from that snapshot, not newly published or newly seen in GSC. Current policy is applied consistently to both comparison periods; it is not a historical index-state audit.

Daily reporting retrieves up to 25,000 page rows per period and labels incomplete-coverage risks. Its query/page opportunity scan retrieves 1,000 rows and is not exhaustive. It excludes known intentional noindex and unknown-policy URLs from opportunities. Neither sitemap inclusion nor GSC sitemap indexed counts prove actual Google indexing.

## Progress log

- 2026-09-13: Prepared target list and attribution procedure; no live GSC calls, inspection results, historical exports or policy changes performed in this task.
