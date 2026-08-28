"use client";

import { useEffect, useMemo, useState } from "react";

type Benefit = {
  id: string;
  card: string;
  benefit: string;
  expires: string;
  value: number;
  used: boolean;
};

const STORAGE_KEY = "opencard_benefit_expiration_tracker_v1";

function daysUntil(date: string) {
  const end = new Date(`${date}T23:59:59`);
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export default function BenefitExpirationTracker() {
  const [items, setItems] = useState<Benefit[]>([]);
  const [ready, setReady] = useState(false);
  const [card, setCard] = useState("");
  const [benefit, setBenefit] = useState("");
  const [expires, setExpires] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.used) - Number(b.used) || a.expires.localeCompare(b.expires)),
    [items]
  );
  const remainingValue = items.filter((item) => !item.used).reduce((sum, item) => sum + item.value, 0);
  const dueSoon = items.filter((item) => !item.used && daysUntil(item.expires) >= 0 && daysUntil(item.expires) <= 30).length;

  function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!card.trim() || !benefit.trim() || !expires) return;
    setItems((current) => [...current, {
      id: crypto.randomUUID(), card: card.trim(), benefit: benefit.trim(), expires,
      value: Math.max(0, Number(value) || 0), used: false,
    }]);
    setBenefit(""); setExpires(""); setValue("");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Due in 30 days</div>
          <div className="mt-1 text-3xl font-bold text-amber-950">{dueSoon}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Unused value entered</div>
          <div className="mt-1 text-3xl font-bold text-emerald-950">${remainingValue.toLocaleString()}</div>
        </div>
      </div>

      <form onSubmit={addItem} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Card
          <input value={card} onChange={(e) => setCard(e.target.value)} required placeholder="e.g. Amex Platinum" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Benefit
          <input value={benefit} onChange={(e) => setBenefit(e.target.value)} required placeholder="e.g. airline fee credit" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Expiration date
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">Value you would actually use ($)
          <input type="number" min="0" step="1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <button className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800 sm:col-span-2">Add benefit</button>
      </form>

      <div className="space-y-3">
        {ready && sorted.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No benefits yet. Add the credits, certificates, or passes you are most likely to forget.</p>}
        {sorted.map((item) => {
          const days = daysUntil(item.expires);
          return <div key={item.id} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${item.used ? "border-slate-200 bg-slate-50 opacity-65" : days < 0 ? "border-red-200 bg-red-50" : days <= 30 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <input aria-label={`Mark ${item.benefit} used`} type="checkbox" checked={item.used} onChange={() => setItems((all) => all.map((x) => x.id === item.id ? { ...x, used: !x.used } : x))} className="h-5 w-5" />
            <div className="min-w-0 flex-1"><div className="font-semibold text-slate-900">{item.benefit}</div><div className="text-sm text-slate-600">{item.card} · ${item.value.toLocaleString()} · expires {item.expires}</div></div>
            <div className="text-sm font-semibold text-slate-700">{item.used ? "Used" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}</div>
            <button onClick={() => setItems((all) => all.filter((x) => x.id !== item.id))} className="text-sm text-red-700 hover:underline">Remove</button>
          </div>;
        })}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Your entries stay in this browser using local storage and are not sent to OpenCard. Dates and benefit terms can change; confirm current issuer terms before relying on a benefit.</p>
    </div>
  );
}
