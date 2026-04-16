"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for debugging
    console.error("[error.tsx] Page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-red-100 p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">This page couldn&apos;t load</h1>
        <p className="text-sm text-slate-500 mb-6">
          Something went wrong on this page.
        </p>
        <details className="text-left mb-6 p-3 bg-red-50 rounded-lg border border-red-100">
          <summary className="text-xs font-semibold text-red-600 cursor-pointer mb-1">
            Error details (for debugging)
          </summary>
          <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap break-all font-mono">
            {error.message}
            {error.stack && `\n\nStack:\n${error.stack.split('\n').slice(0, 5).join('\n')}`}
          </pre>
        </details>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition"
          >
            Reload
          </button>
          <button
            onClick={() => window.history.back()}
            className="flex-1 border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-50 transition"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
