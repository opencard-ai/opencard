import { locales } from "@/lib/i18n";

export const dynamic = "force-static";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function TermsPage({ params }: Props) {
  const { lang } = await params;

  const content = {
    en: {
      title: "Terms of Service",
      lastUpdated: "Last updated: April 15, 2026",
      sections: [
        {
          heading: "1. Acceptance of Terms",
          body: "By accessing and using OpenCard AI, you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to abide by these terms, please do not use this service."
        },
        {
          heading: "2. Description of Service",
          body: "OpenCard AI is a credit card comparison and recommendation platform that provides information about US credit cards. Our AI-powered tools help users find suitable credit cards based on their spending habits and preferences."
        },
        {
          heading: "3. Not Financial Advice",
          body: "The content on OpenCard AI, including AI-generated recommendations, is for informational purposes only. We are not a financial institution, credit counselor, or law firm. Nothing on this site constitutes professional financial, legal, or investment advice. Always consult with qualified financial professionals before making credit decisions."
        },
        {
          heading: "4. Accuracy of Information",
          body: "While we strive to keep all information accurate and up-to-date, we cannot guarantee that all data is error-free. Credit card terms, rewards rates, annual fees, and welcome offers may change. Please verify all information with the issuing bank before applying."
        },
        {
          heading: "5. Affiliate Links",
          body: "OpenCard AI contains links to credit card applications on bank websites and may receive compensation from affiliate partnerships. This does not influence our recommendations or the information we provide."
        },
        {
          heading: "6. User Conduct",
          body: "You agree to use this service only for lawful purposes and in a way that does not infringe on the rights of others. You may not use the service to transmit any harmful code, spam, or illegal content."
        },
        {
          heading: "7. Limitation of Liability",
          body: "OpenCard AI shall not be held liable for any decisions made based on the information provided on this website. Users assume full responsibility for their financial decisions."
        },
        {
          heading: "8. Changes to Terms",
          body: "We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting to the website."
        },
        {
          heading: "9. Contact",
          body: "For questions about these Terms of Service, please contact us at support@opencardai.com."
        }
      ]
    },
    zh: {
      title: "服務條款",
      lastUpdated: "最後更新：2026年4月15日",
      sections: [
        {
          heading: "1. 條款接受",
          body: "存取和使用 OpenCard AI 即表示您接受並同意受本協議的條款和條件約束。如果您不同意遵守這些條款，請不要使用本服務。"
        },
        {
          heading: "2. 服務說明",
          body: "OpenCard AI 是一個信用卡比較和推薦平台，提供美國信用卡的資訊。我們的 AI 工具可根據用戶的消費習慣和偏好幫助他們找到適合的信用卡。"
        },
        {
          heading: "3. 非財務建議",
          body: "OpenCard AI 上的內容（包括 AI 生成的推薦）僅供資訊參考。我們不是金融機構、信用顧問或律師事務所。本網站上的任何內容都不構成專業的財務、法律或投資建議。在做出信用決策前，請務必諮詢合格的財務專業人士。"
        },
        {
          heading: "4. 資訊準確性",
          body: "雖然我們努力保持所有資訊的準確性和最新狀態，但無法保證所有數據都無錯誤。信用卡條款、回饋率、年費和開卡禮可能會有變化。請在申請前向發卡銀行驗證所有資訊。"
        },
        {
          heading: "5. 聯盟鏈接",
          body: "OpenCard AI 包含通往銀行網站信用卡申請的鏈接，並可能從聯盟合作夥伴關係中獲得報酬。這不會影響我們的推薦或提供的資訊。"
        },
        {
          heading: "6. 用戶行為",
          body: "您同意僅將本服務用於合法目的，且不以侵犯他人權利的方式使用。您不得使用本服務傳輸任何有害代碼、垃圾郵件或非法內容。"
        },
        {
          heading: "7. 責任限制",
          body: "OpenCard AI 不對因使用本網站資訊而做出的任何決定承擔責任。用戶須對其財務決策承擔全部責任。"
        },
        {
          heading: "8. 條款變更",
          body: "我們保留隨時修改這些條款的權利。變更將在發布到網站後立即生效。"
        },
        {
          heading: "9. 聯繫我們",
          body: "如對本服務條款有任何疑問，請通過 support@opencardai.com 與我們聯繫。"
        }
      ]
    },
    es: {
      title: "Términos de Servicio",
      lastUpdated: "Última actualización: 15 de abril de 2026",
      sections: [
        {
          heading: "1. Aceptación de los Términos",
          body: "Al acceder y utilizar OpenCard AI, usted acepta y accede a estar vinculado por los términos y condiciones de este acuerdo. Si no está de acuerdo con estos términos, no utilice este servicio."
        },
        {
          heading: "2. Descripción del Servicio",
          body: "OpenCard AI es una plataforma de comparación y recomendación de tarjetas de crédito que proporciona información sobre tarjetas de crédito de EE.UU. Nuestras herramientas impulsadas por IA ayudan a los usuarios a encontrar tarjetas de crédito adecuadas según sus hábitos de gasto y preferencias."
        },
        {
          heading: "3. No es Asesoramiento Financiero",
          body: "El contenido en OpenCard AI, incluidas las recomendaciones generadas por IA, tiene fines informativos únicamente. No somos una institución financiera, asesor de crédito ni bufete de abogados. Nada en este sitio constituye asesoramiento financiero, legal o de inversión profesional. Siempre consulte con profesionales financieros calificados antes de tomar decisiones de crédito."
        },
        {
          heading: "4. Precisión de la Información",
          body: "Si bien nos esforzamos por mantener toda la información precisa y actualizada, no podemos garantizar que todos los datos estén libres de errores. Los términos de las tarjetas de crédito, las tasas de recompensas, las cuotas anuales y las ofertas de bienvenida pueden cambiar. Verifique toda la información con el banco emisor antes de solicitar."
        },
        {
          heading: "5. Enlaces de Afiliados",
          body: "OpenCard AI contiene enlaces a solicitudes de tarjetas de crédito en sitios web de bancos y puede recibir compensación de asociaciones de afiliados. Esto no influye en nuestras recomendaciones ni en la información que proporcionamos."
        },
        {
          heading: "6. Conducta del Usuario",
          body: "Acepta utilizar este servicio solo para fines legales y de manera que no infrinja los derechos de terceros. No puede utilizar el servicio para transmitir ningún código dañino, spam o contenido ilegal."
        },
        {
          heading: "7. Limitación de Responsabilidad",
          body: "OpenCard AI no será responsable de ninguna decisión tomada basándose en la información proporcionada en este sitio web. Los usuarios asumen la plena responsabilidad de sus decisiones financieras."
        },
        {
          heading: "8. Cambios en los Términos",
          body: "Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios serán efectivos inmediatamente después de publicarse en el sitio web."
        },
        {
          heading: "9. Contacto",
          body: "Si tiene preguntas sobre estos Términos de Servicio, contáctenos en support@opencardai.com."
        }
      ]
    }
  };

  const c = content[lang as keyof typeof content] || content.en;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">{c.title}</h1>
      <p className="text-slate-500 text-sm mb-8">{c.lastUpdated}</p>
      
      <div className="space-y-8 text-slate-700 leading-relaxed">
        {c.sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-xl font-bold text-slate-900 mb-3">{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
