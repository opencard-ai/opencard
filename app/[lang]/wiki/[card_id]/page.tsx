import { getAllCards } from "@/lib/cards";
import { t, locales } from "@/lib/i18n";
import Link from "next/link";

type Props = {
  params: Promise<{ lang: string; card_id: string }>;
};

export async function generateStaticParams() {
  const cards = getAllCards();
  return locales.flatMap(lang =>
    cards.map(card => ({ lang, card_id: card.card_id }))
  );
}

export default async function WikiCardPage({ params }: Props) {
  const { lang, card_id } = await params;
  const cards = getAllCards();
  const card = cards.find(c => c.card_id === card_id);

  if (!card) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Card not found</h1>
        <Link href={`/${lang}/cards`} className="text-blue-600 hover:underline">
          ← Back to all cards
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">💳</span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{card.name}</h1>
              <p className="text-slate-500 text-sm">{card.issuer} · {card.network}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {card.tags.map(tag => (
              <span key={tag} className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-1">
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <Link
          href={`/${lang}/cards`}
          className="text-sm text-slate-500 hover:text-blue-600 mt-1"
        >
          ← {lang === "zh" ? "所有卡片" : lang === "es" ? "Todas las tarjetas" : "All Cards"}
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBox
          label={lang === "zh" ? "年費" : lang === "es" ? "Cuota Anual" : "Annual Fee"}
          value={`$${card.annual_fee}`}
          highlight={card.annual_fee === 0}
        />
        <StatBox
          label={lang === "zh" ? "國外交易手續費" : lang === "es" ? "Comisión en Extranjero" : "Foreign Fee"}
          value={card.foreign_transaction_fee === 0 ? "None" : `${card.foreign_transaction_fee}%`}
        />
        <StatBox
          label={lang === "zh" ? "開卡禮" : lang === "es" ? "Bono de Bienvenida" : "Welcome Bonus"}
          value={card.welcome_offer ? `${((card.welcome_offer.bonus_points ?? 0) / 1000).toFixed(0)}K pts` : "N/A"}
          highlight
        />
        <StatBox
          label={lang === "zh" ? "信用要求" : lang === "es" ? "Crédito Requerido" : "Credit Required"}
          value={card.credit_required}
        />
      </div>

      {/* Earning Rates */}
      <Section title={lang === "zh" ? "回饋結構" : lang === "es" ? "Tasas de Recompra" : "Earning Rates"}>
        <div className="space-y-2">
          {card.earning_rates.map((rate, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div>
                <span className="font-medium text-slate-800">{rate.category}</span>
                {rate.notes && <span className="text-slate-400 text-xs ml-2">({rate.notes})</span>}
              </div>
              <span className="font-bold text-blue-600">{rate.rate}×</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Annual Credits */}
      {card.annual_credits && card.annual_credits.length > 0 && (
        <Section title={lang === "zh" ? "年度回饋" : lang === "es" ? "Créditos Anuales" : "Annual Credits"}>
          <div className="space-y-2">
            {card.annual_credits.map((credit, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-slate-700">{credit.name}</span>
                <span className="font-bold text-green-600">${credit.amount}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Travel Benefits */}
      {card.travel_benefits && (
        <Section title={lang === "zh" ? "旅遊福利" : lang === "es" ? "Beneficios de Viaje" : "Travel Benefits"}>
          {card.travel_benefits.lounge_access && card.travel_benefits.lounge_access.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {lang === "zh" ? "貴賓室" : lang === "es" ? "Salas VIP" : "Lounge Access"}
              </h4>
              <div className="flex flex-wrap gap-2">
                {card.travel_benefits.lounge_access.map((l, i) => (
                  <span key={i} className="text-sm bg-slate-100 text-slate-700 rounded px-2 py-1">
                    🛋 {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {card.travel_benefits.other_benefits && card.travel_benefits.other_benefits.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {lang === "zh" ? "其他" : lang === "es" ? "Otros" : "Other"}
              </h4>
              <div className="space-y-1">
                {card.travel_benefits.other_benefits.map((b, i) => (
                  <div key={i} className="text-sm text-slate-700">• {b.description || b.name}</div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Insurance */}
      {card.insurance && (
        <Section title={lang === "zh" ? "保險保障" : lang === "es" ? "Seguros" : "Insurance"}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { k: "rental_insurance", zh: "租車保險", es: "Seguro de Auto", en: "Rental Insurance" },
              { k: "trip_cancellation", zh: "旅遊取消險", es: "Cancelación de Viaje", en: "Trip Cancellation" },
              { k: "trip_delay", zh: "旅遊延誤險", es: "Retraso de Viaje", en: "Trip Delay" },
              { k: "purchase_protection", zh: "購物保障", es: "Protección de Compra", en: "Purchase Protection" },
              { k: "extended_warranty", zh: "延長保固", es: "Garantía Extendida", en: "Extended Warranty" },
            ].map(item => {
              const val = card.insurance?.[item.k as keyof typeof card.insurance];
              if (!val) return null;
              const label = lang === "zh" ? item.zh : lang === "es" ? item.es : item.en;
              return (
                <div key={item.k} className="flex items-center gap-2 text-sm">
                  <span className="text-green-500">✓</span>
                  <span className="text-slate-700">{label}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Application Rules */}
      {card.application_rules && (
        <Section title={lang === "zh" ? "申請規則" : lang === "es" ? "Reglas de Aplicación" : "Application Rules"}>
          <div className="space-y-1">
            {card.application_rules.rules?.map((rule, i) => (
              <div key={i} className="text-sm text-slate-700">• {rule}</div>
            ))}
            {card.application_rules.notes && (
              <div className="text-sm text-amber-600 mt-2">⚠ {card.application_rules.notes}</div>
            )}
          </div>
        </Section>
      )}

      {/* Sources */}
      {card.sources && card.sources.length > 0 && (
        <Section title={lang === "zh" ? "資料來源" : lang === "es" ? "Fuentes" : "Sources"}>
          <div className="space-y-1">
            {card.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline block"
              >
                → {s.url}
              </a>
            ))}
          </div>
        </Section>
      )}

      <p className="text-xs text-slate-400 text-center">
        {lang === "zh" ? "最後更新" : lang === "es" ? "Última actualización" : "Last updated"}: {card.last_updated}
      </p>
    </div>
  );
}

function StatBox({ label, value, highlight }: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-blue-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}
