import type { Metadata } from "next";
import Link from "next/link";
import { getCardById } from "@/lib/cards";
import { getCardstayPlace, getPlaceVerdict } from "@/lib/cardstay/data";
import { locales } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string; slug: string }> };

export const dynamic = "force-static";

export async function generateStaticParams() {
  return locales.flatMap((lang) => [
    { lang, slug: "bellagio-las-vegas" },
    { lang, slug: "conrad-las-vegas" },
    { lang, slug: "park-hyatt-tokyo" },
    { lang, slug: "ritz-carlton-new-york-nomad" },
    { lang, slug: "hilton-hawaiian-village-waikiki-beach-resort" },
  ]);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = getCardstayPlace(slug);
  return { title: place ? `${place.name} — CardStay` : "CardStay hotel" };
}

export default async function HotelPage({ params }: Props) {
  const { lang, slug } = await params;
  const place = getCardstayPlace(slug);
  if (!place) {
    return <div className="max-w-2xl mx-auto px-4 py-16">Place not found</div>;
  }

  const wallet = ["amex-platinum", "chase-sapphire-reserve", "capital-one-venture", "amex-hilton-honors-aspire"]
    .map((id) => getCardById(id))
    .filter((card): card is NonNullable<typeof card> => card !== null);
  const verdict = getPlaceVerdict(place.place_id, wallet);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link href={`/${lang}/stay`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to CardStay</Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">{place.name}</h1>
      <p className="mt-2 text-slate-600">{place.summary}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Verdict</div>
        <p className="mt-2 text-slate-600">{verdict?.fit_label} · {verdict?.confidence}</p>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          {verdict?.eligible_benefits.map((benefit) => (
            <div key={benefit.program} className="rounded-xl bg-slate-50 p-3">
              <div className="font-semibold">{benefit.program}</div>
              <div>{benefit.reasons.join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
