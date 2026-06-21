import Link from "next/link";
import type { BenefitVerdict } from "@/lib/cardstay/types";

export default function CardStayPlaceCard({ lang, place }: { lang: string; place: BenefitVerdict }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{place.city}</div>
          <h3 className="text-lg font-bold text-slate-900">{place.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{place.summary}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {place.fit_label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {place.eligible_benefits.map((benefit) => (
          <span key={benefit.program} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {benefit.program}
          </span>
        ))}
      </div>

      <div className="mt-4 text-sm text-slate-600">
        {place.eligible_benefits.length > 0 ? (
          <p>{place.eligible_benefits.map((benefit) => benefit.reasons[0]).join(" · ")}</p>
        ) : (
          <p>No eligible benefits found yet.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-slate-500">Confidence: {place.confidence}</div>
        <Link href={`/${lang}/stay/hotel/${place.slug}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
          View hotel →
        </Link>
      </div>
    </div>
  );
}
