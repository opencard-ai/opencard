import Link from "next/link";
import { bestCategoriesForCard } from "@/lib/best-categories";

/**
 * Self-contained "compare with the category page" link block for card pages.
 * Data: lib/best-categories.ts. Renders nothing for cards not in a category.
 * Only en and zh have category pages; other locales link to the en page.
 */
export default function CardCategoryLinks({ cardId, lang }: { cardId: string; lang: string }) {
  const categories = bestCategoriesForCard(cardId);
  if (categories.length === 0) return null;
  const isZh = lang === "zh";
  return (
    <>
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
