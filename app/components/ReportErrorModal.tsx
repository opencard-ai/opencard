"use client";

import { useState, useEffect, useCallback } from "react";

const STRINGS = {
  en: {
    trigger: "Report error",
    title: "Report data error",
    contextLabel: "Card",
    placeholder: "What's wrong with this card? (e.g. annual fee changed, credit no longer offered, etc.)",
    emailLabel: "Email (optional, for follow-up)",
    emailPlaceholder: "your@email.com",
    submit: "Submit report",
    cancel: "Cancel",
    submitting: "Submitting…",
    thanks: "Reported. Thanks!",
    errorGeneric: "Something went wrong. Please try again.",
    errorRate: "Too many reports — try again later.",
    errorMsgLen: "Please write at least 5 characters.",
    errorMsgMax: "Please keep it under 2000 characters.",
  },
  zh: {
    trigger: "回報錯誤",
    title: "回報資料錯誤",
    contextLabel: "卡片",
    placeholder: "這張卡哪裡有誤?(例:年費已調整、福利已取消...)",
    emailLabel: "Email(可選,以便回覆)",
    emailPlaceholder: "your@email.com",
    submit: "送出回報",
    cancel: "取消",
    submitting: "送出中…",
    thanks: "已回報,謝謝!",
    errorGeneric: "出了點問題,請再試一次。",
    errorRate: "回報次數太多,請稍後再試。",
    errorMsgLen: "請至少輸入 5 個字。",
    errorMsgMax: "請控制在 2000 字以內。",
  },
  es: {
    trigger: "Reportar error",
    title: "Reportar error de datos",
    contextLabel: "Tarjeta",
    placeholder: "¿Qué está mal con esta tarjeta? (ej. cuota anual cambió, beneficio ya no se ofrece...)",
    emailLabel: "Email (opcional, para seguimiento)",
    emailPlaceholder: "tu@email.com",
    submit: "Enviar reporte",
    cancel: "Cancelar",
    submitting: "Enviando…",
    thanks: "¡Reportado, gracias!",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorRate: "Demasiados reportes. Inténtalo más tarde.",
    errorMsgLen: "Escribe al menos 5 caracteres.",
    errorMsgMax: "Máximo 2000 caracteres.",
  },
};

type Lang = keyof typeof STRINGS;

interface Props {
  cardId: string;
  cardName: string;
  lang: Lang | string;
  /** Render-prop trigger; receives an onClick that opens the modal. */
  trigger?: (onClick: () => void) => React.ReactNode;
  /** className for the default <button> trigger when `trigger` is not provided. */
  className?: string;
}

export default function ReportErrorModal({ cardId, cardName, lang, trigger, className }: Props) {
  const t = STRINGS[(lang as Lang) in STRINGS ? (lang as Lang) : "en"];
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setError(null);
    if (done) {
      setMessage("");
      setEmail("");
      setDone(false);
    }
  }, [submitting, done]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) { setError(t.errorMsgLen); return; }
    if (trimmed.length > 2000) { setError(t.errorMsgMax); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: cardId,
          lang,
          message: trimmed,
          email: email.trim() || undefined,
        }),
      });
      if (res.status === 429) { setError(t.errorRate); return; }
      if (!res.ok) { setError(t.errorGeneric); return; }
      setDone(true);
    } catch {
      setError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }, [message, email, cardId, lang, t]);

  const triggerEl = trigger
    ? trigger(() => setOpen(true))
    : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || "text-xs text-slate-400 hover:text-red-500 transition-colors"}
      >
        {t.trigger}
      </button>
    );

  return (
    <>
      {triggerEl}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-error-title"
          >
            <h2 id="report-error-title" className="text-lg font-bold text-slate-900 mb-1">
              {t.title}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {t.contextLabel}: <span className="font-medium text-slate-700">{cardName}</span>
            </p>

            {done ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-emerald-700 text-sm font-medium">✓ {t.thanks}</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-3 text-xs text-emerald-600 underline hover:text-emerald-800"
                >
                  {t.cancel}
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t.placeholder}
                  rows={5}
                  maxLength={2000}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                />
                <label className="block mt-3 text-xs text-slate-500">
                  {t.emailLabel}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
                <div className="flex gap-2 mt-4 justify-end">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="text-sm px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || message.trim().length < 5}
                    className="text-sm px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? t.submitting : t.submit}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
