"use client";

import { useRef, useState, useEffect } from "react";
import { Calendar } from "lucide-react";

const STR = {
  en: { setLabel: "Set card open date", editLabel: "Edit", openedLabel: "Opened", noEmail: "Please subscribe first.", save: "Save", cancel: "Cancel", failed: "Could not save. Please try again." },
  zh: { setLabel: "設定開卡日期", editLabel: "修改", openedLabel: "開卡", noEmail: "請先訂閱。", save: "儲存", cancel: "取消", failed: "儲存失敗，請重試。" },
  "zh-cn": { setLabel: "设置开卡日期", editLabel: "修改", openedLabel: "开卡", noEmail: "请先订阅。", save: "保存", cancel: "取消", failed: "保存失败，请重试。" },
  es: { setLabel: "Establecer fecha de apertura", editLabel: "Editar", openedLabel: "Abierta", noEmail: "Suscríbete primero.", save: "Guardar", cancel: "Cancelar", failed: "No se pudo guardar. Inténtalo de nuevo." },
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
  if (locale === "zh-cn") return years > 0 ? `${years}年${rem}个月` : `${rem} 个月`;
  if (locale === "es") return years > 0 ? `${years}a ${rem}m` : `${rem}m`;
  return years > 0 ? `${years}y ${rem}m` : `${rem}m`;
}

export default function OpenDateRow({ cardId, email, initial, lang, onSaved }: Props) {
  const t = STR[(lang as Lang) in STR ? (lang as Lang) : "en"];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const beginEditing = () => {
    setDraft(initial ? `${initial.year}-${pad2(initial.month)}` : "");
    setError("");
    setEditing(true);
  };
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

  const submit = async () => {
    if (submitting.current || !inputRef.current?.reportValidity() || !draft) return;
    const [y, m] = draft.split("-").map(Number);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2020 || y > CURRENT_YEAR) return;
    if (!email) { setError(t.noEmail); return; }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/my-cards/set-open-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, card_id: cardId, month: m, year: y }),
      });
      if (!res.ok) throw new Error("Save failed");
      onSaved(m, y);
      setEditing(false);
    } catch {
      setError(t.failed);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <input
          ref={inputRef}
          type="month"
          value={draft}
          required
          min={MIN}
          max={MAX}
          disabled={saving}
          onChange={(e) => { setDraft(e.target.value); setError(""); }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !submitting.current) setEditing(false);
          }}
          className="min-w-0 text-xs bg-white border border-blue-300 rounded px-2 py-1 text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
          aria-label={t.setLabel}
        />
        <button type="button" onClick={submit} disabled={saving || !draft}
          className="text-xs rounded bg-blue-600 text-white px-3 py-2 disabled:opacity-60">{saving ? "…" : t.save}</button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving}
          className="text-xs text-blue-600 px-2 py-2 disabled:opacity-60">{t.cancel}</button>
        {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
      </div>
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
          onClick={beginEditing}
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
      onClick={beginEditing}
      className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer inline-flex items-center gap-1"
    >
      <Calendar className="w-3 h-3" /> {t.setLabel}
    </button>
  );
}
