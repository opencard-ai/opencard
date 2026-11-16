/**
 * Editorial "best for" category pages (/[lang]/best, /[lang]/best/[slug]).
 *
 * Every fact in `summary` was checked on the issuer's current official page on
 * `verified`. Picks are only "best" against the stated criteria and only among
 * the cards listed (this is not every card on the market). OpenCard is not paid
 * for any card on these pages and there are no affiliate links on them.
 * Fees and rewards change: re-check the issuer page before editing a summary.
 */
export type BestPick = {
  cardId: string;
  pick: { en: string; zh: string };
  summary: { en: string; zh: string };
  source: string;
};

export type BestCategory = {
  slug: string;
  title: { en: string; zh: string };
  metaDescription: { en: string; zh: string };
  intro: { en: string; zh: string };
  criteria: { en: string[]; zh: string[] };
  caveats: { en: string[]; zh: string[] };
  picks: BestPick[];
  verified: string;
};

export const BEST_CATEGORIES: BestCategory[] = [
  {
    slug: "business-credit-cards",
    verified: "2026-11-16",
    title: {
      en: "Business Credit Cards Compared: Chase Ink vs Capital One Spark",
      zh: "商務信用卡怎麼選：Chase Ink 和 Capital One Spark 五張比一比",
    },
    metaDescription: {
      en: "Five small-business cards compared on annual fee and everyday cash back, with every rate checked on Chase and Capital One's own pages: Ink Business Unlimited, Ink Business Cash, Spark Cash, Spark Cash Plus and Ink Business Premier.",
      zh: "五張美國商務卡用年費和日常回饋來比：Ink Business Unlimited、Ink Business Cash、Spark Cash、Spark Cash Plus、Ink Business Premier，費率都對照過 Chase 和 Capital One 官網。",
    },
    intro: {
      en: "Most small businesses want one of two things from a card: no annual fee, or the highest flat cash back on everything. These five cards from Chase and Capital One cover both. We picked each one for a specific kind of spending rather than naming one overall winner.",
      zh: "小公司挑卡，通常就是兩種需求：不想付年費，或是想要所有消費都拿到最高的固定回饋。下面這五張 Chase 和 Capital One 的卡剛好都涵蓋到了。我們不選「唯一最強」，而是照你的消費習慣各挑一張。",
    },
    criteria: {
      en: [
        "Annual fee after the first year (lower is better unless the extra cash back clearly covers it).",
        "Ongoing cash back on everyday business spending, without rotating categories.",
        "Caps and conditions the issuer states (spending caps, pay-in-full requirements, fee refunds).",
        "Only cards whose terms we read on the issuer's own page on the date shown. Welcome offers are ignored because they change often.",
      ],
      zh: [
        "第二年起的年費（越低越好，除非多拿的回饋明顯補得回來）。",
        "日常商務消費的長期回饋，不算那種要輪替類別的。",
        "發卡銀行寫明的上限和條件（回饋上限、要不要每期繳清、年費退還門檻）。",
        "只收錄我們在標示日期當天看過發卡銀行官網條款的卡。首刷禮常常變，所以不列入比較。",
      ],
    },
    caveats: {
      en: [
        "Ink Business Cash's 5% and 2% rates each stop after $25,000 of combined purchases per account anniversary year; after that those purchases earn 1%.",
        "Spark Cash Plus and Ink Business Premier are pay-in-full cards; carrying a balance is not their use case.",
      ],
      zh: [
        "Ink Business Cash 的 5% 和 2% 各自在每個卡片年度合計消費滿 $25,000 後就停，超過的部分只剩 1%。",
        "Spark Cash Plus 和 Ink Business Premier 都是要每期繳清的卡，不適合想分期或欠款的人。",
      ],
    },
    picks: [
      {
        cardId: "chase-ink-biz-unlimited",
        pick: { en: "No annual fee, simplest flat rate", zh: "免年費、最簡單的固定回饋" },
        summary: {
          en: "$0 annual fee and unlimited 1.5% cash back on every business purchase. The only card here with no fee at all and no categories to track.",
          zh: "免年費，所有商務消費無上限 1.5% 現金回饋。這五張裡唯一完全不收年費、也不用記類別的。",
        },
        source: "https://creditcards.chase.com/business-credit-cards/ink/unlimited",
      },
      {
        cardId: "chase-ink-biz-cash",
        pick: { en: "Office supply stores, internet and phone bills", zh: "辦公用品店、網路和電話費" },
        summary: {
          en: "$0 annual fee. 5% cash back on the first $25,000 a year in combined purchases at office supply stores and on internet, cable and phone services, 2% on the first $25,000 combined at gas stations and restaurants, 1% on everything else.",
          zh: "免年費。辦公用品店和網路、有線電視、電話費合計每年前 $25,000 拿 5%，加油站和餐廳合計前 $25,000 拿 2%，其他 1%。",
        },
        source: "https://creditcards.chase.com/business-credit-cards/ink/cash",
      },
      {
        cardId: "capital-one-spark-cash",
        pick: { en: "2% on everything with a modest fee", zh: "每筆都 2%，年費不高" },
        summary: {
          en: "Unlimited 2% cash back on every purchase and 5% on hotels and rental cars booked through Capital One Business Travel. $0 intro annual fee for the first year, then $95.",
          zh: "所有消費無上限 2% 現金回饋，透過 Capital One Business Travel 訂飯店和租車拿 5%。第一年免年費，之後 $95。",
        },
        source: "https://www.capitalone.com/small-business/credit-cards/spark-cash/",
      },
      {
        cardId: "capital-one-spark-cash-plus",
        pick: { en: "High spenders who pay in full", zh: "刷很大、每期繳清的公司" },
        summary: {
          en: "Charge card with unlimited 2% cash back and 5% on hotels, vacation rentals and rental cars through Capital One Business Travel. The $150 annual fee is refunded every year you spend at least $150,000. Miss the minimum payment and Capital One charges a 2.99% late fee.",
          zh: "需要每期全額繳清的記帳卡（charge card，沒有循環額度），所有消費無上限 2%，透過 Capital One Business Travel 訂飯店、度假租屋、租車拿 5%。年費 $150，一年刷滿 $150,000 就退。沒在到期日前繳最低應繳金額，Capital One 會收 2.99% 的逾期費。",
        },
        source: "https://www.capitalone.com/small-business/credit-cards/spark-cash-plus/",
      },
      {
        cardId: "chase-ink-biz-premier",
        pick: { en: "Large single purchases", zh: "常有大筆單次採購" },
        summary: {
          en: "$195 annual fee. 2.5% cash back on every purchase of $5,000 or more, 2% on all other purchases and 5% on travel booked through Chase Travel. Chase describes it as a pay-in-full card.",
          zh: "年費 $195。單筆 $5,000 以上的消費拿 2.5%，其他消費 2%，透過 Chase Travel 訂旅遊拿 5%。Chase 官網說這是一張要每期繳清的卡。",
        },
        source: "https://creditcards.chase.com/business-credit-cards/ink/premier",
      },
    ],
  },
  {
    slug: "store-credit-cards",
    verified: "2026-11-16",
    title: {
      en: "Store Credit Cards Compared: Ulta, Old Navy, Gap, Banana Republic & Athleta",
      zh: "商店聯名卡比較：Ulta、Old Navy、Gap、Banana Republic、Athleta",
    },
    metaDescription: {
      en: "Ulta Beauty Rewards Mastercard vs the Barclays Encore Mastercards for Old Navy, Gap, Banana Republic and Athleta: annual fee, points, purchase APR and who each one is for, checked on the issuers' own pages.",
      zh: "Ulta Beauty Rewards Mastercard 和 Barclays 的 Old Navy、Gap、Banana Republic、Athleta Encore Mastercard 比一比：年費、點數、循環利率，還有各自適合誰，都對照過官網。",
    },
    intro: {
      en: "Store cards only pay off if you already shop at that brand often and pay your bill in full every month. Their rewards are tied to the store, and their purchase APRs are high. Here's what each card actually earns, in the issuer's own words.",
      zh: "商店卡只有在你本來就常買那個品牌、而且每期都繳全額的時候才划算。回饋綁在那家店，循環利率又高。下面直接照官網寫的，整理每張卡實際能拿到什麼。",
    },
    criteria: {
      en: [
        "Annual fee (all cards here have none).",
        "Points at the brand versus everywhere else, as the issuer states them.",
        "Where points can be used (store-only rewards are worth less than cash).",
        "Purchase APR as listed by the issuer, because store cards are a bad place to carry a balance.",
        "Only cards whose terms we read on the issuer's page on the date shown.",
      ],
      zh: [
        "年費（這裡每張都免年費）。",
        "在品牌消費和在其他地方消費各拿多少點，以官網寫法為準。",
        "點數能在哪裡用（只能在店裡用的回饋，價值比不上現金）。",
        "官網列出的循環利率，因為商店卡最不適合拿來欠款。",
        "只收錄我們在標示日期當天看過官網條款的卡。",
      ],
    },
    caveats: {
      en: [
        "Barclays lists a 33.49% variable purchase APR on all four Encore Mastercard pages (Old Navy, Gap, Banana Republic, Athleta). If you might carry a balance, the interest will almost always cost more than the points are worth.",
        "The four Barclays Encore cards earn and redeem the same way; the brand on the card mainly changes its design and first-purchase offer, so pick the brand you shop most.",
        "First-purchase discounts differ by card and are one-time only, so we don't rank on them.",
      ],
      zh: [
        "Barclays 四張 Encore Mastercard（Old Navy、Gap、Banana Republic、Athleta）頁面寫的循環利率都是 33.49%（機動利率）。只要你有可能欠款，利息幾乎一定比點數還多。",
        "這四張 Barclays Encore 卡的點數拿法和用法都一樣，差別主要在卡面和首刷優惠，選你最常逛的那個品牌就好。",
        "首刷折扣每張不一樣，而且只能用一次，所以不拿來排名。",
      ],
    },
    picks: [
      {
        cardId: "comenity-ulta-beauty-mastercard",
        pick: { en: "If you shop at Ulta Beauty", zh: "常買 Ulta 的人" },
        summary: {
          en: "Ulta Beauty Rewards Mastercard (Comenity Capital Bank): $0 annual fee, 2 points per $1 at Ulta Beauty (base member level) and 1 point per $3 everywhere else. Points are redeemed at Ulta Beauty. Ulta's card page doesn't list a purchase APR, so check Comenity's terms before you apply.",
          zh: "Ulta Beauty Rewards Mastercard（Comenity Capital Bank 發行）：免年費，在 Ulta 每 $1 拿 2 點（基本會員等級），在其他地方每 $3 才 1 點。點數在 Ulta 折抵使用。Ulta 的信用卡頁面沒寫循環利率，申請前請先看 Comenity 的條款。",
        },
        source: "https://www.ulta.com/rewards/credit-card",
      },
      {
        cardId: "barclays-old-navy-navyist-rewards-mastercard",
        pick: { en: "Gap Inc. shoppers who mostly buy at Old Navy", zh: "最常逛 Old Navy 的人" },
        summary: {
          en: "Old Navy Encore Mastercard (Barclays): $0 annual fee. Barclays lists 5X points per $1 at the Gap Inc. family of brands, 3X at eligible retail apparel brands and 1X everywhere else, with 500 points = a $1 Reward for the Encore Market or Gap Inc. purchases. 33.49% variable purchase APR.",
          zh: "Old Navy Encore Mastercard（Barclays 發行）：免年費。Barclays 官網寫的是：在 Gap 集團旗下品牌每 $1 拿 5 倍點數，在指定服飾品牌拿 3 倍，其他地方 1 倍；500 點可換 $1 獎勵金（Reward），能在 Encore Market 或 Gap 集團品牌使用。循環利率 33.49%（機動利率）。",
        },
        source: "https://cards.barclaycardus.com/banking/cards/old-navy-encore-mastercard/",
      },
      {
        cardId: "barclays-gap-good-rewards-mastercard",
        pick: { en: "Same Encore rewards, Gap card", zh: "一樣的 Encore 回饋，Gap 卡面" },
        summary: {
          en: "Gap Encore Mastercard (Barclays): $0 annual fee and the same Encore earning as the Old Navy card: 5X points per $1 at Gap Inc. brands, 3X at eligible retail apparel brands, 1X elsewhere; 500 points = a $1 Reward. 33.49% variable purchase APR.",
          zh: "Gap Encore Mastercard（Barclays 發行）：免年費，回饋跟 Old Navy 那張一樣：Gap 集團品牌每 $1 拿 5 倍，指定服飾品牌 3 倍，其他 1 倍；500 點換 $1 獎勵金（Reward）。循環利率 33.49%（機動利率）。",
        },
        source: "https://cards.barclaycardus.com/banking/cards/gap-encore-mastercard/",
      },
      {
        cardId: "barclays-banana-republic-rewards-mastercard",
        pick: { en: "Same Encore rewards, Banana Republic card", zh: "一樣的 Encore 回饋，Banana Republic 卡面" },
        summary: {
          en: "Banana Republic Encore Mastercard (Barclays): $0 annual fee, 5X points per $1 at Gap Inc. brands, 3X at eligible retail apparel brands, 1X elsewhere; 500 points = a $1 Reward. 33.49% variable purchase APR.",
          zh: "Banana Republic Encore Mastercard（Barclays 發行）：免年費，Gap 集團品牌每 $1 拿 5 倍，指定服飾品牌 3 倍，其他 1 倍；500 點換 $1 獎勵金（Reward）。循環利率 33.49%（機動利率）。",
        },
        source: "https://cards.barclaycardus.com/banking/cards/banana-republic-encore-mastercard/",
      },
      {
        cardId: "barclays-athleta-rewards-mastercard",
        pick: { en: "Same Encore rewards, Athleta card", zh: "一樣的 Encore 回饋，Athleta 卡面" },
        summary: {
          en: "Athleta Encore Mastercard (Barclays): $0 annual fee, 5X points per $1 at Gap Inc. brands, 3X at eligible retail apparel brands, 1X elsewhere; 500 points = a $1 Reward. 33.49% variable purchase APR.",
          zh: "Athleta Encore Mastercard（Barclays 發行）：免年費，Gap 集團品牌每 $1 拿 5 倍，指定服飾品牌 3 倍，其他 1 倍；500 點換 $1 獎勵金（Reward）。循環利率 33.49%（機動利率）。",
        },
        source: "https://cards.barclaycardus.com/banking/cards/athleta-encore-mastercard/",
      },
    ],
  },
];

export function getBestCategory(slug: string): BestCategory | undefined {
  return BEST_CATEGORIES.find((c) => c.slug === slug);
}

/** Category slugs a card appears in (for "compare in this category" links on card pages). */
export function bestCategoriesForCard(cardId: string): BestCategory[] {
  return BEST_CATEGORIES.filter((c) => c.picks.some((p) => p.cardId === cardId));
}
