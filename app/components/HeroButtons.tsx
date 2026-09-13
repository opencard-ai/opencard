"use client";
import Link from "next/link";
import { CreditCard, Wand2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const COPY = {
  en: ["Find my next card", "Answer three questions, compare your shortlist, and check issuer terms.", "Find cards", "Make the most of my cards", "Add cards you own, see available benefits, and record what you use.", "Manage my cards"],
  zh: ["我想辦新卡", "回答三個問題、比較候選卡片，再確認官方條款。", "開始選卡", "用好我已有的卡", "加入已有卡片、查看可用福利，記錄已使用項目。", "管理我的卡片"],
  "zh-cn": ["我想办新卡", "回答三个问题、比较候选卡片，再确认官方条款。", "开始选卡", "用好我已有的卡", "加入已有卡片、查看可用权益，记录已使用项目。", "管理我的卡片"],
  es: ["Encontrar mi próxima tarjeta", "Responde tres preguntas, compara opciones y consulta las condiciones del emisor.", "Encontrar tarjetas", "Aprovechar mis tarjetas", "Añade tus tarjetas, consulta beneficios disponibles y registra su uso.", "Gestionar mis tarjetas"],
};

export default function HeroButtons({ lang }: { lang: string }) {
  const copy = COPY[lang as keyof typeof COPY] || COPY.en;
  return <div className="grid gap-3 sm:grid-cols-2">
    {[{ route: "find", offset: 0, Icon: Wand2, journey: "new_card" }, { route: "my-cards", offset: 3, Icon: CreditCard, journey: "existing_cards" }].map(({ route, offset, Icon, journey }) => (
      <section key={route} className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:bg-slate-900 dark:border-slate-700">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><Icon className="h-5 w-5 text-blue-600" />{copy[offset]}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{copy[offset + 1]}</p>
        <Link href={`/${lang}/${route}`} onClick={() => trackEvent("journey_started", { journey, locale: lang })} className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{copy[offset + 2]} →</Link>
      </section>
    ))}
  </div>;
}
