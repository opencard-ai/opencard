"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Check, CreditCard } from "lucide-react";
import { computePeriodKey } from "@/lib/credit-periods";
import ReportErrorModal from "@/app/components/ReportErrorModal";
import OpenDateRow from "@/app/components/OpenDateRow";
import HelpHint from "@/app/components/HelpHint";
import CardArt from "@/app/components/CardArt";
import { toast } from "@/lib/toast";

const STORAGE_KEY = "opencard_existing_cards";
const SUBSCRIBED_EMAIL_KEY = "opencard_subscribed_email";

const MESSAGES = {
  en: {
    title: "My Cards",
    subtitle: "Your personal credit card benefits manager",
    emailSection: "Get monthly benefit reminders",
    emailHint: "Leave your email and we'll remind you when credits are about to expire.",
    emailPlaceholder: "your@email.com",
    subscribe: "Subscribe",
    subscribed: "Subscribed",
    marketingLabel: "I agree to receive personalized benefit reminders (no spam)",
    noCards: "No cards added yet",
    addCards: "Browse all cards",
    benefits: "Benefits & Credits",
    noBenefits: "No recurring benefits recorded",
    reportError: "Report error",
    setOpenDate: "Set date",
    errorSent: "Error reported!",
    thisMonth: "Available now",
    upcoming: "Annual",
    expiresSoon: "Expires soon",
    annualFeeReminder: "Annual fee due",
    noSubscriptions: "No benefit reminders set up yet",
    footer: "Data accuracy matters. Help us improve.",
    perMonth: "/month",
    perQuarter: "/quarter",
    perYear: "/year",
    perHalfYear: "/6mo",
    noEmail: "Enter your email above to get started",
    loading: "Loading your cards...",
    creditsRemaining: "remaining",
    creditsUsed: "used",
    viewAll: "View details →",
    markUsed: "Mark used",
    undoUse: "Undo",
    usedLabel: "Used",
    remainingThisPeriod: "remaining this period",
    fnaMarkRedeemed: "Mark redeemed",
    fnaRedeemedLabel: "Redeemed",
    setOpenDateLabel: "📅 Set card open date",
    editLabel: "Edit",
    openedLabel: "Opened",
    savedToast: "Saved",
    saveErrorPrefix: "Error: ",
    saveNetworkError: "Network error",
    toastMarkedUsed: "✓ Marked used",
    toastUndone: "↩ Undone",
    toastSyncFailed: "Couldn't sync — try again",
    toastSubscribeOk: "✓ Confirmation email sent",
  },
  zh: {
    title: "我的卡片",
    subtitle: "個人信用卡福利管理中心",
    emailSection: "每月收取福利到期提醒",
    emailHint: "留下 email，我們會在福利即將到期時提醒你。",
    emailPlaceholder: "your@email.com",
    subscribe: "訂閱提醒",
    subscribed: "已訂閱",
    marketingLabel: "我同意接收個人化福利提醒（絕不打擾）",
    noCards: "還沒有新增任何卡片",
    addCards: "瀏覽所有卡片",
    benefits: "福利與回饋",
    noBenefits: "尚無定期福利記錄",
    reportError: "回報錯誤",
    setOpenDate: "設定日期",
    errorSent: "已回報！",
    thisMonth: "本期可用",
    upcoming: "年度型",
    expiresSoon: "即將到期",
    annualFeeReminder: "年費即將到期",
    noSubscriptions: "還沒有設定福利提醒",
    footer: "資料準確性是我們的生命線。幫助我們改進。",
    perMonth: "/月",
    perQuarter: "/季",
    perYear: "/年",
    perHalfYear: "/半年",
    noEmail: "請在上方輸入 email 開始使用",
    loading: "載入中...",
    creditsRemaining: "剩餘",
    creditsUsed: "已使用",
    viewAll: "查看詳情 →",
    markUsed: "標記已用",
    undoUse: "撤銷",
    usedLabel: "已使用",
    remainingThisPeriod: "本期剩餘",
    fnaMarkRedeemed: "標記已兌換",
    fnaRedeemedLabel: "已兌換",
    setOpenDateLabel: "📅 設定開卡日期",
    editLabel: "修改",
    openedLabel: "開卡",
    savedToast: "已儲存",
    saveErrorPrefix: "錯誤:",
    saveNetworkError: "網路錯誤",
    toastMarkedUsed: "✓ 已記錄使用",
    toastUndone: "↩ 已撤銷",
    toastSyncFailed: "同步失敗,請再試",
    toastSubscribeOk: "✓ 確認信已寄出",
  },
  es: {
    title: "Mis Tarjetas",
    subtitle: "Tu gestor personal de beneficios",
    emailSection: "Recibe recordatorios mensuales",
    emailHint: "Deja tu email y te lembraremos cuando los créditos estén por vencer.",
    emailPlaceholder: "tu@email.com",
    subscribe: "Suscribirse",
    subscribed: "Suscrito",
    marketingLabel: "Acepto recibir recordatorios personalizados (sin spam)",
    noCards: "No hay tarjetas agregadas",
    addCards: "Ver todas las tarjetas",
    benefits: "Beneficios y Créditos",
    noBenefits: "Sin beneficios recurrentes",
    reportError: "Reportar error",
    setOpenDate: "Establecer fecha",
    errorSent: "¡Reportado!",
    thisMonth: "Disponibles ahora",
    upcoming: "Anuales",
    expiresSoon: "Vence pronto",
    annualFeeReminder: "Cuota anual",
    noSubscriptions: "Sin recordatorios configurados",
    footer: "La precisión de los datos importa.",
    perMonth: "/mes",
    perQuarter: "/trimestre",
    perYear: "/año",
    perHalfYear: "/6meses",
    noEmail: "Ingresa tu email arriba para comenzar",
    loading: "Cargando...",
    creditsRemaining: "restante",
    creditsUsed: "usado",
    viewAll: "Ver detalles →",
    markUsed: "Marcar usado",
    undoUse: "Deshacer",
    usedLabel: "Usado",
    remainingThisPeriod: "restante este período",
    fnaMarkRedeemed: "Marcar canjeado",
    fnaRedeemedLabel: "Canjeado",
    setOpenDateLabel: "📅 Establecer fecha de apertura",
    editLabel: "Editar",
    openedLabel: "Abierta",
    savedToast: "Guardado",
    saveErrorPrefix: "Error: ",
    saveNetworkError: "Error de red",
    toastMarkedUsed: "✓ Marcado",
    toastUndone: "↩ Deshecho",
    toastSyncFailed: "Error al guardar, intenta de nuevo",
    toastSubscribeOk: "✓ Email de confirmación enviado",
  },
};

interface RecurringCredit {
  credit_key?: string;
  name: string;
  amount?: number;
  frequency: string;
  category: string;
  description?: string;
  is_free_night?: boolean;
}


interface Card {
  card_id: string;
  name: string;
  issuer: string;
  annual_fee: number;
  network?: string;
  recurring_credits?: RecurringCredit[];
  url?: string;
  image_url?: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "/month",
  quarterly: "/quarter",
  semi_annual: "/6mo",
  annual: "/year",
  per_stay: "/stay",
};;

const CATEGORY_EMOJI: Record<string, string> = {
  travel: "✈️",
  dining: "🍽️",
  entertainment: "🎬",
  shopping: "🛍️",
  gas: "⛽",
  grocery: "🛒",
  groceries: "🛒",
  streaming: "📺",
  airline: "🛫",
  hotel: "🏨",
  ride: "🚕",
  digital: "💻",
  fitness: "💪",
  lounge: "🛋️",
  other: "💳",
};

function getBenefitsThisMonth(credits: RecurringCredit[]) {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  
  return credits.filter((c) => {
    if (c.frequency === "monthly") return true;
    if (c.frequency === "quarterly") {
      // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
      const quarter = Math.floor(month / 3);
      return true; // Show all quarterly as "available this quarter"
    }
    if (c.frequency === "semi_annual") {
      // Jan-Jun = first half, Jul-Dec = second half
      const half = month < 6 ? 1 : 2;
      return true;
    }
    if (c.frequency === "annual") {
      // Show annual credits as "upcoming" unless it's been used
      return false;
    }
    return false;
  });
}

function getUpcomingBenefits(credits: RecurringCredit[]) {
  const now = new Date();
  const month = now.getMonth();
  
  return credits.filter((c) => {
    if (c.frequency === "annual") return true;
    if (c.frequency === "semi_annual") {
      const half = month < 6 ? 1 : 2;
      return half === 2; // Second half of year
    }
    return false;
  });
}

function formatFrequency(freq: string, lang: string): string {
  const labels: Record<string, Record<string, string>> = {
    en: { monthly: "/month", quarterly: "/quarter", semi_annual: "/6mo", annual: "/year", per_stay: "/stay", cardmember_year: "/year" },
    zh: { monthly: "/月", quarterly: "/季", semi_annual: "/半年", annual: "/年", cardmember_year: "/年" },
    es: { monthly: "/mes", quarterly: "/trimestre", semi_annual: "/6mes", annual: "/año", cardmember_year: "/año" },
  };
  return labels[lang]?.[freq] || `/${freq}`;
}

export default function MyCardsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const [lang, setLang] = useState<"en" | "zh" | "es">("en");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [cardsData, setCardsData] = useState<Record<string, Card>>({});
  const [email, setEmail] = useState("");
  const [marketingOptin, setMarketingOptin] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");

  const [loaded, setLoaded] = useState(false);
  const [openDates, setOpenDates] = useState<Record<string, {month: number, year: number}>>({});
  // Map<"card_id:credit_key:period_key", { used_amount, used_at }> — server state for U5 check-off.
  const [creditUses, setCreditUses] = useState<Map<string, { used_amount: number; used_at: string }>>(new Map());
  // Mirror creditUses in a ref so rapid sequential clicks read the up-to-date map
  // before React commits and re-renders. Without this, multiple clicks within one
  // frame all see the stale closure value and only the last toggle "sticks".
  const creditUsesRef = useRef(creditUses);
  // Map<"card_id:anniversary_year", { used_at, redeemed_value? }> — FNA redemption log.
  const [fnaUses, setFnaUses] = useState<Map<string, { used_at: string; redeemed_value?: number }>>(new Map());
  const fnaUsesRef = useRef(fnaUses);

  useEffect(() => {
    params.then((p) => {
      if (["en", "zh", "es"].includes(p.lang)) setLang(p.lang as "en" | "zh" | "es");
    });
  }, [params]);

  // Load selected card IDs. Strategy:
  //   1. Paint from localStorage immediately (offline-first).
  //   2. If user has a subscribed email, treat the cloud response as truth:
  //      - 200: replace cards (even if empty — user may have removed everything
  //             from another device).
  //      - 404: stale email in localStorage; clear and drop to guest mode.
  //      - 5xx / network: keep the cached paint, leave isSubscribed false so we
  //                       don't lock UI on a stale guess.
  // Card *details* are fetched in a separate effect keyed on selectedCards.
  useEffect(() => {
    const cached = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as string[]; }
      catch { return [] as string[]; }
    })();
    if (cached.length > 0) setSelectedCards(cached);

    const savedEmail = localStorage.getItem(SUBSCRIBED_EMAIL_KEY);
    if (!savedEmail) {
      setLoaded(true);
      return;
    }

    let cancelled = false;
    fetch(`/api/my-cards?email=${encodeURIComponent(savedEmail)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          localStorage.removeItem(SUBSCRIBED_EMAIL_KEY);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const cloudCards = (data.cards || []) as string[];
        setSelectedCards(cloudCards);
        setIsSubscribed(true);
        setEmail(savedEmail);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudCards));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Fetch full card data for selectedCards only. Re-runs when the set changes
  // (e.g. user adds a card from /cards page → opencard_cards_updated event).
  useEffect(() => {
    if (selectedCards.length === 0) {
      setCardsData({});
      return;
    }
    let cancelled = false;
    fetch('/api/cards?ids=' + encodeURIComponent(selectedCards.join(',')))
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, Card> = {};
        for (const c of data as Card[]) map[c.card_id] = c;
        setCardsData(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCards]);

  

  
  // Load open dates after email is set
  useEffect(() => {
    if (!email) return;
    fetch('/api/my-cards/set-open-date?email=' + encodeURIComponent(email))
      .then(r => r.json())
      .then(d => { if (d.open_dates) setOpenDates(d.open_dates); });
  }, [email]);

  // Load credit-use check-off state once email known.
  useEffect(() => {
    if (!email) return;
    fetch('/api/my-cards/credit-uses?email=' + encodeURIComponent(email))
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d.entries)) return;
        const m = new Map<string, { used_amount: number; used_at: string }>();
        for (const e of d.entries) {
          m.set(`${e.card_id}:${e.credit_key}:${e.period_key}`, {
            used_amount: Number(e.used_amount) || 0,
            used_at: String(e.used_at || ""),
          });
        }
        creditUsesRef.current = m;
        setCreditUses(m);
      })
      .catch(() => {});
  }, [email]);

  // Load FNA redemption log once email known.
  useEffect(() => {
    if (!email) return;
    fetch('/api/my-cards/fna-uses?email=' + encodeURIComponent(email))
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d.entries)) return;
        const m = new Map<string, { used_at: string; redeemed_value?: number }>();
        for (const e of d.entries) {
          m.set(`${e.card_id}:${e.anniversary_year}`, {
            used_at: String(e.used_at || ""),
            ...(typeof e.redeemed_value === "number" ? { redeemed_value: e.redeemed_value } : {}),
          });
        }
        fnaUsesRef.current = m;
        setFnaUses(m);
      })
      .catch(() => {});
  }, [email]);

  // Compute current anniversary_year for a card. Same anchor logic as
  // cardmember_year period_key, but returns the start-year integer.
  const anniversaryYearFor = useCallback((cardId: string): number => {
    const od = openDates[cardId];
    const now = new Date();
    const y = now.getUTCFullYear();
    if (!od) return y;
    const m = now.getUTCMonth(); // 0-11
    return m < (od.month - 1) ? y - 1 : y;
  }, [openDates]);

  // Compute the period_key for a given credit + card, factoring in card open date.
  const periodKeyFor = useCallback((cardId: string, frequency: string): string | null => {
    const od = openDates[cardId];
    // openDates stores month as 1-indexed; computePeriodKey expects 0-indexed.
    const anchor = od ? { month: od.month - 1, year: od.year } : undefined;
    return computePeriodKey(frequency, new Date(), anchor);
  }, [openDates]);

  // Toggle a credit's used state for the current period. Optimistic.
  // Uses creditUsesRef instead of state-via-closure so rapid clicks each see
  // the latest map and don't clobber each other.
  const toggleCreditUse = useCallback(async (cardId: string, credit: RecurringCredit) => {
    if (!email || !credit.credit_key) return;
    const periodKey = periodKeyFor(cardId, credit.frequency);
    if (!periodKey) return;
    const fullKey = `${cardId}:${credit.credit_key}:${periodKey}`;
    const wasUsed = creditUsesRef.current.has(fullKey);
    const restoreEntry = creditUsesRef.current.get(fullKey);

    // Optimistic: update ref + state synchronously.
    const next = new Map(creditUsesRef.current);
    if (wasUsed) next.delete(fullKey);
    else next.set(fullKey, { used_amount: credit.amount || 0, used_at: new Date().toISOString() });
    creditUsesRef.current = next;
    setCreditUses(next);

    const revert = () => {
      const r = new Map(creditUsesRef.current);
      if (wasUsed && restoreEntry) r.set(fullKey, restoreEntry);
      else r.delete(fullKey);
      creditUsesRef.current = r;
      setCreditUses(r);
    };

    const body = wasUsed
      ? { email, card_id: cardId, credit_key: credit.credit_key, period_key: periodKey }
      : { email, card_id: cardId, credit_key: credit.credit_key, period_key: periodKey, used_amount: credit.amount || 0 };
    try {
      const res = await fetch('/api/my-cards/credit-use', {
        method: wasUsed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        revert();
        toast.error(MESSAGES[lang].toastSyncFailed);
      } else {
        toast.success(wasUsed ? MESSAGES[lang].toastUndone : MESSAGES[lang].toastMarkedUsed);
      }
    } catch {
      revert();
      toast.error(MESSAGES[lang].toastSyncFailed);
    }
  }, [email, periodKeyFor, lang]);

  // Toggle an FNA redemption for the card's current anniversary year.
  const toggleFnaUse = useCallback(async (cardId: string) => {
    if (!email) return;
    const annYear = anniversaryYearFor(cardId);
    const fullKey = `${cardId}:${annYear}`;
    const wasUsed = fnaUsesRef.current.has(fullKey);
    const restoreEntry = fnaUsesRef.current.get(fullKey);

    const next = new Map(fnaUsesRef.current);
    if (wasUsed) next.delete(fullKey);
    else next.set(fullKey, { used_at: new Date().toISOString() });
    fnaUsesRef.current = next;
    setFnaUses(next);

    const revert = () => {
      const r = new Map(fnaUsesRef.current);
      if (wasUsed && restoreEntry) r.set(fullKey, restoreEntry);
      else r.delete(fullKey);
      fnaUsesRef.current = r;
      setFnaUses(r);
    };

    try {
      const res = await fetch('/api/my-cards/fna-use', {
        method: wasUsed ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, card_id: cardId, anniversary_year: annYear }),
      });
      if (!res.ok) {
        revert();
        toast.error(MESSAGES[lang].toastSyncFailed);
      } else {
        toast.success(wasUsed ? MESSAGES[lang].toastUndone : MESSAGES[lang].toastMarkedUsed);
      }
    } catch {
      revert();
      toast.error(MESSAGES[lang].toastSyncFailed);
    }
  }, [email, anniversaryYearFor, lang]);



  // Listen for card add/remove events from other pages (CardGrid, AddToMyCardsButton).
  // The publishers attach the new card list to event.detail so we don't need to
  // re-read localStorage; that avoids a stale read when the dispatcher hasn't
  // committed the localStorage write yet.
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<string[] | undefined>).detail;
      if (Array.isArray(detail)) {
        setSelectedCards(detail);
        return;
      }
      // Fallback for publishers that didn't attach detail (e.g. CardGrid).
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try { setSelectedCards(JSON.parse(saved)); } catch {}
      } else {
        setSelectedCards([]);
      }
    };
    window.addEventListener('opencard_cards_updated', handleUpdate);
    return () => window.removeEventListener('opencard_cards_updated', handleUpdate);
  }, []);

  const m = MESSAGES[lang];

  const handleSubscribe = useCallback(async () => {
    if (!email) return;
    setIsSubscribing(true);
    setSubscribeError("");
    
    // Fetch existing user status FIRST (check if already subscribed)
    let existingCloudCards: string[] = [];
    let isAlreadySubscribed = false;
    try {
      const statusRes = await fetch(`/api/my-cards/subscription-status?email=${encodeURIComponent(email.toLowerCase().trim())}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        isAlreadySubscribed = statusData.subscribed === true;
        if (isAlreadySubscribed) {
          // Already subscribed - fetch their existing cards
          const cloudRes = await fetch(`/api/my-cards?email=${encodeURIComponent(email.toLowerCase().trim())}`);
          if (cloudRes.ok) {
            const cloudData = await cloudRes.json();
            existingCloudCards = cloudData.cards || [];
          }
        }
      }
    } catch {}
    
    // If already subscribed, use cloud cards. Otherwise use local or cloud (whatever has data).
    let finalCards: string[];
    if (isAlreadySubscribed && existingCloudCards.length > 0) {
      finalCards = existingCloudCards; // Keep cloud cards, don't overwrite
    } else if (selectedCards.length > 0) {
      finalCards = selectedCards; // Use local cards
    } else {
      finalCards = existingCloudCards; // Fallback to cloud
    }
    
    try {
      const res = await fetch("/api/my-cards/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, cards: finalCards, marketing_optin: marketingOptin }),
      });
      if (res.ok) {
        setIsSubscribed(true);
        // Store email so AddToMyCardsButton and MyCardsWidget know user is subscribed
        localStorage.setItem('opencard_subscribed_email', email.toLowerCase().trim());
        // Save to localStorage
        setSelectedCards(finalCards);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalCards));
        toast.success(m.toastSubscribeOk);
      } else {
        const data = await res.json();
        setSubscribeError(data.error || "Failed to subscribe");
      }
    } catch {
      setSubscribeError("Network error");
    } finally {
      setIsSubscribing(false);
    }
  }, [email, selectedCards, marketingOptin]);

  // Fallback: if cardsData is empty but selectedCards has IDs, cards aren't loaded yet
  // This is just a placeholder until cardsData loads
  const selectedCardsList = (selectedCards.length > 0 && Object.keys(cardsData).length === 0)
    ? selectedCards.map((id) => ({ card_id: id, name: id.replace(/-/g, ' '), issuer: '', network: 'visa' as const, annual_fee: 0, recurring_credits: [] } as unknown as Card))
    : selectedCards.map((id) => cardsData[id]).filter(Boolean) as Card[];

  const totalMonthlyCredits = selectedCardsList.reduce((sum, card) => {
    return sum + (card.recurring_credits || []).filter((c) => c.frequency === "monthly").reduce((s, c) => s + (c.amount || 0), 0);
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-1">{m.title}</h1>
          <p className="text-slate-400 text-sm">{m.subtitle}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Email Subscription */}
        {!isSubscribed ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="font-bold text-slate-800 mb-1">{m.emailSection}</h2>
            <p className="text-xs text-slate-500 mb-4">{m.emailHint}</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={m.emailPlaceholder}
                className="flex-1 bg-slate-100 border-none rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-slate-900"
              />
              <button
                onClick={handleSubscribe}
                disabled={!email || isSubscribing}
                className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubscribing ? "..." : m.subscribe}
              </button>
            </div>
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={marketingOptin}
                onChange={(e) => setMarketingOptin(e.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span className="text-xs text-slate-500 leading-relaxed">{m.marketingLabel}</span>
            </label>
            {subscribeError && (
              <p className="text-red-500 text-xs mt-2">{subscribeError}</p>
            )}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <p className="text-green-700 font-medium text-sm inline-flex items-center gap-1.5"><Check className="w-4 h-4" strokeWidth={2.5} /> {m.subscribed}</p>
            <p className="text-green-600 text-xs mt-1">{m.noEmail}</p>
          </div>
        )}

        {/* Monthly Summary */}
        {totalMonthlyCredits > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">{m.thisMonth}</p>
                <p className="text-2xl font-bold text-slate-800">
                  ${totalMonthlyCredits.toFixed(0)}
                  <span className="text-sm font-normal text-slate-400">/mo</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{selectedCardsList.length} {m.benefits}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {selectedCardsList.reduce((sum, c) => sum + (c.recurring_credits?.length || 0), 0)} credits
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Landing banner for new visitors */}
        {!isSubscribed && selectedCardsList.length === 0 && (
          <div className="space-y-3">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
              <h2 className="text-lg font-bold mb-2 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Never miss a credit card benefit again</h2>
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                We track your Amex, Chase, Capital One & more — and email you before credits expire. No app needed.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {["✈️ Travel", "🍽️ Dining", "📺 Streaming"].map((item) => (
                  <div key={item} className="bg-white/10 rounded-lg px-3 py-2 text-center text-xs text-slate-200">{item}</div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mb-3">Supported issuers: Amex · Chase · Capital One · Citi · US Bank · Bilt · Discover</p>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-300 mb-2 font-medium">📬 Get a free monthly reminder — enter your email above!</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
              <p className="text-xs text-slate-500 mb-3 font-medium">How it works</p>
              <div className="space-y-2">
                {[
                  { step: "1", title: "Enter your email", desc: "30 seconds, no password" },
                  { step: "2", title: "Select your cards", desc: "Pick from 290+ supported cards" },
                  { step: "3", title: "Get monthly reminders", desc: "Before your credits expire" },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{title}</p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cards List */}
        {!loaded ? (
          // Skeleton: 2 placeholder card rows so the page doesn't look empty
          // during the cloud-state fetch. Pulses gently to signal activity.
          <div className="space-y-3" aria-busy="true" aria-label={m.loading}>
            {[0, 1].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 bg-slate-200 rounded w-3/5 animate-pulse" />
                    <div className="h-2.5 bg-slate-100 rounded w-1/3 animate-pulse" />
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="h-3.5 bg-slate-200 rounded w-16 animate-pulse" />
                    <div className="h-2 bg-slate-100 rounded w-12 animate-pulse" />
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {[0, 1, 2].map((j) => (
                    <div key={j} className="flex items-center justify-between">
                      <div className="h-3 bg-slate-100 rounded w-2/5 animate-pulse" />
                      <div className="h-3 bg-slate-100 rounded w-12 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : selectedCardsList.length === 0 && isSubscribed ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-slate-400 text-sm mb-4">{m.noCards}</p>
            <Link
              href={`/${lang}/cards`}
              className="inline-block bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-medium"
            >
              {m.addCards}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedCardsList.map((card) => {
              const allCredits = card.recurring_credits || [];
              const credits = allCredits;
              const thisMonth = getBenefitsThisMonth(credits);
              const upcoming = getUpcomingBenefits(credits);

              // Per-card aggregation: total $ available across all check-off-able credits
              // in their respective current periods, minus what user has marked used.
              let cardTotal = 0;
              let cardUsed = 0;
              for (const c of credits) {
                if (c.is_free_night || !c.credit_key) continue;
                const pk = periodKeyFor(card.card_id, c.frequency);
                if (!pk) continue;
                cardTotal += c.amount || 0;
                const u = creditUses.get(`${card.card_id}:${c.credit_key}:${pk}`);
                if (u) cardUsed += u.used_amount;
              }
              const cardRemaining = Math.max(0, cardTotal - cardUsed);

              return (
                <div key={card.card_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Card Header */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CardArt cardId={card.card_id} issuer={card.issuer} size="sm" />
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">{card.name}</span>
                        {card.annual_fee > 0 && (
                          <span className="text-xs text-slate-400">${card.annual_fee}/yr</span>
                        )}
                      </div>
                    </div>
                    {cardTotal > 0 && (
                      <div className="text-right shrink-0 tabular-nums whitespace-nowrap">
                        <span className="text-sm font-semibold text-emerald-700">${cardRemaining}</span>
                        <span className="text-[10px] text-slate-400"> / ${cardTotal}</span>
                        <p className="text-[9px] text-slate-400 leading-none mt-0.5">{m.remainingThisPeriod}</p>
                      </div>
                    )}
                  </div>

                  {/* Open Date Info */}
                  <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                    <OpenDateRow
                      cardId={card.card_id}
                      email={email}
                      initial={openDates[card.card_id]}
                      lang={lang}
                      onSaved={(month, year) => setOpenDates((prev) => ({ ...prev, [card.card_id]: { month, year } }))}
                    />
                  </div>

                  {/* Benefits */}
                  {credits.length === 0 ? (
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-slate-400">{m.noBenefits}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {thisMonth.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{m.thisMonth}</p>
                          <div className="space-y-1.5">
                            {thisMonth.map((credit, i) => {
                              const pk = credit.credit_key && !credit.is_free_night
                                ? periodKeyFor(card.card_id, credit.frequency)
                                : null;
                              const fullKey = pk ? `${card.card_id}:${credit.credit_key}:${pk}` : null;
                              const isUsed = fullKey ? creditUses.has(fullKey) : false;
                              const canToggle = !!fullKey;
                              const fnaKey = credit.is_free_night ? `${card.card_id}:${anniversaryYearFor(card.card_id)}` : null;
                              const fnaRedeemed = fnaKey ? fnaUses.has(fnaKey) : false;
                              const dimmed = isUsed || fnaRedeemed;
                              return (
                                <div key={i} className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm">{CATEGORY_EMOJI[credit.category] || "💳"}</span>
                                    <span className={`text-xs truncate ${dimmed ? "text-slate-400 line-through" : "text-slate-700"}`}>{credit.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {credit.is_free_night ? (
                                      <span className="inline-flex items-center">
                                        <span className={`text-[10px] font-semibold uppercase ${fnaRedeemed ? "text-slate-400 line-through" : "text-amber-600"}`}>{lang === "zh" ? "免費住宿" : lang === "es" ? "Noche" : "FNA"}</span>
                                        <HelpHint
                                          text={
                                            lang === "zh"
                                              ? "FNA = Free Night Award(免費住宿券)。每年週年贈一張,通常有點數上限(例:Marriott 35k 以下房價可換)。"
                                              : lang === "es"
                                              ? "FNA = Free Night Award. Certificado anual canjeable por una noche, con un tope en puntos (ej. Marriott hasta 35k)."
                                              : "FNA = Free Night Award. A free hotel certificate granted on each card anniversary, capped by points (e.g. Marriott rooms up to 35k)."
                                          }
                                        />
                                      </span>
                                    ) : credit.amount && credit.amount > 0 ? (
                                      <span className={`text-xs font-semibold ${isUsed ? "text-slate-400 line-through" : "text-slate-800"}`}>${credit.amount}</span>
                                    ) : null}
                                    <span className="text-[10px] text-slate-400">{formatFrequency(credit.frequency, lang)}</span>
                                    {canToggle && (
                                      <button
                                        type="button"
                                        onClick={() => toggleCreditUse(card.card_id, credit)}
                                        className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                          isUsed
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
                                        }`}
                                        aria-label={isUsed ? m.undoUse : m.markUsed}
                                        title={isUsed ? m.undoUse : m.markUsed}
                                      >
                                        {isUsed ? (<span className="inline-flex items-center gap-0.5"><Check className="w-3 h-3" strokeWidth={3} /> {m.usedLabel}</span>) : <Check className="w-3 h-3" strokeWidth={3} />}
                                      </button>
                                    )}
                                    {credit.is_free_night && (
                                      <button
                                        type="button"
                                        onClick={() => toggleFnaUse(card.card_id)}
                                        className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                          fnaRedeemed
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            : "border-amber-200 bg-white text-amber-600 hover:border-amber-400 hover:text-amber-700"
                                        }`}
                                        aria-label={fnaRedeemed ? m.undoUse : m.fnaMarkRedeemed}
                                        title={fnaRedeemed ? m.undoUse : m.fnaMarkRedeemed}
                                      >
                                        {fnaRedeemed ? (<span className="inline-flex items-center gap-0.5"><Check className="w-3 h-3" strokeWidth={3} /> {m.fnaRedeemedLabel}</span>) : <Check className="w-3 h-3" strokeWidth={3} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {upcoming.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">{m.upcoming}</p>
                          <div className="space-y-1.5">
                            {upcoming.map((credit, i) => {
                              const pk = credit.credit_key && !credit.is_free_night
                                ? periodKeyFor(card.card_id, credit.frequency)
                                : null;
                              const fullKey = pk ? `${card.card_id}:${credit.credit_key}:${pk}` : null;
                              const isUsed = fullKey ? creditUses.has(fullKey) : false;
                              const canToggle = !!fullKey;
                              const fnaKey = credit.is_free_night ? `${card.card_id}:${anniversaryYearFor(card.card_id)}` : null;
                              const fnaRedeemed = fnaKey ? fnaUses.has(fnaKey) : false;
                              const dimmed = isUsed || fnaRedeemed;
                              return (
                                <div key={i} className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm">{CATEGORY_EMOJI[credit.category] || "💳"}</span>
                                    <span className={`text-xs truncate ${dimmed ? "text-slate-400 line-through" : "text-slate-600"}`}>{credit.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {credit.is_free_night ? (
                                      <span className="inline-flex items-center">
                                        <span className={`text-[10px] font-semibold uppercase ${fnaRedeemed ? "text-slate-400 line-through" : "text-amber-600"}`}>{lang === "zh" ? "免費住宿" : lang === "es" ? "Noche" : "FNA"}</span>
                                        <HelpHint
                                          text={
                                            lang === "zh"
                                              ? "FNA = Free Night Award(免費住宿券)。每年週年贈一張,通常有點數上限(例:Marriott 35k 以下房價可換)。"
                                              : lang === "es"
                                              ? "FNA = Free Night Award. Certificado anual canjeable por una noche, con un tope en puntos (ej. Marriott hasta 35k)."
                                              : "FNA = Free Night Award. A free hotel certificate granted on each card anniversary, capped by points (e.g. Marriott rooms up to 35k)."
                                          }
                                        />
                                      </span>
                                    ) : credit.amount && credit.amount > 0 ? (
                                      <span className={`text-xs font-semibold ${isUsed ? "text-slate-400 line-through" : "text-amber-600"}`}>${credit.amount}</span>
                                    ) : null}
                                    <span className="text-[10px] text-amber-500">{formatFrequency(credit.frequency, lang)}</span>
                                    {canToggle && (
                                      <button
                                        type="button"
                                        onClick={() => toggleCreditUse(card.card_id, credit)}
                                        className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                          isUsed
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
                                        }`}
                                        aria-label={isUsed ? m.undoUse : m.markUsed}
                                        title={isUsed ? m.undoUse : m.markUsed}
                                      >
                                        {isUsed ? (<span className="inline-flex items-center gap-0.5"><Check className="w-3 h-3" strokeWidth={3} /> {m.usedLabel}</span>) : <Check className="w-3 h-3" strokeWidth={3} />}
                                      </button>
                                    )}
                                    {credit.is_free_night && (
                                      <button
                                        type="button"
                                        onClick={() => toggleFnaUse(card.card_id)}
                                        className={`ml-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                          fnaRedeemed
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            : "border-amber-200 bg-white text-amber-600 hover:border-amber-400 hover:text-amber-700"
                                        }`}
                                        aria-label={fnaRedeemed ? m.undoUse : m.fnaMarkRedeemed}
                                        title={fnaRedeemed ? m.undoUse : m.fnaMarkRedeemed}
                                      >
                                        {fnaRedeemed ? (<span className="inline-flex items-center gap-0.5"><Check className="w-3 h-3" strokeWidth={3} /> {m.fnaRedeemedLabel}</span>) : <Check className="w-3 h-3" strokeWidth={3} />}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <Link
                      href={`/${lang}/cards/${card.card_id}`}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {m.viewAll}
                    </Link>
                    <ReportErrorModal cardId={card.card_id} cardName={card.name} lang={lang} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-slate-400">{m.footer}</p>
          <p className="text-xs text-slate-300 mt-1">opencard@opencardai.com</p>
        </div>
      </div>
    </div>
  );
}
// Force cache refresh 20260422
