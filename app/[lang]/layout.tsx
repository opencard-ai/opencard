import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import RecommendWidget from "@/app/components/RecommendWidget";
import MyCardsWidget from "@/app/components/MyCardsWidget";
import { locales, t } from "@/lib/i18n";

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
  return {
    title: t("site.title", lang as any),
    description: t("site.subtitle", lang as any),
    icons: {
      icon: "/favicon-v6.ico",
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { lang } = await params;

  return (
    <html lang={lang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 text-slate-900 antialiased pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}
      >
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
          <div className="max-w-5xl mx-auto px-4 py-1 flex items-center justify-between">
            <a href={`/${lang}`} className="flex items-center gap-2 ml-16">
              <img src="/brand/logo-header.png?v=2" alt="OpenCard AI" className="h-12 w-auto object-contain" />
            </a>
            <div className="flex items-center gap-3 whitespace-nowrap">
              <nav className="flex items-center gap-3 text-sm text-slate-600 whitespace-nowrap">
                <a href={`/${lang}`} className="hover:text-slate-900 transition-colors">
                  {t("nav.allCards", lang as any)}
                </a>
<a href={`/${lang}/#about`} className="hover:text-slate-900 transition-colors">
                  {t("nav.about", lang as any)}
                </a>
              </nav>
              <LanguageSwitcher />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-white border-t border-slate-200 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <FTCDisclosure locale={lang as any} />
          </div>
        </footer>
        {/* Floating Widgets Container */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
          <div className="pointer-events-auto">
            <MyCardsWidget lang={lang} />
          </div>
          <div className="pointer-events-auto">
            <RecommendWidget lang={lang} />
          </div>
        </div>
      </body>
    </html>
  );
}

function FTCDisclosure({ locale }: { locale: any }) {
  return (
    <div className="text-xs text-slate-500 leading-relaxed space-y-2">
      <p className="font-semibold text-slate-600 mb-1">
        {t("ftc.disclosure", locale)}
      </p>
      <p>{t("ftc.text", locale)}</p>
      <div className="flex gap-4 pt-1">
        <a href={`/${locale}/privacy`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "隱私權政策" : locale === "es" ? "Política de Privacidad" : "Privacy Policy"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms`} className="hover:text-blue-600 transition-colors">
          {locale === "zh" ? "服務條款" : locale === "es" ? "Términos de Servicio" : "Terms of Service"}
        </a>
      </div>
    </div>
  );
}
