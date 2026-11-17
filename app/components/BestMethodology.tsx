import Link from "next/link";

export default function BestMethodology({ lang }: { lang: "en" | "zh" }) {
  return (
    <aside className="mt-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
      <p>
        {lang === "zh"
          ? "這些頁面怎麼做的：我們只收錄在標示日期當天看過發卡機構官網條款的卡；每張的「最適合」只是照頁面上寫的標準、在列出的這幾張裡比較，不代表全市場。開卡禮常常變，所以不列入。這些比較頁沒有收任何發卡機構的錢，頁面上也沒有推薦或聯盟連結（個別卡片頁的揭露說明請看下方編輯方法）。條款隨時會改，申請前請一定再到官網確認。"
          : "How these pages work: we only list cards whose terms we read on the issuer's own website on the date shown, and each pick is 'best' only against the criteria listed on the page, among the cards listed — not every card on the market. Welcome offers are left out because they change often. OpenCard isn't paid by any issuer for these comparison pages, and they contain no affiliate or referral links (see our methodology below for how card pages are disclosed). Terms change; always confirm on the issuer's site before you apply."}
      </p>
      <Link href={`/${lang}/methodology`} className="mt-3 inline-block underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300">
        {lang === "zh" ? "我們的編輯方法" : "Our editorial methodology"}
      </Link>
    </aside>
  );
}
