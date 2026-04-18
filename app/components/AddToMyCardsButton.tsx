'use client';

import { useState, useEffect } from 'react';
import { trackCardAdded } from '@/lib/analytics';

interface AddToMyCardsButtonProps {
  cardId: string;
  cardName: string;
  lang: string;
}

const STORAGE_KEY = 'opencard_existing_cards';

export default function AddToMyCardsButton({ cardId, cardName, lang }: AddToMyCardsButtonProps) {
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const ids: string[] = JSON.parse(stored);
        setAdded(ids.includes(cardId));
      } catch {}
    }
  }, [cardId]);

  const labels: Record<string, { add: string; added: string }> = {
    en: { add: '💳 Add to My Cards', added: '✓ Added to My Cards' },
    zh: { add: '💳 加入我的卡片', added: '✓ 已加入我的卡片' },
    es: { add: '💳 Agregar a Mis Tarjetas', added: '✓ Agregado a Mis Tarjetas' },
  };

  const handleAdd = () => {
    const myCards: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!myCards.includes(cardId)) {
      myCards.push(cardId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(myCards));
      setAdded(true);
      trackCardAdded(cardId);
      window.dispatchEvent(new CustomEvent('opencard_cards_updated', { detail: myCards }));
    }
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
      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors mt-4 text-sm"
    >
      {label.add}
    </button>
  );
}
