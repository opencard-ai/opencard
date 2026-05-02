"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT, type ToastPayload } from "@/lib/toast";

export default function ToastViewport() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<ToastPayload>).detail;
      if (!t) return;
      setToasts((prev) => [...prev, t]);
      if (t.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, t.duration);
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  if (toasts.length === 0) return null;

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-20 sm:bottom-6 z-[60] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-3"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.slice(-3).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full text-left rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-2 ${
            t.kind === "success"
              ? "bg-emerald-600 text-white"
              : t.kind === "error"
              ? "bg-rose-600 text-white"
              : "bg-slate-800 text-white"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
