import { t, type Locale } from "@/lib/i18n";

/**
 * Inline FTC disclosure. Must sit immediately next to an affiliate link
 * (same line / adjacent), not only in a footer, so it is clear and conspicuous.
 */
export default function AffiliateDisclosure({ lang, className = "" }: { lang: Locale; className?: string }) {
  return (
    <span data-affiliate-disclosure="" className={`text-xs font-medium text-slate-700 ${className}`.trim()}>
      {t("affiliate.disclosure", lang)}
    </span>
  );
}
