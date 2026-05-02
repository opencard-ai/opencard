"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Calendar } from "lucide-react";

const STR = {
  en: { setLabel: "Set card open date", editLabel: "Edit", openedLabel: "Opened", noEmail: "Please subscribe first." },
  zh: { setLabel: "設定開卡日期", editLabel: "修改", openedLabel: "開卡", noEmail: "請先訂閱。" },
  es: { setLabel: "Establecer fecha de apertura", editLabel: "Editar", openedLabel: "Abierta", noEmail: "Suscríbete primero." },
};

type Lang = keyof typeof STR;

interface Props {
  cardId: string;
  email: string;
  /** Existing open date (1-indexed month, like the rest of the codebase). */
  initial?: { month: number; year: number };
  lang: Lang | string;
  onSaved: (month: number, year: number) => void;
}

const CURRENT_YEAR = new Date().getUTCFullYear();
const MIN = "2020-01";
const MAX = `${CURRENT_YEAR}-12`;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDuration(opened: { month: number; year: number }, locale: string): string {
  const now = new Date();
  const o = new Date(opened.year, opened.month - 1, 1);
  const months = (now.getFullYear() - o.getFullYear()) * 12 + (now.getMonth() - o.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (locale === "zh") return years > 0 ? `${years}年${rem}個月` : `${rem} 個月`;
  if (locale === "es") return years > 0 ? `${years}a ${rem}m` : `${rem}m`;
  return years > 0 ? `${years}y ${rem}m` : `${rem}m`;
}

export default function OpenDateRow({ cardId, email, initial, lang, onSaved }: Props) {
  const t = STR[(lang as Lang) in STR ? (lang as Lang) : "en"];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + open native picker when entering edit mode.
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // showPicker is supported in modern browsers (Chrome 99+, Safari 16+, Firefox 101+).
    // Fall back gracefully where unsupported — focus alone is enough on those.
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {}
  }, [editing]);

  const submit = useCallback(
    async (val: string) => {
      const [yStr, mStr] = val.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2020 || y > 2030) {
        setEditing(false);
        return;
      }
      if (!email) {
        // No subscribed email — the picker shouldn't have been reachable, but
        // if it is (race / restored stale localStorage) just bail silently
        // rather than blocking the page with an alert.
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        const res = await fetch("/api/my-cards/set-open-date", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, card_id: cardId, month: m, year: y }),
        });
        if (res.ok) onSaved(m, y);
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [email, cardId, onSaved, t],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="month"
        defaultValue={initial ? `${initial.year}-${pad2(initial.month)}` : ""}
        min={MIN}
        max={MAX}
        disabled={saving}
        onChange={(e) => submit(e.target.value)}
        onBlur={(e) => {
          if (!e.target.value) setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        className="text-xs bg-white border border-blue-300 rounded px-2 py-1 text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
        aria-label={t.setLabel}
      />
    );
  }

  if (initial) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-blue-600 font-medium tabular-nums inline-flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {t.openedLabel} {initial.month}/{initial.year}
          {" → "}
          {formatDuration(initial, String(lang))}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
        >
          {t.editLabel}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer inline-flex items-center gap-1"
    >
      <Calendar className="w-3 h-3" /> {t.setLabel}
    </button>
  );
}
