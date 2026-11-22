import type { Metadata } from "next";
import Link from "next/link";
import BenefitExpirationTracker from "@/app/components/BenefitExpirationTracker";
import { localizedAlternates, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return pageMetadata(lang, "/benefit-expiration-tracker", {
    title: lang === "zh" ? "信用卡福利到期追蹤工具 — OpenCard" : lang === "zh-cn" ? "信用卡权益到期追踪工具 — OpenCard" : lang === "es" ? "Seguimiento del vencimiento de beneficios — OpenCard" : "Credit Card Benefit Expiration Tracker — OpenCard",
    description: lang === "zh" ? "在瀏覽器中私下記錄信用卡抵用額、住宿券、通行證及到期日。" : lang === "zh-cn" ? "在浏览器中私密记录信用卡抵扣额度、住宿券、通行证及到期日。" : lang === "es" ? "Lleva un registro privado en tu navegador de los créditos, certificados, pases y fechas de vencimiento de tus tarjetas." : "Track credit-card credits, certificates, passes, and their expiration dates privately in your browser.",
    robots: lang === "en" ? { index: true, follow: true } : { index: false, follow: true },
    // English-only page: self canonical + en/x-default hreflang (matches card-page pattern).
    alternates: localizedAlternates(lang, "/benefit-expiration-tracker", ["en"]),
  });
}

export default async function BenefitExpirationTrackerPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
    <Link href={`/${lang}/guides/credit-card-benefit-expiration-guide`} className="text-sm text-blue-700 underline underline-offset-2">Read the benefit-expiration guide</Link>
    <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Credit Card Benefit Expiration Tracker</h1>
    <p className="mt-4 mb-8 leading-relaxed text-slate-600">Turn monthly credits, annual certificates, lounge passes, and renewal benefits into a dated checklist. Enter only the value you would realistically use—not the issuer’s headline value.</p>
    <BenefitExpirationTracker />
  </main>;
}
