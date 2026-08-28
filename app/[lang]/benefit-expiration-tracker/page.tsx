import type { Metadata } from "next";
import Link from "next/link";
import BenefitExpirationTracker from "@/app/components/BenefitExpirationTracker";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: "Credit Card Benefit Expiration Tracker — OpenCard",
    description: "Track credit-card credits, certificates, passes, and their expiration dates privately in your browser.",
    robots: lang === "en" ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: "/en/benefit-expiration-tracker" },
  };
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
