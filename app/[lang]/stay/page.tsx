import type { Metadata } from "next";
import Link from "next/link";
import { getCardById } from "@/lib/cards";
import { getCardstayPlaces, makePlaceVerdicts } from "@/lib/cardstay/data";
import CardStayPlaceCard from "@/app/components/CardStayPlaceCard";
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
  return { title: `CardStay — ${copy.beta}`, description: "OpenCard hotel benefit routing scaffold" };
}

export default async function StayPage({ params }: Props) {
  const { lang } = await params;
  const copy = getStayCopy(lang as Locale);
  const places = getCardstayPlaces();
  const wallet = ["amex-platinum", "chase-sapphire-reserve", "capital-one-venture", "amex-hilton-honors-aspire"]
    .map((id) => getCardById(id))
    .filter((card): card is NonNullable<typeof card> => card !== null);
  const verdicts = makePlaceVerdicts(wallet).slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">CardStay</p>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">{copy.beta}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">{copy.title}</h1>
          <p className="mt-2 text-slate-600">{copy.subtitle}</p>
        </div>
        <Link href={`/${lang}/my-cards`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">{copy.backToMyCards}</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {verdicts.map((place) => (
            <CardStayPlaceCard key={place.place_id} lang={lang} place={place} />
          ))}
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">{copy.mapTitle}</div>
          <div className="mt-3 h-72 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-sm text-slate-400">
            {copy.mapPlaceholder}
          </div>
          <div className="mt-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">{copy.seededPlaces}</p>
            <ul className="mt-2 space-y-1">
              {places.map((place) => (
                <li key={place.place_id}>{place.name}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
