import type { Metadata } from "next";
import Link from "next/link";
import { getCardById } from "@/lib/cards";
import { getCardstayPlaces, makePlaceVerdicts } from "@/lib/cardstay/data";
import CardStayPlaceCard from "@/app/components/CardStayPlaceCard";
import { locales } from "@/lib/i18n";

type Props = { params: Promise<{ lang: string }> };

export const dynamic = "force-static";

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const title = lang === "zh" ? "CardStay — 飯店福利地圖" : lang === "zh-cn" ? "CardStay — 酒店福利地图" : lang === "es" ? "CardStay — mapa de hoteles" : "CardStay — hotel benefit map";
  return { title, description: "OpenCard hotel benefit routing scaffold" };
}

export default async function StayPage({ params }: Props) {
  const { lang } = await params;
  const places = getCardstayPlaces();
  const wallet = ["amex-platinum", "chase-sapphire-reserve", "capital-one-venture", "amex-hilton-honors-aspire"]
    .map((id) => getCardById(id))
    .filter((card): card is NonNullable<typeof card> => card !== null);
  const verdicts = makePlaceVerdicts(wallet).slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">CardStay</p>
          <h1 className="text-3xl font-bold text-slate-900">Find hotels where your OpenCard benefits actually work.</h1>
          <p className="mt-2 text-slate-600">Seeded hotel routing for FHR, THC, The Edit, Premier Collection, and Hilton benefits.</p>
        </div>
        <Link href={`/${lang}/my-cards`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Back to My Cards</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {verdicts.map((place) => (
            <CardStayPlaceCard key={place.place_id} lang={lang} place={place} />
          ))}
        </div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Map placeholder</div>
          <div className="mt-3 h-72 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-sm text-slate-400">
            map/list view scaffold
          </div>
          <div className="mt-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Seed places</p>
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
