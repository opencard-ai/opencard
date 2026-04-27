# Card Removal Audit — 2026-04-27

Total cards: **249**

| Bucket | Count | Disposition |
|---|---|---|
| A. Discontinued / closed | 5 | already partly flagged |
| B. Store cards | 14 | recommend soft-deprecate |
| C. Subprime / secured | 11 | recommend keep 1-2 representative, soft-deprecate rest |
| D. Niche international | 4 | recommend soft-deprecate |
| E. Duplicate candidates | 29 | recommend dedup (keep canonical) |
| F. Business niche | 3 | recommend soft-deprecate |
| G. Keep (mainstream) | 183 | keep |

## A_discontinued (5)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `amex-everyday-preferred` | Amex EveryDay Preferred Credit Card | American Express | $95 | discontinued=true | already flagged discontinued=true |
| `barclays-aadvantage-red` | AAdvantage Aviator Red | Barclays | $99 | discontinued=true | already flagged discontinued=true |
| `capital-one-spark-miles-select` | Capital One Spark Miles Select for Business | Capital One | $0 | status=transferred | status=transferred |
| `chase-ritz-carlton` | Chase Ritz-Carlton Credit Card | Chase | $450 | discontinued=true | already flagged discontinued=true |
| `synchrony-sears-mastercard` | Sears Mastercard® | Synchrony | $0 | status=transferred | status=transferred |

## B_store_card (14)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `barclays-athleta-rewards-mastercard` | Athleta Rewards Mastercard® | Barclays | $0 | - | retailer name match: athleta rewards mastercard® |
| `barclays-banana-republic-rewards-mastercard` | Banana Republic Rewards Mastercard® | Barclays | $0 | - | retailer name match: banana republic rewards mastercard® |
| `barclays-gap-good-rewards-mastercard` | Gap Good Rewards Mastercard® | Barclays | $0 | - | retailer name match: gap good rewards mastercard® |
| `barclays-old-navy-navyist-rewards-mastercard` | Old Navy Navyist Rewards Mastercard® | Barclays | $0 | - | retailer name match: old navy navyist rewards mastercard® |
| `bread-cashback-american-express` | Bread Rewards™ American Express® Credit Card | Bread Financial | $0 | - | issuer=bread financial |
| `comenity-bed-bath-beyond-mastercard` | Bed Bath & Beyond Mastercard® | Bread Financial | $0 | - | issuer=bread financial |
| `comenity-kayak-credit-card` | KAYAK Credit Card | Bread Financial | $0 | - | issuer=bread financial |
| `comenity-ulta-beauty-mastercard` | Ulta Beauty Mastercard® | Bread Financial | $0 | - | issuer=bread financial |
| `kohls-charge` | Kohl's Charge Card | Capital One | $0 | - | retailer name match: kohl's charge card |
| `synchrony-amazon-store` | Amazon Store Card | Synchrony | $0 | - | Synchrony prefix |
| `synchrony-care-credit-rewards-mastercard` | CareCredit Rewards Mastercard® | Synchrony | $0 | - | Synchrony prefix |
| `synchrony-paypal-cashback-mastercard` | PayPal Cashback Mastercard® | Synchrony | $0 | - | Synchrony prefix |
| `synchrony-sams-club-mastercard` | Sam's Club® Mastercard® | Synchrony | $0 | - | Synchrony prefix |
| `synchrony-verizon-visa` | Verizon Visa® Card | Synchrony | $0 | - | Synchrony prefix |

## C_subprime (11)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `barclays-aarp-travel-rewards-mastercard` | AARP® Travel Rewards Mastercard® from Barclays | Barclays | $0 | - | credit_required=fair + low/no AF |
| `boa-alaska-airlines-visa-platinum` | Alaska Airlines Visa® Platinum Plus® Credit Card | Bank of America | $0 | - | credit_required=fair + low/no AF |
| `boa-customized-cash-rewards-secured` | Bank of America® Customized Cash Rewards Secured Credit Card | Bank of America | $0 | - | subprime/secured id pattern: boa-customized-cash-rewards-secured |
| `boa-student-travel-rewards` | Bank of America® Travel Rewards Credit Card for Students | Bank of America | $0 | - | credit_required=fair + low/no AF |
| `capital-one-journey-student` | Capital One Journey Student Credit Card | Capital One | $0 | - | credit_required=fair + low/no AF |
| `capital-one-quicksilver-one` | Capital One QuicksilverOne Cash Rewards Credit Card | Capital One | $39 | - | credit_required=fair + low/no AF |
| `capital-one-quicksilver-secured` | Capital One Quicksilver Secured Cash Rewards Credit Card | Capital One | $0 | - | subprime/secured id pattern: capital-one-quicksilver-secured |
| `citi-secured-mastercard` | Citi® Secured Mastercard® | Citi | $0 | - | subprime/secured id pattern: citi-secured-mastercard |
| `discover-it-secured` | Discover it® Secured Credit Card | Discover | $0 | - | subprime/secured id pattern: discover-it-secured |
| `petal-1-visa` | Petal 1 Visa | Petal | $0 | - | subprime/secured id pattern: petal-1-visa |
| `us-bank-altitude-go-secured` | U.S. Bank Altitude® Go Visa® Secured Card | U.S. Bank | $0 | - | subprime/secured id pattern: us-bank-altitude-go-secured |

## D_niche_international (4)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `cathay-world-elite` | Cathay World Elite Mastercard | Synchrony | $99 | - | niche international airline: cathay world elite mastercard |
| `chase-aer-lingus-visa-signature` | Aer Lingus Visa Signature® Card | Chase | $95 | - | niche international airline: aer lingus visa signature® card |
| `chase-iberia-visa-signature` | Iberia Visa Signature® Card | Chase | $95 | - | niche international airline: iberia visa signature® card |
| `emirates-skywards-mastercard` | Emirates Skywards Premium World Elite Mastercard® | Barclays | $499 | - | niche international airline: emirates skywards premium world elite mastercard® |

## E_duplicate_candidate (29)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `amazon-prime-visa` | Prime Visa | Chase | $0 | - | same name+issuer as amazon-visa |
| `amex-amazon-biz-prime` | Amazon Business Prime Card | American Express | $0 | - | same name+issuer as amex-amazon-biz |
| `amex-blue-cash-everyday` | Blue Cash Everyday® Card from American Express | American Express | $0 | - | same name+issuer as amex-bce |
| `amex-blue-cash-preferred` | Blue Cash Preferred® Card from American Express | American Express | $95 | - | same name+issuer as amex-bcp |
| `amex-delta-skymiles-gold-biz` | Delta SkyMiles® Gold Business American Express Card | American Express | $150 | _duplicate_of=amex-delta-gold-biz | same name+issuer as amex-delta-gold-biz |
| `amex-hilton-biz-platinum` | Hilton Business Platinum | American Express | $895 | - | same name+issuer as amex-biz-platinum |
| `barclays-aarp-essential-rewards-mastercard` | AARP® Essential Rewards Mastercard® from Barclays | Barclays | $0 | - | same name+issuer as barclays-aarp-travel-rewards-mastercard |
| `barclays-ubereats` | Uber Visa Card | Barclays | $0 | - | same name+issuer as barclays-uber |
| `boa-alaska-airlines-visa-signature` | Alaska Airlines Visa Signature® Credit Card | Bank of America | $64 | - | same name+issuer as boa-alaska-ascent |
| `boa-biz-advantage-customized-cash` | Bank of America® Business Advantage Customized Cash Rewards Mastercard® | Bank of America | $0 | - | same name+issuer as boa-biz-advantage-unlimited-cash |
| `boa-customized-cash-rewards` | Bank of America® Customized Cash Rewards Credit Card | Bank of America | $0 | - | same name+issuer as boa-unlimited-cash-rewards |
| `boa-student-customized-cash-rewards` | Bank of America® Customized Cash Rewards Credit Card for Students | Bank of America | $0 | - | same name+issuer as boa-student-travel-rewards |
| `capital-one-quicksilver` | Capital One Quicksilver Cash Rewards Credit Card | Capital One | $0 | - | same name+issuer as capital-one-savor-one |
| `capital-one-savor-one` | Capital One SavorOne Cash Rewards | Capital One | $0 | - | same name+issuer as capital-one-savor |
| `chase-disney-visa` | Chase Disney Visa Card | Chase | $0 | - | same name+issuer as chase-disney |
| `chase-ink-biz-unlimited` | Chase Ink Business Unlimited® Credit Card | Chase | $0 | - | same name+issuer as chase-ink-biz-cash |
| `citi-american-airlines-mastercard` | American Airlines AAdvantage® Mastercard® (Citi) | Citi | $0 | - | same name+issuer as citi-aadvantage-mileup |
| `costco-anywhere-visa-business-citi` | Costco Anywhere Visa® Business Card by Citi | Citi | $0 | - | same name+issuer as citi-costco-biz |
| `delta-skymiles-blue-amex` | Delta SkyMiles® Blue American Express Card | American Express | $0 | - | same name+issuer as amex-delta-blue |
| `navy-federal-flagship-rewards` | Navy Federal Flagship Rewards® Credit Card | Navy Federal Credit Union | $0 | - | same name+issuer as navy-federal-go-rewards |
| `petal-2-visa` | Petal 2 Visa | Petal | $0 | - | same name+issuer as petal-1-visa |
| `synchrony-amazon-prime-store-card` | Amazon Prime Store Card | Synchrony | $0 | - | same name+issuer as synchrony-amazon-store |
| `us-bank-altitude-connect` | U.S. Bank Altitude® Connect Visa Signature® Card | U.S. Bank | $0 | - | same name+issuer as us-bank-altitude-go |
| `us-bank-altitude-connect-biz` | Altitude Connect Business | U.S. Bank | $0 | - | same name+issuer as us-bank-altitude-go-biz |
| `us-bank-biz-altitude-connect` | U.S. Bank Business Altitude® Connect Visa Signature® Card | U.S. Bank | $95 | - | same name+issuer as us-bank-biz-leverage-visa |
| `wells-fargo-signify-biz-cash` | Wells Fargo Signify Business Cash® Card | Wells Fargo | $0 | - | same name+issuer as wells-fargo-active-cash-biz |
| `wyndham-rewards-earner-barclays` | Wyndham Rewards Earner Card | Barclays | $0 | - | same name+issuer as barclays-wyndham-earner |
| `wyndham-rewards-earner-business-barclays` | Wyndham Rewards Earner® Business Card | Barclays | $95 | - | same name+issuer as barclays-wyndham-earner-biz |
| `wyndham-rewards-earner-plus-barclays` | Wyndham Rewards Earner Plus Card | Barclays | $75 | - | same name+issuer as barclays-wyndham-earner-plus |

## F_business_niche (3)

| card_id | name | issuer | AF | already flagged | reason |
|---|---|---|---|---|---|
| `barclays-jetblue-biz` | JetBlue Business Card | Barclays | $99 | - | niche partner business card: barclays-jetblue-biz (barclays, $99) |
| `barclays-wyndham-earner-biz` | Wyndham Earner Business | Barclays | $95 | - | niche partner business card: barclays-wyndham-earner-biz (barclays, $95) |
| `barclays-wyndham-earner-plus-biz` | Wyndham Earner+ Business | Barclays | $95 | - | niche partner business card: barclays-wyndham-earner-plus-biz (barclays, $95) |
