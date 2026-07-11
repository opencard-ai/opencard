import type { Metadata } from "next";
import Link from "next/link";
import { locales, type Locale } from "@/lib/i18n";
import { getStayCopy } from "@/lib/cardstay/copy";

type Props = { params: Promise<{ lang: string }> };

export const dynamic = "force-static";

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const copy = getStayCopy(lang as Locale);
  return { title: `CardStay — ${copy.beta} — ${copy.savedTitle}` };
}

export default async function SavedPlacesPage({ params }: Props) {
  const { lang } = await params;
  const copy = getStayCopy(lang as Locale);
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={`/${lang}/stay`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">{copy.backToStay}</Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-3xl font-bold text-slate-900">{copy.savedTitle}</h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">{copy.beta}</span>
      </div>
      <p className="mt-3 text-slate-600">{copy.savedBody}</p>
    </div>
  );
}
