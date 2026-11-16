"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

// The banner is server-rendered (null = "no choice yet") so it paints with the
// first HTML instead of after hydration. Returning visitors never see a flash:
// the inline <head> script in app/[lang]/layout.tsx adds html.oc-consent-set
// and globals.css hides it until hydration removes it.
function getServerSnapshot() {
  return null;
}

function saveConsent(value: ConsentValue) {
  window.localStorage.setItem(CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent("opencard-cookie-consent", { detail: value }));
}

export default function CookieConsentBanner({ lang }: { lang: string }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [manageOpen, setManageOpen] = useState(false);

  const bannerRef = useRef<HTMLElement>(null);

  // Measure layout only; the consent UI is already present in the server HTML.
  // Keep the footer and floating controls reachable even with details expanded.
  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner || consent) return;
    const updateHeight = () => document.documentElement.style.setProperty(
      "--oc-consent-height", `${banner.getBoundingClientRect().height}px`,
    );
    document.documentElement.classList.add("oc-consent-open");
    const cleanup = () => {
      document.documentElement.classList.remove("oc-consent-open");
      document.documentElement.style.removeProperty("--oc-consent-height");
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return cleanup;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      cleanup();
    };
  }, [consent]);

  if (consent) return null;

  const copy = {
    en: {
      title: "Cookie choices",
      essential: "We use essential cookies to run the site.",
      body: "With your consent, we also use analytics, ad and affiliate cookies to improve the site and fund free guides.",
      accept: "Accept all",
      reject: "Reject optional",
      manage: "Manage",
      save: "Save preferences",
      optional: "Optional analytics, advertising, and affiliate measurement cookies",
      privacy: "Privacy Policy",
    },
    zh: {
      title: "Cookie 偏好設定",
      essential: "我們使用必要 Cookie 維持網站運作。",
      body: "經您同意後，我們也會使用分析、廣告與聯盟成效衡量 Cookie，用於改善網站並支持免費指南。",
      accept: "接受全部",
      reject: "拒絕選用",
      manage: "管理偏好",
      save: "儲存偏好",
      optional: "選用分析、廣告與聯盟成效衡量 Cookie",
      privacy: "隱私權政策",
    },
    "zh-cn": {
      title: "Cookie 偏好设置",
      essential: "我们使用必要 Cookie 维持网站运作。",
      body: "经您同意后，我们也会使用分析、广告与联盟效果衡量 Cookie，用于改善网站并支持免费指南。",
      accept: "接受全部",
      reject: "拒绝可选",
      manage: "管理偏好",
      save: "保存偏好",
      optional: "可选分析、广告与联盟效果衡量 Cookie",
      privacy: "隐私政策",
    },
    es: {
      title: "Preferencias de cookies",
      essential: "Usamos cookies esenciales para el sitio.",
      body: "Con su consentimiento, también usamos cookies de analítica, publicidad y afiliados para mejorar el sitio y financiar guías gratuitas.",
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

  const buttonClass = "min-h-11 min-w-0 rounded-lg border px-2 py-2 break-words hyphens-auto text-sm font-medium leading-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-300";

  return (
    <section
      ref={bannerRef}
      data-cookie-banner=""
      aria-labelledby="cookie-choices-title"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-slate-300 bg-white shadow-[0_-4px_16px_0_rgb(0_0_0/0.1)] dark:bg-slate-950 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]"
    >
      <h2 id="cookie-choices-title" className="sr-only">{t.title}</h2>
      <div className="max-w-5xl mx-auto px-3 py-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 flex-1 text-[13px] leading-[18px] sm:text-xs sm:leading-4 text-slate-700 dark:text-slate-200">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p>{t.essential}</p>
            <a href={`/${safeLang}/privacy`} className="font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-300">
              {t.privacy}
            </a>
          </div>
          <p>{t.body}</p>
          {manageOpen && (
            <div id="cookie-optional-details" className="mt-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-900">
              <p className="font-medium">{t.optional}</p>
              <p className="mt-1">
                {safeLang === "zh" ? "儲存偏好會拒絕選用 Cookie；接受全部才會啟用分析與廣告腳本。" : safeLang === "zh-cn" ? "保存偏好会拒绝可选 Cookie；接受全部才会启用分析与广告脚本。" : safeLang === "es" ? "Guardar preferencias rechaza cookies opcionales; solo Aceptar todo activa analítica y publicidad." : "Saving preferences rejects optional cookies; only Accept all enables analytics and advertising scripts."}
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[26rem] lg:shrink-0">
          <button type="button" onClick={() => saveConsent("rejected")} className={`${buttonClass} border-slate-500 text-slate-800 hover:bg-slate-100 dark:border-slate-400 dark:text-slate-100 dark:hover:bg-slate-800`}>
            {t.reject}
          </button>
          <button type="button" aria-expanded={manageOpen} aria-controls={manageOpen ? "cookie-optional-details" : undefined} onClick={() => (manageOpen ? saveConsent("managed") : setManageOpen(true))} className={`${buttonClass} border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950`}>
            {manageOpen ? t.save : t.manage}
          </button>
          <button type="button" onClick={() => saveConsent("accepted")} className={`${buttonClass} border-blue-600 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800`}>
            {t.accept}
          </button>
        </div>
      </div>
    </section>
  );
}
