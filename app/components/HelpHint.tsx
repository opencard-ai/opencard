"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  /** Body text shown when the hint opens. */
  text: string;
  /** Optional aria-label override (defaults to text). */
  label?: string;
  /** Override the default ⓘ icon. */
  icon?: React.ReactNode;
  /** Extra className for the trigger button. */
  className?: string;
}

/**
 * Inline help marker (ⓘ) that opens a small popover on click. Keeps the
 * surrounding row uncluttered while letting curious users pop a definition
 * for jargon ("FNA", "cardmember year", "FHR", etc.).
 *
 * On desktop a CSS `title` attribute also handles hover for power users.
 * On mobile, click → popover; tap outside or on the trigger again → close.
 */
export default function HelpHint({ text, label, icon, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label || text}
        aria-expanded={open}
        title={text}
        className={
          className ||
          "ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] text-slate-400 hover:text-slate-700 hover:bg-slate-200 leading-none"
        }
      >
        {icon ?? "ⓘ"}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 right-0 top-full mt-1 w-56 max-w-[80vw] bg-slate-900 text-white text-[11px] leading-snug rounded-lg shadow-lg p-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      )}
    </span>
  );
}
