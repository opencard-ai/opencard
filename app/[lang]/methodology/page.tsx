import type { Metadata } from "next";
import Link from "next/link";
import { locales } from "@/lib/i18n";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = { params: Promise<{ lang: string }> };

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === "zh" ? "OpenCard 編輯方法與資料標準" : lang === "zh-cn" ? "OpenCard 编辑方法与资料标准" : lang === "es" ? "Metodología editorial y estándares de datos" : "OpenCard Editorial Methodology and Data Standards",
    description: "How OpenCard sources, reviews, updates, values, and corrects US credit card information and editorial recommendations.",
  };
}

export default async function MethodologyPage({ params }: Props) {
  const { lang } = await params;
  const isZh = lang === "zh";
  const isZhCn = lang === "zh-cn";
  const isEs = lang === "es";
  const copy = isZh
    ? {
        title: "編輯方法與資料標準",
        intro: "OpenCard 的目標不是把最高估值排在最前面，而是幫助讀者理解一張卡在真實使用情境中的價值、成本與限制。以下說明我們如何蒐集、審查與修正資料。",
        sections: [
          ["來源優先順序", "我們優先使用發卡銀行產品頁、定價與條款頁、Guide to Benefits，以及官方新聞稿。可信的第三方信用卡媒體只用來補充歷史優惠、實際使用限制或交叉查核；關鍵申請條件仍以發卡銀行為準。"],
          ["資料更新", "卡片年費、開卡禮、消費門檻、回饋倍率與福利可能隨時變動。我們記錄最後更新日期，定期檢查主流卡，並在收到讀者修正後重新核對來源。無法確認的定向或邀請制優惠，不會當成人人可得的公開優惠。"],
          ["點數與福利估值", "估值是比較工具，不是保證現金價值。我們會區分現金兌換、旅遊平台、轉點夥伴與需要額外時間或彈性的高階兌換。年度抵用額採保守實用價值，不把讀者原本不會購買的服務當成等額現金。"],
          ["推薦與排序", "推薦會考慮年費、常見消費類別、使用難度、海外交易費、保險、轉點彈性與替代方案。最高開卡禮不會自動成為最佳選擇；讀者的消費與旅行習慣才是主要判斷依據。"],
          ["AI 與人工審查", "AI 協助整理大量公開資料、比對欄位與產生初步結構，但不應取代官方來源或編輯判斷。重要數字需有可追溯來源，指南需說明假設、取捨與不確定性。"],
          ["商業獨立與修正", "OpenCard 可能從部分連結取得報酬，但報酬不決定評分或推薦結果。若資料有誤，請寄至 data@opencardai.com 並附上官方來源；我們會查核並更新。本站內容僅供資訊參考，不構成財務建議。"],
        ],
        contact: "回報資料修正",
      }
    : isZhCn
    ? {
        title: "编辑方法与资料标准",
        intro: "OpenCard 的目标不是把最高估值排在最前面，而是帮助读者理解一张卡在真实使用场景中的价值、成本与限制。以下说明我们如何收集、审查与修正资料。",
        sections: [
          ["来源优先顺序", "我们优先使用发卡银行产品页、定价与条款页、Guide to Benefits 以及官方新闻稿。可信第三方媒体只用于补充历史优惠、实际限制或交叉核对；关键申请条件仍以发卡银行为准。"],
          ["资料更新", "年费、开卡奖励、消费门槛、回馈倍率与权益可能随时变化。我们记录最后更新时间，定期检查主流卡，并在收到读者修正后重新核对来源。无法确认的定向或邀请制优惠不会当作公开优惠。"],
          ["点数与权益估值", "估值是比较工具，不是保证现金价值。我们区分现金兑换、旅行平台、转点伙伴与需要额外时间或弹性的高阶兑换。年度抵用额采用保守实用价值。"],
          ["推荐与排序", "推荐会考虑年费、常见消费类别、使用难度、海外交易费、保险、转点弹性与替代方案。最高开卡奖励不会自动成为最佳选择。"],
          ["AI 与人工审查", "AI 协助整理公开资料、比对字段与产生初步结构，但不取代官方来源或编辑判断。重要数字需要可追溯来源，指南需要说明假设、取舍与不确定性。"],
          ["商业独立与修正", "OpenCard 可能从部分链接取得报酬，但报酬不决定评分或推荐结果。如资料有误，请寄至 data@opencardai.com 并附官方来源。本站内容不构成财务建议。"],
        ],
        contact: "反馈资料修正",
      }
    : isEs
    ? {
        title: "Metodología editorial y estándares de datos",
        intro: "OpenCard busca explicar el valor, el costo y las limitaciones reales de cada tarjeta, no simplemente ordenar las ofertas por la valoración más alta.",
        sections: [
          ["Prioridad de fuentes", "Priorizamos páginas del emisor, precios, términos, guías de beneficios y comunicados oficiales. Las fuentes secundarias confiables sirven para contexto histórico y verificación cruzada."],
          ["Actualizaciones", "Las cuotas, ofertas, requisitos y beneficios cambian. Registramos fechas de actualización, revisamos tarjetas principales y verificamos las correcciones de lectores contra fuentes públicas."],
          ["Valoración", "Las valoraciones son herramientas comparativas, no valores garantizados. Distinguimos efectivo, portales, socios de transferencia y canjes que requieren más flexibilidad."],
          ["Recomendaciones", "Consideramos cuota anual, gasto, facilidad de uso, comisiones, seguros, flexibilidad y alternativas. La oferta más grande no es automáticamente la mejor tarjeta."],
          ["IA y revisión humana", "La IA ayuda a organizar datos públicos y detectar diferencias, pero no reemplaza las fuentes oficiales ni el juicio editorial. Los datos importantes deben ser rastreables."],
          ["Independencia y correcciones", "OpenCard puede recibir compensación por algunos enlaces, pero esta no determina las recomendaciones. Envíe correcciones con una fuente oficial a data@opencardai.com. El contenido no es asesoramiento financiero."],
        ],
        contact: "Enviar una corrección",
      }
    : {
        title: "Editorial methodology and data standards",
        intro: "OpenCard is designed to help readers understand a card's real-world value, cost, and limitations—not simply rank whichever offer has the largest headline number. This page explains how we source, review, value, and correct our information.",
        sections: [
          ["Source hierarchy", "We prioritize issuer product pages, pricing and terms pages, official Guides to Benefits, and issuer press releases. Reputable credit card publications may add historical context, practical restrictions, or cross-checks, but material application terms should trace back to the issuer whenever possible."],
          ["Updates and freshness", "Annual fees, welcome offers, spending requirements, earning rates, and benefits can change without notice. We display update dates, monitor major cards more frequently, and re-check sources after receiving a correction. Targeted, referral, or invitation-only offers are not presented as universally available unless that limitation is explicit."],
          ["Points and benefit valuation", "A valuation is a comparison tool, not guaranteed cash value. We distinguish cash redemptions, travel portals, transfer partners, and advanced redemptions that require time or flexibility. Statement credits are valued conservatively: a benefit for something a reader would not otherwise buy is not treated as cash at face value."],
          ["Recommendations and rankings", "Recommendations consider annual fees, common spending categories, ease of use, foreign transaction fees, protections, transfer flexibility, and realistic alternatives. The largest welcome offer does not automatically make a card the best choice; the reader's spending and travel habits matter more."],
          ["AI and human review", "AI helps organize public information, compare structured fields, and flag possible changes. It does not replace primary sources or editorial judgment. Material figures should remain traceable, and guides should explain assumptions, trade-offs, and uncertainty rather than presenting generated conclusions as fact."],
          ["Commercial independence and corrections", "OpenCard may receive compensation from some links, but compensation does not determine ratings or recommendation order. To report an error, email data@opencardai.com with the card name and an official source. We review corrections and update confirmed facts. OpenCard provides general information, not financial advice."],
        ],
        contact: "Report a data correction",
      };

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">{copy.title}</h1>
        <p className="text-lg text-slate-600 leading-relaxed mb-10">{copy.intro}</p>
        <div className="space-y-8">
          {copy.sections.map(([heading, body]) => (
            <section key={heading}>
              <h2 className="text-xl font-bold text-slate-800 mb-2">{heading}</h2>
              <p className="text-slate-600 leading-relaxed">{body}</p>
            </section>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-slate-200">
          <Link href={`/${lang}/contact`} className="font-semibold text-blue-600 hover:text-blue-700">
            {copy.contact} →
          </Link>
        </div>
      </article>
    </main>
  );
}
