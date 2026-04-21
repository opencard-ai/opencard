'use client';

import { useState, useEffect } from 'react';
import { trackCardAdded } from '@/lib/analytics';

interface AddToMyCardsButtonProps {
  cardId: string;
  cardName: string;
  lang: string;
}

const STORAGE_KEY = 'opencard_existing_cards';
const SUBSCRIBED_EMAIL_KEY = 'opencard_subscribed_email';

export default function AddToMyCardsButton({ cardId, cardName, lang }: AddToMyCardsButtonProps) {
  const [added, setAdded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const ids: string[] = JSON.parse(stored);
        setAdded(ids.includes(cardId));
      } catch {}
    }

    const handler = (e: CustomEvent) => {
      const ids: string[] = e.detail;
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
          window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: data.cards }));
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

  const labels: Record<string, { add: string; added: string; saving: string; remove: string }> = {
    en: { add: '💳 Add to My Cards', added: '✓ Added', saving: '...', remove: '✕ Remove' },
    zh: { add: '💳 加入我的卡片', added: '✓ 已加入', saving: '...', remove: '✕ 移除' },
    es: { add: '💳 Agregar a Mis Tarjetas', added: '✓ Agregado', saving: '...', remove: '✕ Quitar' },
  };

  const langKey = (['en', 'zh', 'es'] as const).includes(lang as any) ? lang : 'en';
  const label = labels[langKey];

  // When added, show a two-button row: "✓ Added" + "✕ Remove"
  if (added) {
    return (
      <div className="flex flex-row gap-2 w-full">
        <div className="flex-1 flex items-center justify-center bg-indigo-50 border border-indigo-200 rounded-lg py-2.5 px-3 text-center">
          <span className="text-indigo-600 font-semibold text-sm">{label.added}</span>
        </div>
        <button
          onClick={handleRemove}
          disabled={saving}
          className="flex-1 bg-white border border-red-200 hover:border-red-400 hover:bg-red-50 disabled:opacity-60 text-red-500 font-semibold py-2.5 px-3 rounded-lg transition-colors text-sm"
        >
          {saving ? '...' : label.remove}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAdd}
      disabled={saving}
      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
    >
      {saving ? label.saving : label.add}
    </button>
  );
}
