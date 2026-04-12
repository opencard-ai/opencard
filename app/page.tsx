import { Suspense } from "react";
import { getAllCards, getAllIssuers, getAllTags } from "@/lib/cards";
import CardGrid from "./components/CardGrid";

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function HomePage() {
  const cards = getAllCards();
  const issuers = getAllIssuers();
  const tags = getAllTags();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          💳 OpenCard 信用卡百科
        </h1>
        <p className="text-slate-600">
          整理全台灣熱門信用卡的回饋、優惠與詳細比較，幫你找到最適合的卡片。
        </p>
      </section>

      <Suspense
        fallback={
          <div className="text-center py-12 text-slate-500">
            載入中...
          </div>
        }
      >
        <CardGrid cards={cards} issuers={issuers} tags={tags} />
      </Suspense>

      <section id="about" className="mt-16 bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3">關於 OpenCard</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          OpenCard
          是一個開源的信用卡資訊平台，所有資料皆來自公開資訊，並標明原始出處。我們致力於提供完整、客觀的信用卡比較資訊，幫助持卡人做出明智的選擇。
          資料更新時間可能與官網有所出入，申請前請以官方公告為準。
        </p>
      </section>
    </div>
  );
}
