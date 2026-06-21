import Link from "next/link";

export default function CardStayWidget({ lang }: { lang: string }) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">CardStay</div>
          <h3 className="text-lg font-bold text-slate-900">Find hotels where your premium card benefits actually work.</h3>
          <p className="text-sm text-slate-600">Luxury hotel routing from your existing OpenCard wallet.</p>
        </div>
        <Link href={`/${lang}/stay`} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Open CardStay
        </Link>
      </div>
    </div>
  );
}
