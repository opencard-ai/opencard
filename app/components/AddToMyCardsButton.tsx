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

    // Listen for external saves (e.g., from other components)
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

  const handleAdd = async () => {
    if (saving) return;
    setSaving(true);

    const subscribedEmail = getSubscribedEmail();

    if (subscribedEmail) {
      // Cloud-first: save to Redis
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
        // If API fails (e.g., not really subscribed), fall through to localStorage
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

  const labels: Record<string, { add: string; added: string; saving: string }> = {
    en: { add: '💳 Add to My Cards', added: '✓ Added to My Cards', saving: '...' },
    zh: { add: '💳 加入我的卡片', added: '✓ 已加入我的卡片', saving: '...' },
    es: { add: '💳 Agregar a Mis Tarjetas', added: '✓ Agregado a Mis Tarjetas', saving: '...' },
  };

  const langKey = (['en', 'zh', 'es'] as const).includes(lang as any) ? lang : 'en';
  const label = labels[langKey];

  if (added) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mt-4 text-center">
        <span className="text-indigo-600 font-medium text-sm">{label.added}</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleAdd}
      disabled={saving}
      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors mt-4 text-sm"
    >
      {saving ? label.saving : label.add}
    </button>
  );
}
