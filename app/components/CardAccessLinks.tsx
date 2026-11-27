import { isClosedToNewApplicants, type CreditCard } from "@/lib/cards";
import { getCardLinks } from "@/lib/card-links";
import { knownNoForeignFee } from "@/lib/foreign-fee";

/**
 * Self-contained "Fees & how to apply, log in or pay" section for card pages.
 * Data: lib/card-links.ts (hand-verified official URLs). Renders nothing for
 * cards without a verified entry. Insert once in the card page; no other
 * page changes needed.
 */
export default function CardAccessLinks({ card, lang, l }: {
  card: CreditCard;
  lang: string;
  l: (key: string, params?: Record<string, string | number>) => string;
}) {
  const links = getCardLinks(card.card_id);
  if (!links) return null;

  const lateFee = card.late_fee ?? card.late_fee_max;
  const officialLinks = [
    ...(!isClosedToNewApplicants(card) && links.applyUrl ? [{ href: links.applyUrl, label: l("detail.applyOfficial") }] : []),
    ...(links.loginUrl ? [{ href: links.loginUrl, label: l(links.payUrl ? "detail.loginAccount" : "detail.loginOrPay") }] : []),
    ...(links.payUrl ? [{ href: links.payUrl, label: l("detail.payBill") }] : []),
  ];

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6" aria-labelledby="fees-and-links">
      <h2 id="fees-and-links" className="text-lg font-bold text-slate-900 mb-4">{l("detail.feesAndLinks")}</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
        <li>{l("card.annualFee")}: {card.annual_fee === 0 ? l("detail.noAnnualFee") : Number.isFinite(card.annual_fee) ? `$${card.annual_fee.toLocaleString("en-US")}` : "—"}</li>
        {knownNoForeignFee(card) ? (
          <li>{l("detail.foreignFee")}: {l("detail.none")}</li>
        ) : card.foreign_transaction_fee > 0 ? (
          <li>{l("detail.foreignFee")}: {card.foreign_transaction_fee}%</li>
        ) : null}
        {typeof lateFee === "number" && lateFee > 0 && (
          <li>{l("detail.lateFee")}: {l("detail.feeUpTo", { amount: lateFee })}</li>
        )}
        {links.feeNotes?.map((note) => <li key={note} lang={lang === "en" ? undefined : "en"}>{note}</li>)}
      </ul>
      {(officialLinks.length > 0 || links.phone) && (
      <ul className="mt-4 space-y-2 text-sm">
        {officialLinks.map((link) => (
          <li key={link.label}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
              {link.label}<span className="sr-only"> {l("detail.opensNewTab")}</span>
            </a>
          </li>
        ))}
        {links.phone && (
          <li>
            <a href={`tel:+1${links.phone.replace(/\D/g, "").replace(/^1/, "")}`} className="text-blue-600 underline hover:text-blue-800">{l("detail.customerService")}: {links.phone}</a>
          </li>
        )}
      </ul>
      )}
      <div className="mt-4 space-y-1 text-xs text-slate-500">
        <p>{l("detail.linksVerified", { verified: links.verified })}</p>
        <p>{l("detail.linksUnpaid")}</p>
      </div>
    </section>
  );
}
