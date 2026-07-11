import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { getStayCopy } from "@/lib/cardstay/copy";

export default function CardStayWidget({ lang }: { lang: string }) {
  const copy = getStayCopy(lang as Locale);
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">CardStay</div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{copy.beta}</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">{copy.title}</h3>
          <p className="text-sm text-slate-600">{copy.subtitle}</p>
        </div>
        <Link href={`/${lang}/stay`} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {copy.openStay}
        </Link>
      </div>
    </div>
  );
}
