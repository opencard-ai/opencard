# OpenCard Planning v1 — AdSense Editorial + Artifact-first Pipeline

Date: 2026-05-27

## 1. AdSense Editorial Content Plan

Goal: add substantial, evergreen, trust-building content to OpenCard without becoming another thin credit-card review farm.

### Recommended first 5 articles

#### 1. Beat the Clock: A Smart Guide to Credit Card Benefit Expirations

**Why first:** Most directly tied to OpenCard's product wedge: benefit tracking, My Cards, recurring credits, expiration reminders.

**Reader intent:** “I have cards with credits/perks and I don't want to miss them.”

**Outline:**
- Why benefits expire: calendar year vs cardmember year vs fixed certificate dates
- Common expiring benefits: travel credits, dining credits, streaming credits, lounge passes, hotel free nights
- Tracking strategies: spreadsheet/calendar/manual vs automated tracker
- What to prioritize before expiration
- How OpenCard My Cards helps track benefit timelines

**FAQs:**
- Can I extend an expiring benefit?
- What happens if points or certificates expire?
- Which benefits should I use first?

**CTA:** Add your cards to **My Cards** and track benefit expirations in one place.

**YMYL caution:** Terms vary by issuer/card; users should verify official benefit terms.

---

#### 2. Unlocking the Value: Is Your Credit Card's Annual Fee Worth It?

**Why second:** Strong evergreen topic, high search intent, connects naturally to benefit valuation.

**Reader intent:** “Is this $95/$250/$695 annual fee actually worth paying?”

**Outline:**
- What annual fees pay for
- Hard-value benefits: statement credits, free nights, lounge access, insurance
- Soft benefits: convenience, protections, status, optionality
- Break-even framework: used value vs theoretical value
- Downgrade/cancel/retention offer decision tree
- Using OpenCard to audit annual-fee cards

**FAQs:**
- Can I get an annual fee waived?
- Should I cancel before or after the fee posts?
- Are no-fee cards better for beginners?

**CTA:** Track used vs unused benefits in **My Cards** before your next annual fee posts.

**YMYL caution:** Avoid telling readers to cancel/open cards as personal financial advice; frame as decision framework.

---

#### 3. The Ultimate Onboarding Checklist for Your New Card's Benefits

**Why third:** Very actionable, product-led, and likely converts users into adding cards.

**Reader intent:** “I just got approved — what should I activate now?”

**Outline:**
- Day 1: activate card, online account, autopay, digital wallet
- Week 1: enroll in benefits like lounge memberships, airline credits, hotel status
- Month 1: track welcome bonus spending safely
- Set-and-forget benefits: cell phone protection, purchase protection, warranty
- Add renewal/expiration reminders
- Add the new card to OpenCard

**FAQs:**
- Do I need to enroll in every benefit?
- How do I track welcome bonus progress?
- What benefits require activation?

**CTA:** Add your new card to **My Cards** and use it as a benefits onboarding checklist.

**YMYL caution:** Warn not to overspend just to meet a welcome bonus.

---

#### 4. Beyond the Numbers: Understanding the True Value of Credit Card Points

**Why fourth:** Foundational education; supports future card pages and benefit calculators.

**Reader intent:** “What are my points actually worth?”

**Outline:**
- Why points are not equal across programs
- Cashback vs portal redemptions vs transfer partners
- Fixed vs dynamic award pricing
- Opportunity cost and convenience value
- Why point values change over time
- Using a personal valuation, not just blog averages

**FAQs:**
- Is there a universal point value?
- Is transferring points always better?
- Should I hoard points?

**CTA:** Track your rewards programs and estimated value in **My Cards**.

**YMYL caution:** Disclose point values are estimates and programs can devalue.

---

#### 5. Optimize Your Wallet: Avoiding Credit Card Overlap and Hidden Costs

**Why fifth:** Differentiated angle; helps OpenCard look like a portfolio-management tool, not a credit-card affiliate site.

**Reader intent:** “Do I have too many cards or duplicate benefits?”

**Outline:**
- Why premium cards feel attractive
- Benefit overlap: lounges, credits, insurance, hotel status
- Hidden costs: AU fees, foreign transaction fees, interest, late fees
- Product changes and responsible cancellations
- Annual card portfolio audit
- Using OpenCard to spot overlap

**FAQs:**
- How many credit cards is too many?
- Will cancelling hurt my credit score?
- What is a product change?

**CTA:** Audit your wallet in **My Cards** and identify unused or overlapping benefits.

**YMYL caution:** Do not offer personal credit-score advice; explain tradeoffs generally.

---

### Backlog topics after first 5

6. Beginner's Guide to Credit Card Travel Insurance
7. Complete Guide to Airport Lounge Access with Credit Cards
8. How to Maximize Rewards on Everyday Spending
9. Hidden Credit Card Benefits You're Probably Missing
10. How to Use Points to Book a Dream Vacation
11. How to Combine Points Across Reward Programs
12. Calendar Year vs Cardmember Year: Why Benefit Timing Matters

### Editorial implementation notes

- Avoid “Best Credit Cards 2026” as first wave; too competitive and affiliate-looking.
- Prefer educational/product-led explainers that demonstrate original frameworks.
- Each article should include:
  - clear author/editorial disclosure
  - last updated date
  - official terms disclaimer
  - internal links to My Cards, card pages, benefit database, and related guides
  - FAQ section for schema later
- Tone: helpful, precise, not hype-driven.

## 2. Artifact-first Pipeline Recommendation

Recommendation: **Yes — all cron/adaptor/catalog-changing workflows should move toward artifact-first.**

Reason: Card catalog data is production data. Direct writes from crawlers or LLM extractors create silent corruption risk, especially for CFPB rewrite, offer monitoring, benefit extraction, and source-driven card updates.

### Proposed pipeline

1. **Fetch**
   - adaptor/cron fetches source pages, PDFs, CFPB data, issuer pages, or third-party snapshots.

2. **Extract**
   - produce structured extracted fields with source citations and confidence.

3. **Artifact**
   - write immutable review artifact, not catalog mutation.

4. **QA / Review**
   - validate schema, compare against current catalog, check source quality, flag risky diffs.

5. **Apply**
   - only approved artifacts are applied to catalog.

6. **Audit trail**
   - keep artifact, review result, applied patch, timestamp, source URLs, and reviewer.

### Suggested artifact shape

```json
{
  "artifact_version": "1.0",
  "artifact_type": "card_update | offer_update | benefit_update | source_snapshot",
  "card_id": "chase-sapphire-reserve",
  "run_id": "2026-05-27T21:00:00Z__adaptor-name",
  "source": {
    "url": "https://...",
    "source_type": "issuer | CFPB | doctor_of_credit | us_credit_card_guide | manual",
    "fetched_at": "2026-05-27T21:00:00Z",
    "snapshot_path": "artifacts/snapshots/..."
  },
  "extracted": {
    "fields": {
      "annual_fee": {
        "value": 695,
        "currency": "USD",
        "confidence": 0.98,
        "citation": "...exact source text..."
      }
    }
  },
  "diff": {
    "summary": "annual_fee unchanged; welcome_bonus changed",
    "changes": []
  },
  "risk_flags": [
    "third_party_source_only",
    "low_confidence_bonus_terms"
  ],
  "review": {
    "status": "pending | approved | rejected | needs_manual_review",
    "reviewer": null,
    "notes": null
  }
}
```

### Review rules

Auto-approve only when all are true:
- source is issuer or CFPB
- schema validation passes
- confidence above threshold
- diff is low-risk
- no money/fee/welcome-bonus term changed from third-party-only source

Manual review required when:
- annual fee changes
- welcome bonus changes
- benefit amount/frequency changes
- source conflicts with existing catalog
- source is third-party only
- extraction confidence is low
- large diff touches many fields

Never auto-apply:
- targeted/personalized offers
- logged-in-only terms
- unsupported OCR extraction without human review
- data with unclear source/citation

### Where this applies

- CFPB rewrite pipeline
- Card Adaptor Phase 2
- issuer page benefit crawlers
- Doctor of Credit / US Credit Card Guide offer watchers
- recurring credit updater
- cron-based source refresh jobs

### Near-term implementation sequence

1. Define artifact JSON schema.
2. Add artifact writer to adaptor/cron flows.
3. Add local review command: `opencard-artifact review <artifact>`.
4. Add apply command: `opencard-artifact apply <artifact>`.
5. Start with read-only artifact generation before enabling catalog writes.

## 3. Recommended next actions

1. Write article #1: **Credit Card Benefit Expiration Guide**.
2. Create reusable article template with disclaimer, CTA, FAQ, internal links.
3. Define artifact JSON schema before Card Adaptor Phase 2 coding.
4. Use artifact-first for CFPB rewrite decisions.
5. After first article is live, create articles #2 and #3 as the first content cluster.
