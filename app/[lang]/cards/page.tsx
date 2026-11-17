import { redirect } from "next/navigation";
import { locales } from "@/lib/i18n";

export const dynamic = "force-static";
// ISR: daily, not hourly. Page data comes from data/cards/*.json, which only
// changes on deploy (and every deploy starts a fresh ISR cache), so hourly
// regeneration only burned ISR Write units (Hobby: 200k/month). 86400 keeps
// date-relative text (e.g. "reviewed N days ago") at most a day stale.
export const revalidate = 86400;

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map(lang => ({ lang }));
}

// /cards now redirects to homepage where the full card browser lives
export default async function CardsRedirectPage({ params }: Props) {
  const { lang } = await params;
  redirect(`/${lang}#cards-section`);
}
