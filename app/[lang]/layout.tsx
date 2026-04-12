import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
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
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { lang } = await params;

  return (
    <html lang={lang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 text-slate-900 antialiased`}
      >
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href={`/${lang}`} className="flex items-center gap-2">
              <span className="text-2xl">💳</span>
              <span className="font-bold text-xl text-slate-900">
                OpenCard
              </span>
            </a>
            <div className="flex items-center gap-4">
              <nav className="flex items-center gap-4 text-sm text-slate-600">
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
      </body>
    </html>
  );
}

function FTCDisclosure({ locale }: { locale: any }) {
  return (
    <div className="text-xs text-slate-500 leading-relaxed">
      <p className="font-semibold text-slate-600 mb-1">
        {t("ftc.disclosure", locale)}
      </p>
      <p>{t("ftc.text", locale)}</p>
    </div>
  );
}
