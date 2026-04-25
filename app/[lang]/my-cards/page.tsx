"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const STORAGE_KEY = "opencard_existing_cards";
const SUBSCRIBED_EMAIL_KEY = "opencard_subscribed_email";

const MESSAGES = {
  en: {
    title: "💳 My Cards",
    subtitle: "Your personal credit card benefits manager",
    emailSection: "Get monthly benefit reminders",
    emailHint: "Leave your email and we'll remind you when credits are about to expire.",
    emailPlaceholder: "your@email.com",
    subscribe: "Subscribe",
    subscribed: "Subscribed ✓",
    marketingLabel: "I agree to receive personalized benefit reminders (no spam)",
    noCards: "No cards added yet",
    addCards: "Browse all cards",
    benefits: "Benefits & Credits",
    noBenefits: "No recurring benefits recorded",
    reportError: "Report error",
    setOpenDate: "Set date",
    errorSent: "Error reported!",
    thisMonth: "This month",
    upcoming: "Upcoming",
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
  },
  zh: {
    title: "💳 我的卡片",
    subtitle: "個人信用卡福利管理中心",
    emailSection: "每月收取福利到期提醒",
    emailHint: "留下 email，我們會在福利即將到期時提醒你。",
    emailPlaceholder: "your@email.com",
    subscribe: "訂閱提醒",
    subscribed: "已訂閱 ✓",
    marketingLabel: "我同意接收個人化福利提醒（絕不打擾）",
    noCards: "還沒有新增任何卡片",
    addCards: "瀏覽所有卡片",
    benefits: "福利與回饋",
    noBenefits: "尚無定期福利記錄",
    reportError: "回報錯誤",
    setOpenDate: "設定日期",
    errorSent: "已回報！",
    thisMonth: "本月可用",
    upcoming: "即將到來",
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
  },
  es: {
    title: "💳 Mis Tarjetas",
    subtitle: "Tu gestor personal de beneficios",
    emailSection: "Recibe recordatorios mensuales",
    emailHint: "Deja tu email y te lembraremos cuando los créditos estén por vencer.",
    emailPlaceholder: "tu@email.com",
    subscribe: "Suscribirse",
    subscribed: "Suscrito ✓",
    marketingLabel: "Acepto recibir recordatorios personalizados (sin spam)",
    noCards: "No hay tarjetas agregadas",
    addCards: "Ver todas las tarjetas",
    benefits: "Beneficios y Créditos",
    noBenefits: "Sin beneficios recurrentes",
    reportError: "Reportar error",
    setOpenDate: "Establecer fecha",
    errorSent: "¡Reportado!",
    thisMonth: "Este mes",
    upcoming: "Próximamente",
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
  },
};

interface RecurringCredit {
  name: string;
  amount?: number;
  frequency: string;
  category: string;
  description?: string;
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
  streaming: "📺",
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

  useEffect(() => {
    params.then((p) => {
      if (["en", "zh", "es"].includes(p.lang)) setLang(p.lang as "en" | "zh" | "es");
    });
  }, [params]);

  // Load selected cards — cloud-first if subscribed, localStorage fallback
  // Also fetch cardsData in the same useEffect to avoid race conditions
  useEffect(() => {
    const loadEverything = async () => {
      const savedEmail = localStorage.getItem(SUBSCRIBED_EMAIL_KEY);
      let cardsToSet: string[] = [];
      let isSubscribedToSet = false;
      let emailToSet = '';
      
      // Try cloud first
      if (savedEmail) {
        try {
          const res = await fetch(`/api/my-cards?email=${encodeURIComponent(savedEmail)}`);
          if (res.ok) {
            const data = await res.json();
            const cloudCards = data.cards || [];
            if (cloudCards.length > 0) {
              cardsToSet = cloudCards;
              isSubscribedToSet = true;
              emailToSet = savedEmail;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudCards));
            }
          }
        } catch {}
      }
      
      // Fallback to localStorage if no cloud cards
      if (cardsToSet.length === 0) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            cardsToSet = JSON.parse(saved);
            const em = localStorage.getItem(SUBSCRIBED_EMAIL_KEY);
            if (em && cardsToSet.length > 0) {
              isSubscribedToSet = true;
              emailToSet = em;
            }
          } catch {}
        }
      }
      
      // Set the selected cards
      if (cardsToSet.length > 0) {
        setSelectedCards(cardsToSet);
      }
      if (isSubscribedToSet) {
        setIsSubscribed(true);
        setEmail(emailToSet);
      }
      
      // Fetch full card data for all cards
      try {
        const cardRes = await fetch('/api/cards?full=1');
        if (cardRes.ok) {
          const data = await cardRes.json(); // Response is [{issuer: "Amex", cards: [...]}, ...]
          const map: Record<string, Card> = {};
          for (const issuerGroup of data) {
            for (const c of issuerGroup.cards || []) {
              map[c.card_id] = c;
            }
          }
          setCardsData(map);
          console.log('cardsData map populated with:', Object.keys(map).length, 'cards');
        }
      } catch {}
      
      setLoaded(true);
    };
    
    loadEverything();
  }, []);

  // Simple safety check
  useEffect(() => {
    // Logs for debugging
    console.log('isSubscribed:', isSubscribed, 'selectedCards:', selectedCards.length, 'loaded:', loaded, 'cardsData keys:', Object.keys(cardsData).length);
    console.log('first few selectedCards:', selectedCards.slice(0,3));
  }, [isSubscribed, selectedCards.length, loaded]);

  
  // Load open dates after email is set
  useEffect(() => {
    if (!email) return;
    fetch('/api/my-cards/set-open-date?email=' + encodeURIComponent(email))
      .then(r => r.json())
      .then(d => { if (d.open_dates) setOpenDates(d.open_dates); });
  }, [email]);

  // Handle edit open date
  const handleEditOpenDate = useCallback(async (cardId: string) => {
    // Simple approach - get from localStorage directly
    const storedEmail = localStorage.getItem('opencard_subscribed_email');
    if (!storedEmail) {
      // Try to get from API
      fetch('/api/my-cards/set-open-date?email=' + encodeURIComponent(email))
        .then(r => r.json())
        .then(d => {
          if (d.open_dates) {
            setOpenDates(d.open_dates);
            alert('Loaded your card open dates');
          }
        });
      return;
    }
    
    // Use simple window.prompt - works on desktop, show alert for mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const input = window.prompt('Enter open month and year (e.g., 3 2024):');
      processInput(input);
    } else {
      const input = window.prompt('Enter open month/year (e.g., 3 2024):');
      processInput(input);
    }
    
    function processInput(input: string | null) {
      if (!input) return;
      const [m, y] = input.split(/[\s,\/]+/).map(Number);
      if (!m || !y || m < 1 || m > 12 || y < 2020 || y > 2030) {
        alert('Please enter valid month (1-12) and year (e.g., 3 2024)');
        return;
      }
      fetch('/api/my-cards/set-open-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: storedEmail, card_id: cardId, month: m, year: y }),
      }).then(res => {
        if (res.ok) setOpenDates(prev => ({ ...prev, [cardId]: { month: m, year: y } }));
        else alert('Failed to save');
      });
    }
  }, [email]);


// Listen for card save/remove events from other pages
  useEffect(() => {
    const handleUpdate = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setSelectedCards(JSON.parse(saved));
        } catch {}
      } else {
        setSelectedCards([]);
      }
    };
    window.addEventListener('opencard_cards_updated', handleUpdate);
    return () => window.removeEventListener('opencard_cards_updated', handleUpdate);
  }, []);

  // Fetch full card data - now handles in loadCards useEffect directly
  // This useEffect just handles card ID updates from other pages
  useEffect(() => {
    if (selectedCards.length > 0) {
      // Trigger a re-render when cards are added/removed from other pages
      setLoaded(true);
    }
  }, [selectedCards.length]);

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
            <p className="text-green-700 font-medium text-sm">✓ {m.subscribed}</p>
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
              <h2 className="text-lg font-bold mb-2">💳 Never miss a credit card benefit again</h2>
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
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-slate-400 text-sm">{m.loading}</p>
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

              return (
                <div key={card.card_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Card Header */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-sm font-semibold text-slate-800 truncate">{card.name}</span>
                      {card.annual_fee > 0 && (
                        <span className="text-xs text-slate-400">${card.annual_fee}/yr</span>
                      )}
                    </div>
                  </div>

                  {/* Open Date Info - New Row */}
                  <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                    {openDates[card.card_id] ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-600 font-medium">
                          📅 Opened {openDates[card.card_id].month}/{openDates[card.card_id].year}
                          {' -> '}
                          {(() => {
                            const now = new Date();
                            const opened = new Date(openDates[card.card_id].year, openDates[card.card_id].month - 1);
                            const months = (now.getFullYear() - opened.getFullYear()) * 12 + now.getMonth() - opened.getMonth();
                            const years = Math.floor(months / 12);
                            const remMonths = months % 12;
                            return years > 0 ? `${years}y ${remMonths}m` : `${remMonths} months`;
                          })()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    // Create a temporary date input to show native calendar picker
    const input = document.createElement('input');
    input.type = 'date';
    input.min = '2020-01-01';
    input.max = '2026-12-31';
    input.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    input.showPicker ? input.showPicker() : input.click();
    input.addEventListener('change', function() {
      const val = this.value;
      if (!val) return;
      const [year, month] = val.split('-').map(Number);
      const em = localStorage.getItem('opencard_subscribed_email');
      if (!em) { alert('Please subscribe first'); return; }
      fetch('/api/my-cards/set-open-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, card_id: card.card_id, month, year }),
      }).then(r => r.json()).then(d => {
        if (d.success) alert('Saved ' + month + '/' + year + ' for ' + card.name + '!');
        else alert('Error: ' + (d.error || 'failed'));
      }).catch(() => alert('Network error'));
      document.body.removeChild(input);
    });
    input.addEventListener('blur', function() {
      if (document.body.contains(input)) document.body.removeChild(input);
    });
  }}
                          className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    // Create a temporary date input to show native calendar picker
    const input = document.createElement('input');
    input.type = 'date';
    input.min = '2020-01-01';
    input.max = '2026-12-31';
    input.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    input.showPicker ? input.showPicker() : input.click();
    input.addEventListener('change', function() {
      const val = this.value;
      if (!val) return;
      const [year, month] = val.split('-').map(Number);
      const em = localStorage.getItem('opencard_subscribed_email');
      if (!em) { alert('Please subscribe first'); return; }
      fetch('/api/my-cards/set-open-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, card_id: card.card_id, month, year }),
      }).then(r => r.json()).then(d => {
        if (d.success) alert('Saved ' + month + '/' + year + ' for ' + card.name + '!');
        else alert('Error: ' + (d.error || 'failed'));
      }).catch(() => alert('Network error'));
      document.body.removeChild(input);
    });
    input.addEventListener('blur', function() {
      if (document.body.contains(input)) document.body.removeChild(input);
    });
  }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                      >
                        📅 Set card open date
                      </button>
                    )}
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
                            {thisMonth.map((credit, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{CATEGORY_EMOJI[credit.category] || "💳"}</span>
                                  <span className="text-xs text-slate-700">{credit.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {credit.amount && credit.amount > 0 && (
                                    <span className="text-xs font-semibold text-slate-800">${credit.amount}</span>
                                  )}
                                  <span className="text-[10px] text-slate-400">{formatFrequency(credit.frequency, lang)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {upcoming.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">{m.upcoming}</p>
                          <div className="space-y-1.5">
                            {upcoming.map((credit, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{CATEGORY_EMOJI[credit.category] || "💳"}</span>
                                  <span className="text-xs text-slate-600">{credit.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {credit.amount && credit.amount > 0 && (
                                    <span className="text-xs font-semibold text-amber-600">${credit.amount}</span>
                                  )}
                                  <span className="text-[10px] text-amber-500">{formatFrequency(credit.frequency, lang)}</span>
                                </div>
                              </div>
                            ))}
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
                    <a
                      href={`https://github.com/opencard-ai/opencard/issues/new?title=${encodeURIComponent(`[Data Error] ${card.name}`)}&body=${encodeURIComponent(`**Card:** ${card.name}\n**Page:** https://opencardai.com/${lang}/cards/${card.card_id}\n\n**What's wrong:**\n\n(Please describe the incorrect information)\n`)}&labels=data-error`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      {m.reportError}
                    </a>
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
