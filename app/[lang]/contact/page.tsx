import { locales } from "@/lib/i18n";

export const dynamic = "force-static";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function ContactPage({ params }: Props) {
  const { lang } = await params;
  const locale = lang as "en" | "zh" | "zh-cn" | "es";

  const copy = {
    en: {
      title: "Contact OpenCard",
      intro:
        "Questions, corrections, partnership inquiries, or privacy requests? We read every message and use reports to keep OpenCard accurate.",
      emailLabel: "General support",
      dataLabel: "Card data corrections",
      partnerLabel: "Affiliate or partnership inquiries",
      response: "We aim to respond within 3–5 business days. Please do not send credit card numbers, bank login details, Social Security numbers, or other sensitive personal data.",
    },
    zh: {
      title: "聯絡 OpenCard",
      intro:
        "有問題、資料修正、合作洽詢或隱私請求？我們會閱讀每一封訊息，並用回報持續改善 OpenCard 的準確性。",
      emailLabel: "一般支援",
      dataLabel: "信用卡資料修正",
      partnerLabel: "聯盟或合作洽詢",
      response: "我們通常會在 3–5 個工作天內回覆。請不要寄送信用卡號、銀行登入資料、SSN 或其他敏感個資。",
    },
    "zh-cn": {
      title: "联系 OpenCard",
      intro:
        "有问题、资料修正、合作咨询或隐私请求？我们会阅读每一封消息，并用反馈持续改善 OpenCard 的准确性。",
      emailLabel: "一般支持",
      dataLabel: "信用卡资料修正",
      partnerLabel: "联盟或合作咨询",
      response: "我们通常会在 3–5 个工作日内回复。请不要发送信用卡号、银行登录资料、SSN 或其他敏感个人信息。",
    },
    es: {
      title: "Contactar a OpenCard",
      intro:
        "¿Preguntas, correcciones, alianzas o solicitudes de privacidad? Leemos cada mensaje y usamos los reportes para mantener OpenCard preciso.",
      emailLabel: "Soporte general",
      dataLabel: "Correcciones de datos de tarjetas",
      partnerLabel: "Afiliados o alianzas",
      response: "Intentamos responder en 3–5 días hábiles. No envíe números de tarjeta, credenciales bancarias, SSN u otros datos sensibles.",
    },
  } as const;

  const c = copy[locale] || copy.en;

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:bg-slate-950 dark:border-slate-800">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{c.title}</h1>
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-8">{c.intro}</p>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          {[
            [c.emailLabel, "support@opencardai.com"],
            [c.dataLabel, "data@opencardai.com"],
            [c.partnerLabel, "partners@opencardai.com"],
          ].map(([label, email]) => (
            <a
              key={email}
              href={`mailto:${email}`}
              className="rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors dark:border-slate-800 dark:hover:bg-blue-950/30"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</div>
              <div className="text-sm font-medium text-blue-600 break-words">{email}</div>
            </a>
          ))}
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{c.response}</p>
      </div>
    </main>
  );
}
