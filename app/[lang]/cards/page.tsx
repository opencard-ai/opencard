import { redirect } from "next/navigation";
import { locales } from "@/lib/i18n";

export const dynamic = "force-static";
export const revalidate = 3600;

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
