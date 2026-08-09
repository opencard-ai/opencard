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
  "amazon-prime-visa": {
    take: "A strong store-and-ecosystem card for households that already pay for Prime and spend heavily at Amazon, Amazon Fresh, or Whole Foods. The card itself has no annual fee, but the elevated Amazon earning depends on an eligible Prime membership, so the membership cost should not be ignored if shopping rewards are the main reason for keeping Prime.",
    bestFor: ["Existing Prime households with substantial Amazon spending", "Whole Foods and Amazon Fresh shoppers", "People wanting no foreign transaction fee on a no-card-fee product"],
    notFor: ["People who would cancel Prime without the card", "Shoppers seeking a high flat return outside Amazon", "Anyone trying to build transferable travel points"],
    breakEven: "Treat the Prime membership cost as part of the equation only when you would not otherwise subscribe. Compare the extra Amazon return over your best general card with that membership cost and with any prices or convenience benefits that independently justify Prime.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Flat cash rewards without tying value to one retailer." },
      { cardId: "chase-freedom-unlimited", label: "Chase Freedom Unlimited", reason: "Broader everyday categories and potential Chase pairing value." },
    ],
  },
  "capital-one-savorone": {
    take: "A useful no-fee cash-rewards card for dining, entertainment, and eligible grocery spending. It is easiest to justify when those categories make up a meaningful share of the budget and the card is paired with a stronger flat-rate option for everything else. Merchant coding still matters, so not every food or entertainment purchase will necessarily qualify as expected.",
    bestFor: ["Dining and entertainment spenders", "People seeking useful categories without an annual fee", "Travelers who value no foreign transaction fee"],
    notFor: ["People whose grocery shopping is mainly at excluded superstores or clubs", "Anyone wanting one high flat rate on all purchases", "Travel hackers seeking premium protections and lounge access"],
    breakEven: "There is no annual fee to recover. Estimate the extra rewards from eligible bonus categories over a flat-rate card, then subtract the inconvenience of managing a second card. Confirm how your regular merchants code before projecting the full category rate.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Simpler flat return for uncategorized spending." },
      { cardId: "amex-gold", label: "American Express Gold", reason: "Higher-fee option for heavier dining and supermarket spend." },
    ],
  },
  "capital-one-quicksilver": {
    take: "A simple no-fee card with predictable rewards and no category activation. Its main advantage is operational ease rather than market-leading earning. It can work as a starter or backup card, particularly for someone who values no foreign transaction fee, but a stronger flat-rate card may earn more on the same domestic spending.",
    bestFor: ["People prioritizing simplicity", "Newer cardholders seeking a low-maintenance rewards card", "Travelers wanting a no-fee card without foreign transaction fees"],
    notFor: ["People optimizing every percentage point of cash back", "Heavy category spenders", "Travelers seeking transfer partners or premium benefits"],
    breakEven: "With no annual fee, compare its flat return directly with other no-fee cards. Include foreign transaction savings if relevant, but do not let a welcome offer obscure a weaker long-term earning rate for your spending pattern.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Higher flat cash return for many domestic purchases." },
      { cardId: "capital-one-savorone", label: "Capital One SavorOne", reason: "Better fit when dining and entertainment dominate spending." },
    ],
  },
  "capital-one-venture-one": {
    take: "A no-fee entry into Capital One miles for someone who wants transfer flexibility without committing to an annual fee. The trade-off is a modest base earning rate, so it is generally better as a way to preserve access to the program or learn transfers than as the highest-earning everyday card.",
    bestFor: ["Beginners testing transferable miles", "People who want to avoid an annual fee", "Existing Capital One customers preserving miles and flexibility"],
    notFor: ["High spenders who could justify a stronger earning card", "People who prefer transparent cash back", "Frequent travelers seeking premium credits or lounge access"],
    breakEven: "The fee hurdle is zero, but opportunity cost remains. Compare its miles with the cash earned by a strong flat-rate card. A higher cents-per-mile assumption is justified only when you have a realistic, repeatable transfer redemption.",
    alternatives: [
      { cardId: "capital-one-venture", label: "Capital One Venture", reason: "Higher earning for spenders who can recover the annual fee." },
      { cardId: "capital-one-quicksilver", label: "Capital One Quicksilver", reason: "Simpler cash rewards with no transfer strategy required." },
    ],
  },
  "chase-freedom-flex": {
    take: "A high-upside no-fee card for someone willing to activate and track rotating quarterly categories. It can be especially useful inside a Chase points setup, but the 5% headline applies only within eligible categories and caps. The low base rate means it should not be used indiscriminately for every purchase.",
    bestFor: ["People who reliably activate quarterly categories", "Existing Chase points users", "Dining and drugstore spenders who want no annual fee"],
    notFor: ["Anyone who dislikes rotating calendars and caps", "International spenders because of the foreign transaction fee", "People seeking one simple everyday card"],
    breakEven: "Estimate how much of each quarter's cap you can fill with purchases you already planned. Compare only the incremental category rewards with a flat-rate card, and assign no value to categories you are unlikely to use.",
    alternatives: [
      { cardId: "chase-freedom-unlimited", label: "Chase Freedom Unlimited", reason: "Simpler base earning with no rotating activation." },
      { cardId: "discover-it", label: "Discover it Cash Back", reason: "Another rotating-category approach with a different ecosystem." },
    ],
  },
  "citi-custom-cash": {
    take: "A targeted no-fee category card that automatically rewards the highest eligible category each billing cycle, subject to its cap. It works best when assigned one consistent job—such as groceries, gas, or dining—rather than used as a general spending card. Purchases beyond the cap and outside eligible categories earn much less.",
    bestFor: ["People with one predictable monthly spending category", "Cardholders who want automatic category selection", "Citi users building a complementary card setup"],
    notFor: ["People whose target-category spending greatly exceeds the cap", "International users because of the foreign transaction fee", "Anyone seeking strong rewards on all purchases"],
    breakEven: "Project eligible spending only up to the monthly cap and compare the category premium with a flat-rate card. Keep unrelated purchases elsewhere so they do not dilute the card's role or create the illusion of a higher overall return.",
    alternatives: [
      { cardId: "citi-double-cash", label: "Citi Double Cash", reason: "Better for uncategorized purchases and simple flat earning." },
      { cardId: "us-bank-cash-plus", label: "U.S. Bank Cash+", reason: "More category choice for people willing to activate quarterly." },
    ],
  },
  "citi-double-cash": {
    take: "A straightforward no-fee card for everyday purchases that do not earn a higher category bonus elsewhere. Its earn-when-buying and earn-when-paying structure reinforces the need to pay balances, but it should never be interpreted as a reason to carry debt. The foreign transaction fee limits its usefulness abroad.",
    bestFor: ["People wanting a strong flat domestic return", "Citi ThankYou users seeking a base-earning card", "Cardholders building a simple two-card setup"],
    notFor: ["International travelers", "People seeking elevated category rewards", "Anyone who may carry a balance and pay interest"],
    breakEven: "There is no annual fee, so compare its flat rewards with category cards and account for foreign transaction costs. Any credit-card interest overwhelms the rewards quickly; the model only works when the statement is paid in full.",
    alternatives: [
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Another no-fee flat cash option with different issuer terms." },
      { cardId: "citi-custom-cash", label: "Citi Custom Cash", reason: "Higher return on one capped eligible category." },
    ],
  },
  "discover-it": {
    take: "A no-fee rotating-category card with meaningful upside for cardholders who activate each quarter and can use the published categories naturally. It is less effective as an only card because non-category purchases earn a low base return. Acceptance outside the US and category predictability should also be considered before relying on it for travel.",
    bestFor: ["People who enjoy quarterly category optimization", "Budgeters able to track activation and caps", "Someone pairing it with a flat-rate card"],
    notFor: ["People who forget activation", "Anyone wanting stable categories year-round", "Travelers who require the broadest international acceptance"],
    breakEven: "Calculate expected category spending quarter by quarter, capped at the eligible amount, and compare the incremental return with a flat-rate card. Do not assume every quarter will match your budget equally well.",
    alternatives: [
      { cardId: "chase-freedom-flex", label: "Chase Freedom Flex", reason: "Rotating categories plus fixed dining and drugstore bonuses." },
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "No activation or category-calendar maintenance." },
    ],
  },
  "wells-fargo-autograph": {
    take: "A broad no-fee travel-and-everyday category card with useful earning across travel, dining, gas, transit, and streaming. It is attractive for someone who wants several stable categories without paying an annual fee. The base rate on purchases outside those categories remains modest, so a flat-rate companion card can improve the setup.",
    bestFor: ["Travel and commuting spenders avoiding annual fees", "People who prefer stable categories over rotating ones", "International travelers benefiting from no foreign transaction fee"],
    notFor: ["People seeking premium lounge benefits", "Heavy uncategorized spenders using only one card", "Anyone whose merchants do not code into the advertised categories"],
    breakEven: "With no fee, compare category earnings against a flat-rate card using your actual merchant mix. The value comes from repeated category use, not from forcing travel or streaming purchases to fit the card.",
    alternatives: [
      { cardId: "capital-one-savorone", label: "Capital One SavorOne", reason: "Stronger focus on dining and entertainment." },
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Adds a broader transferable-points and protections package for a fee." },
    ],
  },
  "us-bank-cash-plus": {
    take: "A flexible no-fee cash-back card that can be unusually valuable for categories such as utilities or cell-phone bills, but it requires quarterly selection and has a combined spending cap. The best strategy is to assign it two predictable categories and avoid using it as an unplanned catch-all card.",
    bestFor: ["People with predictable bills in selectable categories", "Cardholders willing to activate categories quarterly", "Households building a multi-card cash-back setup"],
    notFor: ["People who dislike activation and category lists", "High spenders who exceed the quarterly cap", "Anyone wanting transferable travel points"],
    breakEven: "Estimate eligible spending in the two chosen categories only up to the quarterly cap. Compare the incremental cash back with a flat-rate card, and assign zero extra value if you are unlikely to remember activation.",
    alternatives: [
      { cardId: "citi-custom-cash", label: "Citi Custom Cash", reason: "Automatically targets one eligible top category each cycle." },
      { cardId: "wells-fargo-active-cash", label: "Wells Fargo Active Cash", reason: "Simpler flat earning with no activation." },
    ],
  },
  "amex-biz-gold": {
    take: "A business rewards card for owners whose operating expenses align with its strongest categories and who can use Membership Rewards productively. Its value should come from recurring business spend, not from moving personal purchases through a business account or treating merchant credits as automatic cash. The annual fee demands a clear category advantage over simpler no-fee business cards.",
    bestFor: ["Businesses with concentrated spend in eligible bonus categories", "Owners already using Membership Rewards transfer partners", "Operators who value flexible category recognition over a fixed category list"],
    notFor: ["Very small businesses with limited annual card spend", "Owners seeking simple cash back", "Anyone relying on temporary credits to justify the fee"],
    breakEven: "Compare the incremental value of bonus-category points with a no-fee business card using actual ledger totals. Discount credits that require new vendors or altered purchasing, and exclude the welcome offer from the renewal calculation.",
    alternatives: [
      { cardId: "chase-ink-biz-preferred", label: "Ink Business Preferred", reason: "Different transfer ecosystem and business-category mix at a mid-tier fee." },
      { cardId: "amex-blue-biz-plus", label: "Blue Business Plus", reason: "No-fee Membership Rewards option for smaller spend." },
    ],
  },
  "amex-biz-platinum": {
    take: "A premium business travel card intended for firms that can repeatedly use its airport, travel, and business-service benefits. It is not an everyday earning solution for every company, and the large annual fee should be evaluated against company spending that already exists. A long credit list can create administrative work and encourage vendor choices that are poor for the business.",
    bestFor: ["Businesses with frequent employee air travel", "Companies already paying for several included services", "Owners who can use premium airport and hotel benefits repeatedly"],
    notFor: ["Low-travel businesses", "Owners wanting one simple high-earning card", "Companies that would add subscriptions merely to consume credits"],
    breakEven: "Use the prior year's accounting records to value benefits actually consumed by the business. Subtract lost discounts or preferred-vendor value, and compare rewards with the best lower-fee business alternative. The card should survive a conservative year-two calculation without its bonus.",
    alternatives: [
      { cardId: "amex-biz-gold", label: "American Express Business Gold", reason: "Better fit when category earning matters more than premium travel perks." },
      { cardId: "chase-sapphire-reserve-biz", label: "Sapphire Reserve for Business", reason: "Alternative premium ecosystem for businesses centered on Chase travel rewards." },
    ],
  },
  "amex-hilton-honors-aspire": {
    take: "A premium Hilton card for travelers who already choose Hilton often enough to use the status, property credits, and annual-night benefits. It can provide strong real value, but only when certificates fit available properties and credits replace planned stays. Hilton points and elite labels should not be valued as cash without considering award pricing and actual travel patterns.",
    bestFor: ["Frequent Hilton guests", "Travelers able to use annual-night awards before expiration", "People whose existing stays trigger the major resort and airline benefits"],
    notFor: ["Hotel free agents who choose the cheapest property", "Infrequent travelers", "Anyone booking extra stays solely to consume credits"],
    breakEven: "Value each free night at the cash price of a stay you would truly book, capped by what you would pay—not the property's highest retail price. Add conservative credit and status value, then subtract the fee and any premium paid to remain loyal to Hilton.",
    alternatives: [
      { cardId: "amex-hilton-surpass", label: "Hilton Honors Surpass", reason: "Lower-fee Hilton option when premium benefits are excessive." },
      { cardId: "chase-hyatt", label: "World of Hyatt Credit Card", reason: "Different hotel ecosystem with another annual-night proposition." },
    ],
  },
  "amex-hilton-surpass": {
    take: "A mid-tier Hilton card that can suit regular—but not necessarily constant—Hilton guests. The card is easiest to justify when its status and spending benefits improve stays already planned. It becomes weaker when the holder values Hilton points at aspirational rates or shifts hotel bookings away from better locations and prices simply to remain loyal.",
    bestFor: ["Regular Hilton guests seeking mid-tier benefits", "Travelers who can use Hilton credits naturally", "Cardholders working toward spend-based Hilton benefits"],
    notFor: ["People with little Hilton activity", "Hotel free agents", "Anyone preferring straightforward cash rewards"],
    breakEven: "Compare the fee with credits used on stays you already planned, incremental on-property benefits, and realistic point value. Include any extra room cost created by choosing Hilton over a cheaper equivalent property.",
    alternatives: [
      { cardId: "amex-hilton-honors", label: "Hilton Honors Card", reason: "No-fee Hilton entry for occasional guests." },
      { cardId: "amex-hilton-honors-aspire", label: "Hilton Honors Aspire", reason: "Premium option for travelers who can use more Hilton benefits." },
    ],
  },
  "amex-marriott-brilliant": {
    take: "A premium Marriott card for travelers already committed to the Bonvoy ecosystem. The annual free-night award, status, and credits can be valuable, but award availability and certificate restrictions matter more than the property's headline price. The card should not be used to rationalize expensive Marriott stays that would not otherwise win your comparison.",
    bestFor: ["Frequent Marriott guests", "Travelers who can redeem the annual certificate at a genuinely useful property", "Cardholders who benefit from the included status during existing stays"],
    notFor: ["Travelers who rarely stay with Marriott", "People who need fully flexible hotel choices", "Anyone valuing certificates by peak retail prices"],
    breakEven: "Use the lower of the room price you would actually pay or the value you personally receive from the certificate. Add status and credits only when they change the cost of planned stays, then subtract the annual fee and any loyalty premium.",
    alternatives: [
      { cardId: "chase-marriott-boundless", label: "Marriott Bonvoy Boundless", reason: "Lower-fee Marriott option with a simpler keeper case." },
      { cardId: "amex-hilton-honors-aspire", label: "Hilton Honors Aspire", reason: "Premium hotel alternative for travelers with stronger Hilton patterns." },
    ],
  },
  "chase-hyatt": {
    take: "A hotel card with a relatively focused value proposition: Hyatt loyalty benefits and an annual-night path for people who already stay with the chain. Hyatt's footprint is smaller than some competitors, so the card's value depends on whether useful properties exist where you travel—not only on point valuations.",
    bestFor: ["Travelers with repeat Hyatt stays", "People able to use the annual-night benefit organically", "Cardholders who value Hyatt status progress"],
    notFor: ["Travelers whose destinations lack convenient Hyatt properties", "People who choose hotels entirely by lowest price", "Anyone collecting hotel points without a redemption plan"],
    breakEven: "Value the annual-night benefit at a stay you would otherwise purchase and confirm that eligible properties fit your routes. Add incremental elite and earning value, then subtract any premium paid to choose Hyatt over a better alternative.",
    alternatives: [
      { cardId: "chase-ihg-premier", label: "IHG One Rewards Premier", reason: "Broader property footprint with a different annual-night structure." },
      { cardId: "chase-marriott-boundless", label: "Marriott Bonvoy Boundless", reason: "Consider when Marriott locations better match actual travel." },
    ],
  },
  "chase-ihg-premier": {
    take: "A mid-tier hotel card that can work well for travelers who use IHG properties and can redeem the annual-night benefit without contortions. The broad IHG footprint is useful, but point values can vary widely. Benefits should be judged against specific stays and routes rather than an average online valuation.",
    bestFor: ["Regular IHG guests", "Road-trip and international travelers who value IHG's footprint", "People able to use the annual-night benefit before expiration"],
    notFor: ["Travelers with no consistent IHG stays", "People seeking premium luxury-hotel treatment", "Anyone likely to let annual certificates expire"],
    breakEven: "Identify a realistic annual-night redemption first, then use the cash price you would pay as its value. Add status and point benefits from planned stays only; do not count speculative future trips.",
    alternatives: [
      { cardId: "chase-hyatt", label: "World of Hyatt Credit Card", reason: "Potentially stronger program value where Hyatt's footprint works." },
      { cardId: "chase-marriott-boundless", label: "Marriott Bonvoy Boundless", reason: "Alternative when Marriott properties better fit your destinations." },
    ],
  },
  "chase-marriott-boundless": {
    take: "A mainstream Marriott card whose keeper value usually rests on whether the annual certificate and Marriott-specific benefits fit existing travel. It can be easier to justify than a premium hotel card, but certificate availability and category limits still matter. The card is not a reason to pay more for Marriott when another hotel is clearly better.",
    bestFor: ["Occasional or regular Marriott guests", "Travelers with a repeatable annual certificate use", "People wanting a lower-fee Marriott card"],
    notFor: ["Travelers without useful Marriott properties on their routes", "People who regularly forget certificate deadlines", "Hotel free agents focused on cash price"],
    breakEven: "Find a likely certificate redemption and value it at the amount you would have paid for that stay. Add realistic on-property and point value, then compare the fee with a no-fee general travel card.",
    alternatives: [
      { cardId: "amex-marriott-brilliant", label: "Marriott Bonvoy Brilliant", reason: "Premium Marriott option for frequent guests who use more benefits." },
      { cardId: "chase-hyatt", label: "World of Hyatt Credit Card", reason: "Different hotel program with another annual-night proposition." },
    ],
  },
  "chase-united-explorer": {
    take: "A mid-tier United card for travelers who fly the airline often enough to use checked-bag, boarding, or other carrier-specific benefits. The strongest value comes from replacing fees on flights you would already book. United miles and airport perks are secondary if another carrier consistently offers better schedules or prices.",
    bestFor: ["Occasional United flyers who check bags", "Travelers near a United hub", "Cardholders who can use carrier benefits on planned trips"],
    notFor: ["Travelers who rarely fly United", "People who always buy the cheapest carrier", "Anyone valuing miles without checking award availability"],
    breakEven: "Count bag-fee and trip benefits only for United flights you expect to take, then add conservatively valued miles and subtract the annual fee. Include any fare premium paid to choose United over a better itinerary.",
    alternatives: [
      { cardId: "chase-united-quest", label: "United Quest", reason: "Higher-tier United option for more frequent flyers." },
      { cardId: "chase-sapphire-preferred", label: "Chase Sapphire Preferred", reason: "Airline-neutral transferable points and broader travel use." },
    ],
  },
  "chase-united-quest": {
    take: "A higher-fee United card for travelers with enough annual United activity to use its statement benefits, award features, and travel perks. It occupies an awkward middle ground when flying is inconsistent: more expensive than an entry airline card, but not a substitute for every premium airport benefit.",
    bestFor: ["Frequent United flyers", "Travelers redeeming United miles regularly", "Cardholders whose planned United purchases trigger the main recurring benefits"],
    notFor: ["Infrequent flyers", "People without practical United routes", "Travelers seeking airline-neutral rewards"],
    breakEven: "Use the previous year's United transactions to value credits, bag savings, and award benefits. Subtract any fare premium paid to remain loyal and exclude the welcome offer. If planned United activity is uncertain, a lower-fee or flexible card is safer.",
    alternatives: [
      { cardId: "chase-united-explorer", label: "United Explorer", reason: "Lower-fee fit for occasional United travelers." },
      { cardId: "chase-sapphire-reserve", label: "Chase Sapphire Reserve", reason: "Premium airline-neutral travel alternative." },
    ],
  },
};

export function getCardEditorial(cardId: string): CardEditorial | undefined {
  return CARD_EDITORIAL[cardId];
}
