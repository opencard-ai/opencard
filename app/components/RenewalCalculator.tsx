"use client";
import { useState } from 'react';

/** Renewal-only: no sign-up bonus, no assumed redemption value or advertised credit totals. */
export default function RenewalCalculator({ annualFee }: { annualFee: number }) {
  const [credits, setCredits] = useState(0);
  const [extraRewards, setExtraRewards] = useState(0);
  const [otherValue, setOtherValue] = useState(0);
  const net = credits + extraRewards + otherValue - annualFee;
  const fields = [
    { label: 'Credits that replace spending you already planned', value: credits, set: setCredits },
    { label: 'Extra annual rewards versus your alternative card', value: extraRewards, set: setExtraRewards },
    { label: 'Other non-overlapping benefits you would pay for', value: otherValue, set: setOtherValue },
  ];
  return <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <h3 className="text-sm font-semibold text-slate-900">Would I renew? Adjust your assumptions</h3>
    <p className="mt-1 text-xs text-slate-600">Annual fee: ${annualFee.toLocaleString()}. Start at zero. Excludes welcome offers, interest, and taxes; reduce portal savings for price differences. These are your estimates, not guaranteed returns.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {fields.map(field => <label key={field.label} className="text-xs text-slate-700">{field.label}
        <input type="number" min="0" max="100000" step="1" value={field.value} onChange={event => field.set(Math.min(100000, Math.max(0, Number(event.target.value) || 0)))} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-slate-900" />
      </label>)}
    </div>
    <p aria-live="polite" className="mt-3 text-sm font-semibold text-slate-900">Estimated annual value after fee: {net < 0 ? '−' : ''}${Math.abs(net).toLocaleString()}.</p>
    <p className="mt-1 text-xs text-slate-600">{net > 0 ? 'Positive under your assumptions. Check restrictions and avoid double-counting.' : net === 0 ? 'Break-even under your assumptions, with no margin for missed benefits.' : 'Your estimates do not cover the annual fee. Compare a lower-fee alternative.'}</p>
  </div>;
}
