'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Plus, X } from 'lucide-react';
import { trackCardAdded } from '@/lib/analytics';

interface AddToMyCardsButtonProps {
  cardId: string;
  cardName: string;
  lang: string;
}

const STORAGE_KEY = 'opencard_existing_cards';
const SUBSCRIBED_EMAIL_KEY = 'opencard_subscribed_email';

function extractCardIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => typeof x === 'string' ? x : (x && typeof x === 'object' ? String((x as { card_id?: unknown }).card_id || '') : ''))
    .filter(Boolean);
}

export default function AddToMyCardsButton({ cardId, lang }: AddToMyCardsButtonProps) {
  const [added, setAdded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync from localStorage + cross-component event bus. Both are external
  // stores unavailable during SSR, so deferring the read to an effect is
  // the standard idiom — set-state-in-effect is expected here.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const ids = extractCardIds(JSON.parse(stored));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAdded(ids.includes(cardId));
      } catch {}
    }

    const handler = (e: CustomEvent) => {
      const ids = extractCardIds(e.detail);
      setAdded(ids.includes(cardId));
    };
    window.addEventListener('opencard_cards_updated', handler as EventListener);
    return () => window.removeEventListener('opencard_cards_updated', handler as EventListener);
  }, [cardId]);

  const getSubscribedEmail = (): string | null => {
    return localStorage.getItem(SUBSCRIBED_EMAIL_KEY);
  };

  const handleRemove = async () => {
    if (saving) return;
    setSaving(true);

    const subscribedEmail = getSubscribedEmail();

    if (subscribedEmail) {
      try {
        const res = await fetch('/api/my-cards/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: subscribedEmail, card_id: cardId }),
        });

        if (res.ok) {
          const data = await res.json();
          setAdded(false);
          window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: data.cards || [] }));
          setSaving(false);
          return;
        }
      } catch {}
    }

    // Fallback: localStorage
    const myCards: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = myCards.filter((id: string) => id !== cardId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setAdded(false);
    window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: updated }));
    setSaving(false);
  };

  const handleAdd = async () => {
    if (saving) return;
    setSaving(true);

    const subscribedEmail = getSubscribedEmail();

    if (subscribedEmail) {
      try {
        const res = await fetch('/api/my-cards/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: subscribedEmail, card_id: cardId }),
        });

        if (res.ok) {
          const data = await res.json();
          setAdded(true);
          trackCardAdded(cardId);
          const next = data.card_instances || data.cards || [];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: next }));
          setSaving(false);
          return;
        }
      } catch {}
    }

    // Fallback: localStorage
    const myCards: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!myCards.includes(cardId)) {
      myCards.push(cardId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(myCards));
      setAdded(true);
      trackCardAdded(cardId);
      window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: myCards }));
    }
    setSaving(false);
  };

  const labels: Record<string, { add: string; addAnother: string; added: string; saving: string; remove: string }> = {
    en: { add: 'Add to My Cards', addAnother: 'Add another copy', added: 'Added', saving: '...', remove: 'Remove all' },
    zh: { add: '加入我的卡片', addAnother: '再加一張', added: '已加入', saving: '...', remove: '全部移除' },
    'zh-cn': { add: '加入我的卡片', addAnother: '再加一张', added: '已加入', saving: '...', remove: '全部移除' },
    es: { add: 'Agregar a Mis Tarjetas', addAnother: 'Agregar otra', added: 'Agregado', saving: '...', remove: 'Quitar todo' },
  };

  const langKey = (['en', 'zh', 'zh-cn', 'es'] as const).includes(lang as 'en' | 'zh' | 'zh-cn' | 'es') ? lang : 'en';
  const label = labels[langKey as keyof typeof labels];

  if (added) {
    return (
      <div className="flex flex-row gap-2 w-full">
        <button
          onClick={handleAdd}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100 disabled:opacity-60 text-indigo-600 font-semibold h-11 px-3 rounded-lg transition-colors text-sm"
          title={label.addAnother}
        >
          {saving ? '...' : (<><Plus className="w-4 h-4" /> {label.addAnother}</>)}
        </button>
        <button
          onClick={handleRemove}
          disabled={saving}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-red-200 hover:border-red-400 hover:bg-red-50 disabled:opacity-60 text-red-500 font-semibold h-11 px-3 rounded-lg transition-colors text-sm"
        >
          {saving ? '...' : (<><X className="w-4 h-4" /> {label.remove}</>)}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAdd}
      disabled={saving}
      className="w-full inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold h-11 px-4 rounded-lg transition-colors text-sm"
    >
      {saving ? label.saving : (<><CreditCard className="w-4 h-4" /> {label.add}</>)}
    </button>
  );
}
