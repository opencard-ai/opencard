import { t, locales } from "@/lib/i18n";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function AboutPage({ params }: Props) {
  const { lang } = await params;
  const locale = lang as "en" | "zh" | "zh-cn" | "es";

  const content = {
    en: {
      title: "About OpenCard AI",
      subtitle: "Unlocking Lifestyle Benefits Through Intelligence",
      mission: "At OpenCard AI, we believe everyone deserves to maximize their lifestyle through smarter financial choices. We go beyond simple credit card recommendations to bring you a comprehensive guide to travel perks, shopping rewards, and exclusive lifestyle benefits.",
      story: "Founded in 2024, OpenCard AI was built to solve the complexity of the US credit card and rewards ecosystem. Our AI-driven platform analyzes hundreds of offers to ensure you never miss out on a sign-up bonus or a hidden perk.",
      focus: ["Credit Card Maximization", "Hotel & Airline Elite Status", "Daily Shopping Rewards", "Financial Freedom Tips"],
      authorTitle: "Editorial lead",
      authorName: "Kacey",
      authorBio: "Kacey maintains OpenCard's card database, long-form guides, and benefit-tracking workflows. The editorial process emphasizes public issuer terms, cited sources, practical cardholder scenarios, and conservative financial disclaimers.",
      methodologyTitle: "Editorial methodology",
      methodology: "OpenCard combines public issuer pages, official terms, trusted credit card references, and manual review. AI helps organize recommendations, but every guide is written to explain assumptions, trade-offs, and limits. Card terms change often, so readers should verify final details with the issuer before applying.",
    },
    zh: {
      title: "關於 OpenCard AI",
      subtitle: "智慧解鎖生活福利的入口",
      mission: "在 OpenCard AI，我們相信每個人都能透過更聰明的財務選擇來提升生活品質。我們不只提供信用卡推薦，更為您整理全球旅遊特權、購物獎勵以及隱藏的生活福利。",
      story: "成立於 2024 年，OpenCard AI 旨在解決美國信用卡與獎勵機制過於複雜的問題。透過 AI 驅動的平台，我們分析數百種優惠，確保您不會錯過任何開卡禮或隱藏福利。",
      focus: ["信用卡權益最大化", "飯店與航空高級會籍", "日常購物返現", "財務自由規劃"],
      authorTitle: "編輯負責人",
      authorName: "Kacey",
      authorBio: "Kacey 維護 OpenCard 的信用卡資料庫、長篇指南與福利追蹤流程。編輯流程重視官方條款、公開來源、實際持卡情境與保守的財務免責說明。",
      methodologyTitle: "編輯方法論",
      methodology: "OpenCard 結合發卡銀行公開頁面、官方條款、可信信用卡資料來源與人工審查。AI 協助整理推薦，但每篇指南都會說明假設、取捨與限制。信用卡條款可能變動，申請前仍應以發卡銀行官方資訊為準。",
    },
    "zh-cn": {
      title: "关于 OpenCard AI",
      subtitle: "智能解锁生活福利的入口",
      mission: "在 OpenCard AI，我们相信每个人都能通过更聪明的财务选择来提升生活品质。我们不只提供信用卡推荐，更为您整理全球旅行特权、购物奖励以及隐藏的生活福利。",
      story: "成立于 2024 年，OpenCard AI 旨在解决美国信用卡与奖励机制过于复杂的问题。通过 AI 驱动的平台，我们分析数百种优惠，确保您不会错过任何开卡奖励或隐藏福利。",
      focus: ["信用卡权益最大化", "酒店与航空高级会籍", "日常购物返现", "财务自由规划"],
      authorTitle: "编辑负责人",
      authorName: "Kacey",
      authorBio: "Kacey 维护 OpenCard 的信用卡资料库、长篇指南与权益追踪流程。编辑流程重视官方条款、公开来源、实际持卡场景与保守的财务免责声明。",
      methodologyTitle: "编辑方法论",
      methodology: "OpenCard 结合发卡银行公开页面、官方条款、可信信用卡资料来源与人工审查。AI 协助整理推荐，但每篇指南都会说明假设、取舍与限制。信用卡条款可能变动，申请前仍应以发卡银行官方信息为准。",
    },
    es: {
      title: "Sobre OpenCard AI",
      subtitle: "Desbloqueando beneficios de estilo de vida con inteligencia",
      mission: "En OpenCard AI, creemos que todos merecen maximizar su estilo de vida a través de decisiones financieras más inteligentes. Vamos más allá de las recomendaciones de tarjetas para ofrecerte una guía de beneficios de viaje y compras.",
      story: "Fundada en 2024, OpenCard AI nació para resolver la complejidad del ecosistema de recompensas. Nuestra plataforma analiza cientos de ofertas para que nunca pierdas un bono.",
      focus: ["Maximización de Tarjetas", "Estatus Elite en Hoteles", "Recompensas de Compras", "Libertad Financiera"],
      authorTitle: "Responsable editorial",
      authorName: "Kacey",
      authorBio: "Kacey mantiene la base de datos de tarjetas, las guías y los flujos de seguimiento de beneficios de OpenCard. El proceso editorial prioriza términos oficiales, fuentes citadas, escenarios prácticos y avisos financieros conservadores.",
      methodologyTitle: "Metodología editorial",
      methodology: "OpenCard combina páginas públicas de emisores, términos oficiales, referencias confiables y revisión manual. La IA ayuda a organizar recomendaciones, pero cada guía explica supuestos, compensaciones y límites. Los términos cambian con frecuencia; verifique siempre con el emisor antes de solicitar.",
    }
  };

  const c = content[locale] || content.en;

  return (
    <div id="about" className="max-w-4xl mx-auto px-4 py-12" >
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">{c.title}</h1>
        <p className="text-xl text-blue-600 font-medium">{c.subtitle}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-10">
        <section>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">{t("about.mission", locale)}</h2>
          <p className="text-slate-600 leading-relaxed text-lg">{c.mission}</p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-50 rounded-xl p-6">
            <h3 className="font-bold text-slate-800 mb-3">What We Do</h3>
            <ul className="space-y-2">
              {c.focus.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-600">
                  <span className="text-blue-500">✦</span> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-blue-600 rounded-xl p-6 text-white">
            <h3 className="font-bold mb-3">{t("about.story", locale)}</h3>
            <p className="text-blue-50 leading-relaxed text-sm">{c.story}</p>
          </div>
        </section>


        <section className="grid grid-cols-1 md:grid-cols-2 gap-6" id="methodology">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-bold text-slate-800 mb-2">{c.authorTitle}</h3>
            <p className="text-sm font-semibold text-slate-900 mb-2">{c.authorName}</p>
            <p className="text-sm text-slate-600 leading-relaxed">{c.authorBio}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
            <h3 className="font-bold text-slate-800 mb-2">{c.methodologyTitle}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{c.methodology}</p>
          </div>
        </section>

        <section className="text-center pt-6 border-t border-slate-100">
          <p className="text-slate-500 mb-6 italic">Ready to find your next benefit?</p>
          <Link href={`/${lang}`} className="inline-block bg-slate-900 text-white px-8 py-3 rounded-full font-bold hover:bg-slate-800 transition-colors">
            Start AI Recommendation
          </Link>
        </section>
      </div>
    </div>
  );
}
