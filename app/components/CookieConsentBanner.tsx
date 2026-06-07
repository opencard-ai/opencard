"use client";

import { useState, useSyncExternalStore } from "react";

const CONSENT_KEY = "opencard_cookie_consent";

type ConsentValue = "accepted" | "rejected" | "managed";

function subscribe(callback: () => void) {
  window.addEventListener("opencard-cookie-consent", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("opencard-cookie-consent", callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(CONSENT_KEY);
}

function getServerSnapshot() {
  return "pending";
}

function saveConsent(value: ConsentValue) {
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent("opencard-cookie-consent", { detail: value }));
}

export default function CookieConsentBanner({ lang }: { lang: string }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [manageOpen, setManageOpen] = useState(false);

  if (consent) return null;

  const copy = {
    en: {
      title: "Cookie choices",
      body:
        "OpenCard uses essential cookies to remember your preferences. With your consent, we may also use analytics, advertising, and affiliate measurement cookies to improve the site and support free credit card guides.",
      accept: "Accept all",
      reject: "Reject optional",
      manage: "Manage",
      save: "Save preferences",
      optional: "Optional analytics, advertising, and affiliate measurement cookies",
      privacy: "Privacy Policy",
    },
    zh: {
      title: "Cookie 偏好設定",
      body:
        "OpenCard 會使用必要 Cookie 記住您的偏好。經您同意後，我們也可能使用分析、廣告與聯盟成效衡量 Cookie，以改善網站並支持免費信用卡指南。",
      accept: "接受全部",
      reject: "拒絕選用",
      manage: "管理偏好",
      save: "儲存偏好",
      optional: "選用分析、廣告與聯盟成效衡量 Cookie",
      privacy: "隱私權政策",
    },
    "zh-cn": {
      title: "Cookie 偏好设置",
      body:
        "OpenCard 会使用必要 Cookie 记住您的偏好。经您同意后，我们也可能使用分析、广告与联盟效果衡量 Cookie，以改善网站并支持免费信用卡指南。",
      accept: "接受全部",
      reject: "拒绝可选",
      manage: "管理偏好",
      save: "保存偏好",
      optional: "可选分析、广告与联盟效果衡量 Cookie",
      privacy: "隐私政策",
    },
    es: {
      title: "Preferencias de cookies",
      body:
        "OpenCard usa cookies esenciales para recordar preferencias. Con su consentimiento, también podemos usar cookies de analítica, publicidad y medición de afiliados para mejorar el sitio y apoyar nuestras guías gratuitas.",
      accept: "Aceptar todo",
      reject: "Rechazar opcionales",
      manage: "Gestionar",
      save: "Guardar preferencias",
      optional: "Cookies opcionales de analítica, publicidad y afiliados",
      privacy: "Política de Privacidad",
    },
  } as const;

  const safeLang = lang === "zh" || lang === "zh-cn" || lang === "es" ? lang : "en";
  const t = copy[safeLang];

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-4 pb-4 pointer-events-none">
      <section className="pointer-events-auto max-w-5xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 sm:p-5 dark:bg-slate-950 dark:border-slate-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t.title}</h2>
            <p className="leading-relaxed">{t.body}</p>
            {manageOpen && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
                <p className="font-medium text-slate-700 dark:text-slate-200">{t.optional}</p>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {safeLang === "zh" ? "儲存偏好會拒絕選用 Cookie；接受全部才會啟用分析與廣告腳本。" : safeLang === "zh-cn" ? "保存偏好会拒绝可选 Cookie；接受全部才会启用分析与广告脚本。" : safeLang === "es" ? "Guardar preferencias rechaza cookies opcionales; solo Aceptar todo activa analítica y publicidad." : "Saving preferences rejects optional cookies; only Accept all enables analytics and advertising scripts."}
                </p>
              </div>
            )}
            <a href={`/${safeLang}/privacy`} className="inline-flex text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2">
              {t.privacy}
            </a>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end sm:min-w-64">
            <button onClick={() => saveConsent("rejected")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
              {t.reject}
            </button>
            <button onClick={() => (manageOpen ? saveConsent("managed") : setManageOpen(true))} className="rounded-full border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950">
              {manageOpen ? t.save : t.manage}
            </button>
            <button onClick={() => saveConsent("accepted")} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              {t.accept}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
