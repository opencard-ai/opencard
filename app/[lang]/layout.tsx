import Analytics from "@/app/components/Analytics";
import AdSenseScript from "@/app/components/AdSenseScript";
import CookieConsentBanner from "@/app/components/CookieConsentBanner";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import ThemeToggle from "@/app/components/ThemeToggle";
import FloatingButtons from "@/app/components/FloatingButtons";
import ToastViewport from "@/app/components/ToastViewport";
import GuidesDropdown from "@/app/components/GuidesDropdown";
import { locales, t, type Locale } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const baseUrl = "https://opencardai.com";
  const canonicalUrl = lang === "en" ? `${baseUrl}/en` : `${baseUrl}/${lang}`;
  const defaultLang = "en";
  const defaultUrl = `${baseUrl}/${defaultLang}`;
  const locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";
  const title = t("site.title", locale);
  const description = t("site.subtitle", locale);
  const localeMap: Record<string, string> = {
    en: "en_US",
    zh: "zh_TW",
    "zh-cn": "zh_CN",
    es: "es_ES",
  };

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-v7.ico", sizes: "any" },
      ],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${baseUrl}/en`,
        "zh-Hant": `${baseUrl}/zh`,
        "zh-Hans": `${baseUrl}/zh-cn`,
        es: `${baseUrl}/es`,
        "x-default": defaultUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "OpenCard.AI",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "OpenCard.AI — AI-powered credit card selection",
        },
      ],
      locale: localeMap[lang] || "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-image.png`],
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { lang } = await params;
  const locale = locales.includes(lang as Locale) ? (lang as Locale) : "en";

  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("opencard_theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
      </head>


<body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 text-slate-900 antialiased pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}
      >
        <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 py-1 flex items-center justify-between gap-3">
            <a href={`/${lang}`} className="inline-flex items-center gap-1.5 sm:gap-2 h-12 min-w-0" aria-label="OpenCard">
              <span className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-blue-900 dark:text-blue-950 font-black text-xl sm:text-2xl leading-none shadow-sm shrink-0">
                O
              </span>
              <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-blue-900 dark:text-white">
                Open<span className="text-amber-500 dark:text-amber-400">Card</span>
              </span>
            </a>
            <div className="flex items-center gap-1.5 sm:gap-3 whitespace-nowrap">
              <nav className="flex items-center text-sm text-slate-600 whitespace-nowrap">
                <GuidesDropdown lang={lang} />
              </nav>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex-1 pb-48 sm:pb-0">{children}</main>
        <footer className="bg-white border-t border-slate-200 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <FTCDisclosure locale={locale} />
          </div>
        </footer>
        {/* Analytics and advertising scripts honor cookie consent. */}
        <Analytics />
        <AdSenseScript />
        <CookieConsentBanner lang={lang} />
        {/* Floating widget cluster (recommend / my-cards / track) */}
        <FloatingButtons lang={lang} />
        {/* Global toast viewport */}
        <ToastViewport />
      </body>
    </html>
  );
}

function FTCDisclosure({ locale }: { locale: Locale }) {
  return (
    <div className="text-xs text-slate-500 leading-relaxed space-y-2">
      <p className="font-semibold text-slate-600 mb-1">
        {t("ftc.disclosure", locale)}
      </p>
      <p>{t("ftc.text", locale)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        <a href={`/${locale}/guides`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "信用卡指南" : locale === "zh-cn" ? "信用卡指南" : locale === "es" ? "Guías" : "Guides"}
        </a>
        <span>·</span>
        <a href={`/${locale}/about`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "關於我們" : locale === "zh-cn" ? "关于我们" : locale === "es" ? "Sobre nosotros" : "About"}
        </a>
        <span>·</span>
        <a href={`/${locale}/contact`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "聯絡我們" : locale === "zh-cn" ? "联系我们" : locale === "es" ? "Contacto" : "Contact"}
        </a>
        <span>·</span>
        <a href={`/${locale}/find`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "挑卡精靈" : locale === "zh-cn" ? "挑卡精灵" : locale === "es" ? "Buscar tarjeta" : "Find your card"}
        </a>
        <span>·</span>
        <a href={`/${locale}/elevated-offers`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "高額開卡禮" : locale === "zh-cn" ? "高额开卡奖励" : locale === "es" ? "Mejores bonos" : "Top welcome offers"}
        </a>
        <span>·</span>
        <a href={`/${locale}/privacy`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "隱私權政策" : locale === "zh-cn" ? "隐私政策" : locale === "es" ? "Política de Privacidad" : "Privacy Policy"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "服務條款" : locale === "zh-cn" ? "服务条款" : locale === "es" ? "Términos de Servicio" : "Terms of Service"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms#not-financial-advice`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "免責聲明" : locale === "zh-cn" ? "免责声明" : locale === "es" ? "Aviso legal" : "Disclaimer"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms#affiliate-links`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "聯盟揭露" : locale === "zh-cn" ? "联盟披露" : locale === "es" ? "Divulgación de afiliados" : "Affiliate Disclosure"}
        </a>
        <span>·</span>
        <a href={`/${locale}/about#methodology`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "方法論" : locale === "zh-cn" ? "方法论" : locale === "es" ? "Metodología" : "Methodology"}
        </a>
      </div>
    </div>
  );
}
