/**
 * Registry of long-form pillar guides under `content/guides/*.mdx`.
 *
 * Each entry must match an `.mdx` file in `content/guides/` and the file must
 * export a `metadata` object (title, summary, dates, word_count) plus a
 * default React component (auto-emitted by `@next/mdx` from the markdown
 * body).
 *
 * Keeping this list hand-curated rather than auto-globbed because:
 *   1. Order matters for the guides index page (most relevant first).
 *   2. We want PR review to be a clear gate for new guides.
 *   3. Glob + dynamic import lookups make Vercel build trace bigger.
 *
 * If this list grows past ~30 entries the trade-off flips and a generated
 * index from a script becomes worthwhile.
 */

export type GuideSummary = {
  slug: string;
  /** Canonical English title shown on /guides index and as document title. */
  title: string;
  /** One-line meta description for /guides cards + OpenGraph. */
  summary: string;
  /** ISO date the guide was first published. */
  published: string;
  /** ISO date the guide was last meaningfully revised. */
  updated: string;
  /** Approximate word count of the prose body — useful for AdSense review
   * heuristics that prefer ≥1500 words on pillar pages. */
  word_count: number;
  /** Optional tags surfaced on the index page. */
  tags?: string[];
  /** Localized metadata for translated guide index/meta rendering. */
  localized?: Partial<Record<string, Pick<GuideSummary, "title" | "summary" | "tags">>>;
};

export function getLocalizedGuide(guide: GuideSummary, lang: string): GuideSummary {
  const localized = guide.localized?.[lang];
  if (!localized) return guide;
  return {
    ...guide,
    title: localized.title,
    summary: localized.summary,
    tags: localized.tags || guide.tags,
  };
}

export function getLocalizedGuides(lang: string): GuideSummary[] {
  return GUIDES.map((guide) => getLocalizedGuide(guide, lang));
}

export const GUIDES: GuideSummary[] = [
  {
    slug: "credit-card-benefit-expiration-guide",
    title:
      "Credit Card Benefit Expiration Guide: how to stop losing perks you already paid for",
    summary:
      "A practical guide to calendar-year credits, cardmember-year credits, free-night certificates, lounge passes, points expiration, and the tracking habits that keep credit card benefits from quietly disappearing.",
    published: "2026-05-27",
    updated: "2026-05-27",
    word_count: 2200,
    tags: ["benefits", "expiration", "My Cards", "annual fee"],
    localized: {
      zh: {
        title: "信用卡福利到期指南：別再錯過已經付費取得的權益",
        summary:
          "實用解析日曆年回饋、持卡週年回饋、免費住宿券、貴賓室通行、點數到期，以及如何用追蹤習慣避免信用卡福利悄悄失效。",
        tags: ["福利", "到期", "我的卡片", "年費"],
      },
      "zh-cn": {
        title: "信用卡权益到期指南：别再错过已经付费取得的福利",
        summary:
          "实用解析日历年返现、持卡周年权益、免费住宿券、贵宾室通行、点数到期，以及如何用追踪习惯避免信用卡权益悄悄失效。",
        tags: ["权益", "到期", "我的卡片", "年费"],
      },
      es: {
        title: "Guía de vencimientos de beneficios de tarjetas de crédito",
        summary:
          "Una guía práctica para entender créditos por año calendario, beneficios por aniversario, noches gratis, pases de salas VIP, vencimiento de puntos y hábitos para no perder valor.",
        tags: ["beneficios", "vencimiento", "My Cards", "cuota anual"],
      },
    },
  },
  {
    slug: "credit-card-annual-fee-worth-it",
    title:
      "Is Your Credit Card Annual Fee Worth It? A practical break-even framework",
    summary:
      "A practical framework for deciding whether a credit card annual fee is worth paying, using real used value instead of inflated perk math, with renewal-review steps and downgrade/cancel considerations.",
    published: "2026-05-27",
    updated: "2026-05-27",
    word_count: 2300,
    tags: ["annual fee", "strategy", "My Cards", "renewal"],
    localized: {
      zh: {
        title: "信用卡年費值得嗎？一套實用的損益平衡框架",
        summary:
          "用實際使用價值，而不是被放大的福利總額，判斷信用卡年費是否值得續繳，並整理續卡、降級與取消前的檢查步驟。",
        tags: ["年費", "策略", "我的卡片", "續卡"],
      },
      "zh-cn": {
        title: "信用卡年费值得吗？一套实用的盈亏平衡框架",
        summary:
          "用实际使用价值，而不是被放大的权益总额，判断信用卡年费是否值得续缴，并整理续卡、降级与取消前的检查步骤。",
        tags: ["年费", "策略", "我的卡片", "续卡"],
      },
      es: {
        title: "¿Vale la pena la cuota anual de tu tarjeta? Un marco práctico",
        summary:
          "Un marco para decidir si una cuota anual merece la pena usando valor realmente utilizado, no matemáticas infladas de beneficios, con pasos para renovar, bajar de categoría o cancelar.",
        tags: ["cuota anual", "estrategia", "My Cards", "renovación"],
      },
    },
  },
  {
    slug: "new-credit-card-onboarding-checklist",
    title: "New Credit Card Onboarding Checklist: what to do after approval",
    summary:
      "A practical checklist for the first day, first week, first month, and first renewal after opening a new credit card — including autopay, benefit enrollment, welcome-bonus tracking, and My Cards reminders.",
    published: "2026-05-27",
    updated: "2026-05-27",
    word_count: 2300,
    tags: ["checklist", "new card", "welcome bonus", "My Cards"],
    localized: {
      zh: {
        title: "新信用卡核卡後檢查清單：核准後第一步該做什麼",
        summary:
          "從第一天、第一週、第一個月到第一次續卡，整理自動付款、福利註冊、開卡禮追蹤與 My Cards 提醒的實用清單。",
        tags: ["檢查清單", "新卡", "開卡禮", "我的卡片"],
      },
      "zh-cn": {
        title: "新信用卡核卡后检查清单：获批后第一步该做什么",
        summary:
          "从第一天、第一周、第一个月到第一次续卡，整理自动付款、权益注册、开卡礼追踪与 My Cards 提醒的实用清单。",
        tags: ["检查清单", "新卡", "开卡礼", "我的卡片"],
      },
      es: {
        title: "Checklist para una nueva tarjeta: qué hacer después de la aprobación",
        summary:
          "Una lista práctica para el primer día, la primera semana, el primer mes y la primera renovación: autopago, inscripción de beneficios, bono de bienvenida y recordatorios en My Cards.",
        tags: ["checklist", "nueva tarjeta", "bono de bienvenida", "My Cards"],
      },
    },
  },
  {
    slug: "credit-card-points-valuation-guide",
    title: "Credit Card Points Valuation Guide: what your rewards are actually worth",
    summary:
      "A practical guide to valuing credit card points, comparing cash redemptions, travel portals, transfer partners, award fees, devaluation risk, and personal redemption value.",
    published: "2026-05-27",
    updated: "2026-05-27",
    word_count: 2300,
    tags: ["points", "valuation", "rewards", "strategy"],
    localized: {
      zh: {
        title: "信用卡點數估值指南：你的回饋到底值多少",
        summary:
          "實用解析現金兌換、旅遊入口、轉點夥伴、獎勵票稅費、貶值風險與個人實際兌換價值。",
        tags: ["點數", "估值", "回饋", "策略"],
      },
      "zh-cn": {
        title: "信用卡点数估值指南：你的奖励到底值多少",
        summary:
          "实用解析现金兑换、旅游入口、转点伙伴、奖励票税费、贬值风险与个人实际兑换价值。",
        tags: ["点数", "估值", "奖励", "策略"],
      },
      es: {
        title: "Guía de valoración de puntos de tarjetas de crédito",
        summary:
          "Una guía práctica para valorar puntos comparando efectivo, portales de viaje, socios de transferencia, tasas de premios, riesgo de devaluación y valor personal real.",
        tags: ["puntos", "valoración", "recompensas", "estrategia"],
      },
    },
  },
  {
    slug: "premium-card-overlap-hidden-costs",
    title: "Premium Card Overlap and Hidden Costs: how to audit a high-fee wallet",
    summary:
      "A practical guide to identifying duplicate lounge access, overlapping credits, unused benefits, authorized-user fees, behavior costs, and renewal risks across premium credit cards.",
    published: "2026-05-27",
    updated: "2026-05-27",
    word_count: 2300,
    tags: ["premium cards", "overlap", "annual fee", "My Cards"],
    localized: {
      zh: {
        title: "高年費卡福利重疊與隱藏成本：如何審核你的高費用卡組合",
        summary:
          "實用檢查高年費卡之間的貴賓室重疊、重複報銷、未使用福利、副卡費、行為成本與續卡風險。",
        tags: ["高年費卡", "福利重疊", "年費", "我的卡片"],
      },
      "zh-cn": {
        title: "高年费卡权益重叠与隐藏成本：如何审核你的高费用卡组合",
        summary:
          "实用检查高年费卡之间的贵宾室重叠、重复报销、未使用权益、副卡费、行为成本与续卡风险。",
        tags: ["高年费卡", "权益重叠", "年费", "我的卡片"],
      },
      es: {
        title: "Solapamiento y costos ocultos de tarjetas premium",
        summary:
          "Una guía práctica para detectar accesos duplicados a salas VIP, créditos superpuestos, beneficios no usados, cuotas de usuarios autorizados, costos de comportamiento y riesgos de renovación.",
        tags: ["tarjetas premium", "solapamiento", "cuota anual", "My Cards"],
      },
    },
  },
  {
    slug: "chase-5-24-rule",
    title:
      "Chase 5/24 Rule: what it is, what counts, and how to plan around it",
    summary:
      "A complete guide to Chase's unofficial 5/24 policy — which cards and accounts trigger it, how to audit your own count, and whether to go Chase-first or Chase-last given your current situation.",
    published: "2026-05-26",
    updated: "2026-05-26",
    word_count: 2050,
    tags: ["Chase", "5/24", "strategy", "application"],
  },
  {
    slug: "welcome-offer-strategy",
    title:
      "Welcome Offer Strategy: how to find, evaluate, and actually capture sign-up bonuses",
    summary:
      "A practical framework for valuing any welcome offer, timing your applications around real spend, and avoiding the traps that cause most people to forfeit half the bonus before they ever earn it.",
    published: "2026-05-25",
    updated: "2026-05-25",
    word_count: 2050,
    tags: ["welcome offer", "strategy", "sign-up bonus"],
  },
  {
    slug: "transferable-points-101",
    title: "Transferable Points 101: how Chase UR, Amex MR, Citi TYP, and Capital One Miles actually work",
    summary:
      "A plain-language walkthrough of the four major US transferable-points currencies, why their flexibility outweighs raw earning rates, and when transferring beats redeeming directly.",
    published: "2026-05-24",
    updated: "2026-05-24",
    word_count: 2000,
    tags: ["points", "strategy", "beginner"],
  },
];

export function getGuide(slug: string): GuideSummary | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
