import Link from "next/link";
import type { CardAnalysis } from "@/lib/card-analysis";
import { faqJsonLd } from "@/lib/card-analysis";
import type { EditorNote } from "@/lib/card-notes";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/** English-only, data-derived analysis block for card detail pages. */
export default function CardAnalysisSection({
  cardId,
  cardName,
  analysis,
  editorNote,
  reviewedDate,
}: {
  cardId: string;
  cardName: string;
  analysis: CardAnalysis;
  editorNote?: EditorNote;
  reviewedDate?: string;
}) {
  const { estimate, credits } = analysis;
  const jsonLd = JSON.stringify(faqJsonLd(analysis.faq)).replace(/</g, "\\u003c");
  return (
    <section className="bg-white rounded-xl border border-blue-200 p-6" aria-labelledby="opencard-analysis">
      <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">OpenCard analysis</div>
      <h2 id="opencard-analysis" className="text-lg font-bold text-slate-900 mb-3">Is the {cardName} right for you?</h2>
      <p className="text-sm text-slate-600 leading-relaxed">{analysis.summary}</p>

      {editorNote && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">Editor&apos;s note</h3>
          <p className="text-xs leading-relaxed text-blue-900">{editorNote.note}</p>
          <p className="mt-2 text-[11px] text-blue-700">Checked against the issuer&apos;s page on {editorNote.reviewed}.</p>
        </div>
      )}

      {(analysis.whoFor.length > 0 || analysis.skipIf.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          {analysis.whoFor.length > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-4">
              <h3 className="text-sm font-semibold text-emerald-900 mb-2">Who it&apos;s for</h3>
              <ul className="space-y-1.5 text-xs text-emerald-900">
                {analysis.whoFor.map((item) => <li key={item}>✓ {item}</li>)}
              </ul>
            </div>
          )}
          {analysis.skipIf.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-4">
              <h3 className="text-sm font-semibold text-amber-900 mb-2">Who should skip it</h3>
              <ul className="space-y-1.5 text-xs text-amber-900">
                {analysis.skipIf.map((item) => <li key={item}>— {item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">First-year value estimate</h3>
        <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Welcome bonus</div><div className="text-lg font-bold text-slate-900">{usd(estimate.welcomeValue)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Rewards on spending</div><div className="text-lg font-bold text-slate-900">{usd(estimate.earningValue)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Annual fee (year 1)</div><div className="text-lg font-bold text-slate-900">−{usd(estimate.firstYearFee)}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-slate-500">Year 1, before credits</div><div className="text-lg font-bold text-slate-900">{usd(estimate.firstYearBeforeCredits)}</div></div>
        </div>
        <p className="mt-3 text-xs text-slate-600">Year two, without the welcome bonus: about <strong>{usd(estimate.ongoingBeforeCredits)}</strong> before credits ({usd(estimate.earningValue)} in rewards minus the {usd(estimate.ongoingFee)} fee).</p>
        <h4 className="mt-3 text-xs font-semibold text-slate-800">Assumptions</h4>
        <ul className="mt-1 list-disc pl-5 space-y-1 text-xs text-slate-600">
          {estimate.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">An illustration, not a promise of value. Change the spending to match yours; rewards are not cash until redeemed.{reviewedDate ? ` Card data reviewed ${reviewedDate}.` : ""}</p>
      </div>

      {credits && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">How the fee is offset by credits</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{credits.verdict}</p>
          {credits.lines.length > 0 && (
            <table className="mt-3 w-full text-xs">
              <thead><tr className="text-left text-slate-500"><th className="py-1 font-medium">Credit</th><th className="py-1 font-medium">Terms</th><th className="py-1 font-medium text-right">Per year (face value)</th></tr></thead>
              <tbody>
                {credits.lines.map((line) => (
                  <tr key={line.name} className="border-t border-slate-100"><td className="py-1.5 pr-2 text-slate-800">{line.name}</td><td className="py-1.5 pr-2 text-slate-600">{line.note}</td><td className="py-1.5 text-right text-slate-800">{usd(line.annualValue)}</td></tr>
                ))}
                <tr className="border-t border-slate-300 font-semibold"><td className="py-1.5" colSpan={2}>Total face value</td><td className="py-1.5 text-right">{usd(credits.faceValueAnnual)}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {analysis.comparisons.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">How it compares</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {analysis.comparisons.map((c) => (
              <Link key={c.cardId} href={`/en/cards/${c.cardId}`} className="rounded-lg border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                <div className="text-sm font-semibold text-blue-700">{c.name} →</div>
                <div className="text-xs text-slate-500 mt-1">{c.reason}</div>
              </Link>
            ))}
          </div>
          <a className="mt-2 inline-block text-xs font-semibold text-blue-700" href={`/en/compare?cards=${[cardId, ...analysis.comparisons.map((c) => c.cardId)].slice(0, 3).join(",")}`}>Compare side by side →</a>
        </div>
      )}

      {analysis.gotchas.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Rules and gotchas</h3>
          <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
            {analysis.gotchas.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Frequently asked questions</h3>
        <dl className="space-y-3">
          {analysis.faq.map((f) => (
            <div key={f.question}>
              <dt className="text-xs font-semibold text-slate-800">{f.question}</dt>
              <dd className="mt-0.5 text-xs text-slate-600 leading-relaxed">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </section>
  );
}
