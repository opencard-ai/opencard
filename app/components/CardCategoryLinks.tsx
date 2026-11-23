import Link from "next/link";
import { bestCategoriesForCard } from "@/lib/best-categories";

type RelatedLink = { path: string; en: string; zh: string };

// Short editorial links in the existing end-of-page comparison block.
const RELATED: Record<string, RelatedLink[]> = {
  "capital-one-quicksilver": [
    { path: "cards/capital-one-savor", en: "Compare Savor rewards", zh: "看看 Savor 的回饋" },
    { path: "guides/capital-one-quicksilver-vs-wells-fargo-active-cash", en: "Quicksilver vs. Active Cash", zh: "Quicksilver 和 Active Cash 怎麼選" },
  ],
  "capital-one-savor": [
    { path: "cards/capital-one-quicksilver", en: "Compare Quicksilver cash back", zh: "看看 Quicksilver 的現金回饋" },
    { path: "cards/capital-one-savorone", en: "Current SavorOne card", zh: "目前的 SavorOne 卡" },
  ],
  "barclays-banana-republic-rewards-mastercard": [
    { path: "guides/old-navy-vs-banana-republic-credit-card", en: "Banana Republic benefits & Old Navy comparison", zh: "Banana Republic 福利與 Old Navy 比較" },
  ],
  "boa-biz-advantage-travel": [
    { path: "guides/boa-business-advantage-travel-vs-unlimited-cash", en: "Business Travel Rewards vs. Unlimited Cash", zh: "商務 Travel Rewards 和 Unlimited Cash 怎麼選" },
    { path: "best/business-credit-cards", en: "Compare Chase & Capital One business cards", zh: "比較 Chase 和 Capital One 商務卡" },
  ],
};

/**
 * Self-contained "compare with the category page" link block for card pages.
 * Category data: lib/best-categories.ts; selected editorial comparisons above.
 * Only en and zh have category pages; other locales link to the en page.
 */
export default function CardCategoryLinks({ cardId, lang }: { cardId: string; lang: string }) {
  const categories = bestCategoriesForCard(cardId);
  const related = RELATED[cardId] || [];
  if (categories.length === 0 && related.length === 0) return null;
  const isZh = lang === "zh";
  return (
    <>
      {related.length > 0 && (
        <nav aria-label={isZh ? "延伸閱讀" : "Related reading"} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-sm space-y-2">
          {related.map((link) => (
            <Link key={link.path} href={`/${isZh ? "zh" : "en"}/${link.path}`} className="block text-blue-600 dark:text-blue-400 hover:underline">
              {isZh ? link.zh : link.en}
            </Link>
          ))}
        </nav>
      )}
      {categories.map((category) => (
        <div key={category.slug} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-sm">
          <Link href={`/${isZh ? "zh" : "en"}/best/${category.slug}`} className="text-blue-600 dark:text-blue-400 hover:underline">
            {isZh ? `跟同類卡比一比：${category.title.zh}` : `See how it compares: ${category.title.en}`}
          </Link>
        </div>
      ))}
    </>
  );
}
