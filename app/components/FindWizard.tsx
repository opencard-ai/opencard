"use client";

import { useState, useMemo } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import CardRow from "./CardRow";
import type { CreditCard } from "@/lib/cards";

type SpendKey = "cashback" | "travel" | "dining" | "business" | "lounge";
type FeeKey = "free" | "low" | "mid" | "high";
type CreditKey = "excellent" | "good" | "fair" | "building";

interface Props {
  cards: CreditCard[];
  lang: string;
}

const STR = {
  en: {
    step: "Step", of: "of",
    q1: "What do you spend on most?", q2: "Annual fee tolerance?", q3: "Credit profile?",
    spend: { cashback: "Cash back / everyday", travel: "Travel & flights", dining: "Dining out", business: "Business expenses", lounge: "Airport lounges" } as Record<SpendKey, string>,
    fee: { free: "$0 only", low: "Up to $99", mid: "Up to $300", high: "$300+" } as Record<FeeKey, string>,
    cred: { excellent: "Excellent (760+)", good: "Good (700–759)", fair: "Fair (640–699)", building: "Building / new" } as Record<CreditKey, string>,
    back: "Back", restart: "Start over", title: "Top picks for you", noResults: "No cards match — try loosening the filters.",
    relaxedFee: "No card fit your annual-fee cap. Showing the closest options instead:",
    relaxedCredit: "No card matched that credit profile. Showing the closest options instead:",
    cta: "Find cards", subtitle: "Three questions, five recommendations.",
  },
  zh: {
    step: "第", of: "/",
    q1: "你最常花什麼?", q2: "年費接受度?", q3: "信用評分?",
    spend: { cashback: "現金回饋 / 日常", travel: "旅遊 & 機票", dining: "餐廳", business: "商務消費", lounge: "機場貴賓室" } as Record<SpendKey, string>,
    fee: { free: "只要免年費", low: "$99 以內", mid: "$300 以內", high: "$300+" } as Record<FeeKey, string>,
    cred: { excellent: "優 (760+)", good: "良 (700–759)", fair: "尚可 (640–699)", building: "重建 / 新戶" } as Record<CreditKey, string>,
    back: "上一題", restart: "重來", title: "為你推薦", noResults: "找不到符合的卡片 — 試試放寬條件。",
    relaxedFee: "沒有符合年費上限的卡。改顯示接近條件的卡:",
    relaxedCredit: "沒有符合信用條件的卡。改顯示接近條件的卡:",
    cta: "開始挑卡", subtitle: "回答 3 題,推薦 5 卡。",
  },
  es: {
    step: "Paso", of: "de",
    q1: "¿En qué gastas más?", q2: "¿Tolerancia de cuota anual?", q3: "¿Perfil crediticio?",
    spend: { cashback: "Reembolso / diario", travel: "Viajes & vuelos", dining: "Restaurantes", business: "Negocios", lounge: "Salones de aeropuerto" } as Record<SpendKey, string>,
    fee: { free: "Solo $0", low: "Hasta $99", mid: "Hasta $300", high: "$300+" } as Record<FeeKey, string>,
    cred: { excellent: "Excelente (760+)", good: "Bueno (700–759)", fair: "Regular (640–699)", building: "Construyendo / nuevo" } as Record<CreditKey, string>,
    back: "Atrás", restart: "Reiniciar", title: "Recomendadas para ti", noResults: "Ninguna tarjeta coincide — afloja los filtros.",
    relaxedFee: "Ninguna tarjeta cumple el límite de cuota. Mostrando opciones cercanas:",
    relaxedCredit: "Ninguna tarjeta coincide con ese perfil. Mostrando opciones cercanas:",
    cta: "Encontrar tarjetas", subtitle: "Tres preguntas, cinco recomendaciones.",
  },
};

type Lang = keyof typeof STR;

function matchesSpend(card: CreditCard, spend: SpendKey): boolean {
  const tags = (card.tags || []).map((t) => t.toLowerCase());
  const cats = (card.earning_rates || []).map((r) => r.category.toLowerCase());
  if (spend === "cashback") return tags.includes("cash-back") || cats.some((c) => /all purchases|flat|rotating/.test(c));
  if (spend === "travel") return tags.some((t) => ["travel", "airline", "hotel", "transferable"].includes(t));
  if (spend === "dining") return tags.includes("dining") || cats.some((c) => /restaurant|dining/.test(c));
  if (spend === "business") return tags.includes("business");
  if (spend === "lounge") return tags.includes("lounge-access") || (card.travel_benefits?.lounge_access?.length ?? 0) > 0;
  return false;
}

function matchesFee(card: CreditCard, fee: FeeKey): boolean {
  const af = card.annual_fee || 0;
  if (fee === "free") return af === 0;
  if (fee === "low") return af <= 99;
  if (fee === "mid") return af <= 300;
  return true;
}

function matchesCredit(card: CreditCard, cred: CreditKey): boolean {
  const cr = (card.credit_required || "").toLowerCase();
  const tags = (card.tags || []);
  if (cred === "excellent") return true;
  if (cred === "good") return /good|fair/.test(cr) && !/excellent only/.test(cr);
  if (cred === "fair") return /fair|poor|new|limited/.test(cr);
  if (cred === "building") return /poor|new|limited/.test(cr) || tags.includes("secured") || tags.includes("student");
  return true;
}

function rank(a: CreditCard, b: CreditCard): number {
  if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
  const av = a.welcome_offer?.estimated_value ?? 0;
  const bv = b.welcome_offer?.estimated_value ?? 0;
  if (bv !== av) return bv - av;
  return a.name.localeCompare(b.name);
}

export default function FindWizard({ cards, lang }: Props) {
  const t = STR[(lang as Lang) in STR ? (lang as Lang) : "en"];
  const [step, setStep] = useState(0);
  const [spend, setSpend] = useState<SpendKey | null>(null);
  const [fee, setFee] = useState<FeeKey | null>(null);
  const [cred, setCred] = useState<CreditKey | null>(null);

  const results = useMemo(() => {
    if (!spend || !fee || !cred) return { cards: [] as CreditCard[], relaxed: null as null | "fee" | "credit" };
    const strict = cards
      .filter((c) => matchesSpend(c, spend) && matchesFee(c, fee) && matchesCredit(c, cred))
      .sort(rank)
      .slice(0, 5);
    if (strict.length > 0) return { cards: strict, relaxed: null };
    // Strict filter empty — try loosening fee first (usually the binding
    // constraint: the spend-type itself is the user's main intent), then
    // credit. Whichever yields ≥1 result first becomes the suggestion.
    const noFee = cards
      .filter((c) => matchesSpend(c, spend) && matchesCredit(c, cred))
      .sort(rank)
      .slice(0, 5);
    if (noFee.length > 0) return { cards: noFee, relaxed: "fee" as const };
    const noCred = cards
      .filter((c) => matchesSpend(c, spend) && matchesFee(c, fee))
      .sort(rank)
      .slice(0, 5);
    if (noCred.length > 0) return { cards: noCred, relaxed: "credit" as const };
    return { cards: [], relaxed: null };
  }, [cards, spend, fee, cred]);

  const reset = () => { setStep(0); setSpend(null); setFee(null); setCred(null); };
  const back = () => { if (step > 0) setStep(step - 1); };

  const Pill = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-5 py-4 rounded-xl border-2 transition-all ${
        selected
          ? "border-blue-500 bg-blue-50 text-blue-900 font-semibold"
          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
      }`}
    >
      {label}
    </button>
  );

  const totalSteps = 3;
  const done = step === 3;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {!done && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {t.step} {step + 1} {t.of} {totalSteps}
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-blue-500" : "bg-slate-200"}`} />
              ))}
            </div>
          </div>
        </>
      )}

      {step === 0 && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">{t.q1}</h1>
          <p className="text-sm text-slate-500 mb-6">{t.subtitle}</p>
          <div className="grid grid-cols-1 gap-3">
            {(Object.keys(t.spend) as SpendKey[]).map((k) => (
              <Pill
                key={k}
                label={t.spend[k]}
                selected={spend === k}
                onClick={() => { setSpend(k); setStep(1); }}
              />
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-6">{t.q2}</h1>
          <div className="grid grid-cols-1 gap-3">
            {(Object.keys(t.fee) as FeeKey[]).map((k) => (
              <Pill
                key={k}
                label={t.fee[k]}
                selected={fee === k}
                onClick={() => { setFee(k); setStep(2); }}
              />
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-6">{t.q3}</h1>
          <div className="grid grid-cols-1 gap-3">
            {(Object.keys(t.cred) as CreditKey[]).map((k) => (
              <Pill
                key={k}
                label={t.cred[k]}
                selected={cred === k}
                onClick={() => { setCred(k); setStep(3); }}
              />
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t.restart}
            </button>
          </div>
          {results.cards.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t.noResults}</p>
          ) : (
            <>
              {results.relaxed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
                  {results.relaxed === "fee" ? t.relaxedFee : t.relaxedCredit}
                </div>
              )}
              <div className="space-y-2">
                {results.cards.map((card) => (
                  <CardRow
                    key={card.card_id}
                    card={card}
                    lang={lang}
                    locale={lang}
                    isCompared={false}
                    isMaxed={false}
                    onToggleCompare={() => { /* noop on wizard results */ }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {step > 0 && step < 3 && (
        <button
          type="button"
          onClick={back}
          className="mt-6 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {t.back}
        </button>
      )}
    </div>
  );
}
