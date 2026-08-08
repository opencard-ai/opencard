export type CardEditorial = {
  take: string;
  bestFor: string[];
  notFor: string[];
  breakEven: string;
  alternatives: Array<{ cardId: string; label: string; reason: string }>;
};

/**
 * Hand-written English analysis for indexable card pages. Keep temporary
 * welcome-offer figures out of this layer; factual offer data belongs in the
 * cited card record above it.
 */
const CARD_EDITORIAL: Record<string, CardEditorial> = {
  "chase-sapphire-preferred": {
    take: "A practical entry point into transferable travel rewards for someone who wants useful dining and travel categories without committing to a premium annual fee. Its strongest case is flexibility: points can support several redemption paths, while the fee is low enough that a modest amount of naturally used value can justify keeping it. The weak spot is ordinary, uncategorized spending, so it works better as part of a small card pair than as the only card in a wallet.",
    bestFor: ["Travelers starting with transferable points", "People who spend regularly on dining and travel", "Cardholders who want primary rental-car coverage without a premium-card fee"],
    notFor: ["People who want simple statement-credit rewards", "High spenders seeking lounge access as the main benefit", "Anyone unable to meet a welcome-offer threshold through normal spending"],
    breakEven: "Start with the annual fee, then subtract only the travel credit or other benefits you would use without changing your booking habits. The remaining fee should be covered by the extra value of its points and protections over your best no-fee alternative—not by the welcome offer, which is one-time value.",
    alternatives: [
      { cardId: "capital-one-venture", label: "Capital One Venture", reason: "Simpler flat-rate earning for people who dislike category tracking." },
      { cardId: "chase-sapphire-reserve", label: "Chase Sapphire Reserve", reason: "Higher-fee option when premium travel benefits are repeatedly useful." },
    ],
  },
  "chase-sapphire-reserve": {
    take: "A premium travel card whose value depends less on the headline list of credits than on whether its travel ecosystem matches how you already book. Direct travel earning, airport benefits, protections, and transferable points can be strong, but the annual fee creates a high hurdle. It is not automatically an upgrade from the Preferred: it is a different product for frequent travelers who can use the core benefits repeatedly and with little friction.",
    bestFor: ["Frequent travelers who can use the core travel credit naturally", "People who value strong travel protections and transferable points", "Travelers whose airports and routes make the included lounge network useful"],
    notFor: ["Occasional travelers attracted mainly by the welcome offer", "People who must manufacture spending to use lifestyle credits", "Cardholders already paying for overlapping lounge memberships"],
    breakEven: "Ignore the one-time bonus and value every recurring credit at what it replaces in your normal budget. Add realistic lounge and protection value, then subtract the rewards you would earn with a lower-fee card. If the expected case does not comfortably exceed the annual fee, the Preferred or another mid-tier card is usually safer.",
    alternatives: [
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Keeps transferable Chase points with a much lower annual-fee hurdle." },
      { cardId: "capital-one-venture-x", label: "Capital One Venture X", reason: "A different premium value proposition centered on portal credit and flat earning." },
    ],
  },
  "amex-platinum": {
    take: "This is primarily a premium-benefits and airport-experience card, not a strong everyday-spending card. It can deliver substantial value to a traveler who already uses the relevant lounge network and included services, but the long menu of segmented credits makes face-value arithmetic misleading. The right owner can name the benefits they used before applying; the wrong owner starts new subscriptions to make the fee appear justified.",
    bestFor: ["Frequent flyers who can use the card's airport lounge footprint", "People with existing spending that matches several major credits", "Travelers who value premium hotel-program access and booking benefits"],
    notFor: ["Someone seeking one card for all daily purchases", "People who dislike enrollment, monthly credits, and benefit tracking", "Anyone valuing every credit at face value without prior spending history"],
    breakEven: "Build a renewal calculation from benefits actually used in the prior twelve months. Discount merchant-specific and monthly credits for breakage, and exclude services purchased only because the credit existed. Lounge access should be valued at the meals or membership it replaces—not at an inflated day-pass total.",
    alternatives: [
      { cardId: "capital-one-venture-x", label: "Capital One Venture X", reason: "Simpler premium structure and stronger uncategorized earning." },
      { cardId: "amex-gold", label: "American Express Gold", reason: "Better fit when dining and supermarket rewards matter more than airport perks." },
    ],
  },
  "amex-gold": {
    take: "A rewards card for people with substantial US supermarket and dining spend who can redeem Membership Rewards effectively. Its category earning can be excellent, but the annual fee is increasingly tied to several merchant-specific credits. That makes it a poor choice for anyone who sees the credits as coupons to consume rather than replacements for existing purchases.",
    bestFor: ["Households with consistent dining and US supermarket spending", "People already comfortable using Membership Rewards transfer partners", "Cardholders who naturally use enough included credits to reduce the fee"],
    notFor: ["Cash-back users who do not want to learn point redemptions", "People whose grocery spending occurs mainly at excluded superstores or clubs", "Minimalists who do not want monthly benefit tracking"],
    breakEven: "Subtract conservatively valued credits from the fee, then compare the value of category points with what a no-fee cash-back card would earn on the same spending. Use a cash-like point value unless you have a repeatable transfer strategy. The welcome offer should not be part of the year-two decision.",
    alternatives: [
      { cardId: "citi-strata", label: "Citi Strata", reason: "No-fee option with useful everyday categories and a lower complexity cost." },
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Lower fee with broader travel utility for many beginners." },
    ],
  },
  "capital-one-venture-x": {
    take: "One of the more straightforward premium-card propositions when the cardholder is willing to use Capital One Travel. The annual travel benefit and anniversary value can offset much of the fee on paper, while flat earning reduces category management. The main trade-off is portal dependence: price, inventory, loyalty recognition, and service during disruptions should be tested before treating the travel credit as cash.",
    bestFor: ["Travelers comfortable booking at least some trips through Capital One Travel", "People who value simple flat-rate earning", "Cardholders who can use its lounge access without paying for overlapping memberships"],
    notFor: ["Travelers who insist on booking every hotel directly", "People who rarely travel enough to use the annual portal benefit", "Anyone whose home airport and routes do not fit the lounge network"],
    breakEven: "Value the portal credit at the amount it saves after comparing the same booking directly. Add anniversary value only if you can redeem it well, then include realistic lounge use and incremental rewards. Account for any lost hotel points, elite credit, or flexibility caused by portal booking.",
    alternatives: [
      { cardId: "capital-one-venture", label: "Capital One Venture", reason: "Lower-fee version for people who want simple miles without premium commitments." },
      { cardId: "chase-sapphire-reserve", label: "Chase Sapphire Reserve", reason: "Consider when direct travel earning and Chase protections are more important." },
    ],
  },
  "capital-one-venture": {
    take: "A simple mid-tier travel card for someone who wants transferable miles without memorizing several bonus categories. Flat earning makes it easy to operate, but simplicity alone does not guarantee that the annual fee is worthwhile. Compare it with strong no-fee flat-rate cards and with Venture X if you travel enough to use that card's premium benefits.",
    bestFor: ["People who prefer consistent earning over category optimization", "Occasional travelers who can use Capital One transfer partners", "Cardholders seeking no foreign transaction fee in a simple setup"],
    notFor: ["People who want pure cash back at a transparent fixed rate", "Heavy travelers who can fully use a premium card's recurring benefits", "Category optimizers seeking the highest return on dining or groceries"],
    breakEven: "Calculate the value of miles earned above your best no-fee alternative, then add only recurring benefits you would purchase independently. If ordinary spending does not generate enough incremental value to cover the fee, a no-fee card is the cleaner long-term choice.",
    alternatives: [
      { cardId: "capital-one-venture-x", label: "Capital One Venture X", reason: "Potentially stronger for frequent travelers who can use portal benefits." },
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "No-fee flat cash rewards with no transfer-partner learning curve." },
    ],
  },
  "bilt-obsidian": {
    take: "A specialized Bilt ecosystem card whose appeal depends on how much value you place on Bilt points and whether the selectable earning structure matches your spending. The annual fee raises the standard above a basic rent-rewards product: portal credits and Bilt-specific value should be usable without forcing extra travel or purchases.",
    bestFor: ["Bilt members who already use the program and its transfer partners", "People whose spending aligns with the chosen bonus category", "Travelers able to use the hotel benefit under its booking conditions"],
    notFor: ["People new to Bilt who only want a simple rent-payment card", "Cardholders who prefer unrestricted cash back", "Anyone unlikely to use Bilt-specific credits before they expire"],
    breakEven: "Value Bilt Cash and hotel benefits based on the purchases they replace, then compare category and base earning with a no-fee alternative. Do not assign a high point value unless you have repeatable redemptions through partners you actually use.",
    alternatives: [
      { cardId: "bilt-blue", label: "Bilt Blue", reason: "Lower-cost entry when the premium features do not justify a fee." },
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Broader mid-tier travel option with a different transfer ecosystem." },
    ],
  },
  "citi-strata": {
    take: "A no-annual-fee everyday rewards card with useful bonus categories and a manageable welcome-offer threshold. Its value depends on understanding category caps and how ThankYou Points will be redeemed. It can be a strong low-cost building block, especially when paired with another Citi card that expands redemption options, but it is not a premium travel card by itself.",
    bestFor: ["People seeking useful everyday categories with no annual fee", "Existing Citi ThankYou users building a points combination", "Cardholders who can stay within and track the category caps"],
    notFor: ["High spenders who will quickly exceed bonus-category caps", "Travelers seeking lounge access or premium protections", "People who want completely automatic flat-rate earning"],
    breakEven: "With no annual fee, the main comparison is opportunity cost. Estimate category rewards after caps and compare them with a flat-rate card. Include the value of any additional Citi card needed to unlock the redemption path you plan to use.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Simpler flat-rate cash rewards with no category caps to track." },
      { cardId: "amex-gold", label: "American Express Gold", reason: "Higher-cost option for heavy dining and supermarket spend." },
    ],
  },
  "wells-fargo-active-cash": {
    take: "A straightforward no-fee cash-back card that works well as a default for purchases that do not earn a category bonus elsewhere. The value proposition is easy to verify and does not require award searches. It is less compelling for international spending or for someone seeking transferable travel rewards, but simplicity is precisely its advantage.",
    bestFor: ["People who want predictable cash rewards", "Cardholders building a simple two-card setup", "Anyone needing a no-fee fallback for uncategorized purchases"],
    notFor: ["Travelers prioritizing transfer partners and premium protections", "People seeking large category multipliers", "International users if the current foreign-transaction terms do not fit their needs"],
    breakEven: "There is no annual fee to recover, so compare its flat return with category cards and any foreign transaction cost. The right question is whether another card earns enough extra on your spending to justify added fees and complexity.",
    alternatives: [
      { cardId: "chase-freedom-unlimited", label: "Chase Freedom Unlimited", reason: "Adds dining, drugstore, and Chase Travel categories to a no-fee base." },
      { cardId: "capital-one-venture", label: "Capital One Venture", reason: "Consider when transferable travel miles justify an annual fee." },
    ],
  },
  "chase-freedom-unlimited": {
    take: "A useful no-fee card for everyday spending, dining, and drugstores, especially for someone who already holds an eligible premium Chase card that can expand point redemption options. On its own, it remains a solid cash-back-style product, but its foreign transaction fee and modest uncategorized rate limit its role as a universal travel card.",
    bestFor: ["People building a no-fee everyday rewards setup", "Existing Chase points users who can combine rewards", "Cardholders with regular dining and drugstore purchases"],
    notFor: ["International travelers who need no foreign transaction fee", "People who want one simple flat rate on every purchase", "Anyone likely to overspend through a travel portal for a higher multiplier"],
    breakEven: "With no annual fee, compare its category and base earning with a flat-rate card. If pairing it with a fee-bearing Chase card, assign only the incremental redemption value created by that combination and test whether the premium card's fee is justified separately.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Simpler flat-rate option for uncategorized spending." },
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Adds transferable-point and travel features for a fee." },
    ],
  },
};

export function getCardEditorial(cardId: string): CardEditorial | undefined {
  return CARD_EDITORIAL[cardId];
}
