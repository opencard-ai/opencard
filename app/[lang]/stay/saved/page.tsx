import type { Metadata } from "next";
import Link from "next/link";
import { locales } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export const dynamic = "force-static";

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return { title: lang === "zh" ? "CardStay — 已儲存" : "CardStay — saved places" };
}

export default async function SavedPlacesPage({ params }: Props) {
  const { lang } = await params;
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href={`/${lang}/stay`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to CardStay</Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Saved places</h1>
      <p className="mt-3 text-slate-600">Scaffold only for now.</p>
    </div>
  );
}
