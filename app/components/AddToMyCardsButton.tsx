'use client';

import { useState } from 'react';

interface AddToMyCardsButtonProps {
  cardId: string;
  cardName: string;
  lang: string;
}

export default function AddToMyCardsButton({ cardId, cardName, lang }: AddToMyCardsButtonProps) {
  const [added, setAdded] = useState(false);

  const labels: Record<string, { add: string; added: string }> = {
    en: { add: '💳 Add to My Cards', added: '✓ Added to My Cards' },
    zh: { add: '💳 加入我的卡片', added: '✓ 已加入我的卡片' },
    es: { add: '💳 Agregar a Mis Tarjetas', added: '✓ Agregado a Mis Tarjetas' },
  };

  const handleAdd = () => {
    const myCards = JSON.parse(localStorage.getItem('opencard_my_cards') || '[]');
    if (!myCards.includes(cardId)) {
      myCards.push(cardId);
      localStorage.setItem('opencard_my_cards', JSON.stringify(myCards));
      setAdded(true);
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
