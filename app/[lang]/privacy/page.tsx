import { locales } from "@/lib/i18n";

export const dynamic = "force-static";

type Props = {
  params: Promise<{ lang: string }>;
};

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function PrivacyPage({ params }: Props) {
  const { lang } = await params;

  const content = {
    en: {
      title: "Privacy Policy",
      lastUpdated: "Last updated: April 15, 2026",
      sections: [
        {
          heading: "1. Information We Collect",
          body: "We do not require users to create accounts to use our AI recommendation engine. We may collect non-personal data such as browser type, referring pages, and time spent on the site to improve our service."
        },
        {
          heading: "2. Cookies and Web Beacons",
          body: "Like any other website, OpenCard AI uses cookies to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience."
        },
        {
          heading: "3. Third-Party Advertising",
          body: "We may use third-party advertising companies (including Google) to serve ads when you visit our website. These companies may use information about your visits to this and other websites in order to provide relevant advertisements."
        },
        {
          heading: "4. Affiliate Disclosure",
          body: "OpenCard AI participates in various affiliate marketing programs. We may earn commissions when you purchase products through links on our site. This does not affect our editorial independence or card recommendations."
        },
        {
          heading: "5. AI and Data Processing",
          body: "Our chat interface uses Large Language Models (LLMs) to process your queries. Any data you enter is used solely to provide recommendations and is not sold to third parties."
        },
        {
          heading: "6. Your Consent",
          body: "By using our website, you hereby consent to our Privacy Policy and agree to its terms."
        },
        {
          heading: "7. Contact Us",
          body: "If you have any questions about this Privacy Policy, please contact us at support@opencardai.com."
        }
      ]
    },
    zh: {
      title: "隱私權政策",
      lastUpdated: "最後更新：2026年4月15日",
      sections: [
        {
          heading: "1. 我們收集的資訊",
          body: "我們不需要用戶創建帳戶即可使用 AI 推薦引擎。我們可能會收集非個人資料，例如瀏覽器類型、引用頁面以及在網站上停留的時間，以改進我們的服務。"
        },
        {
          heading: "2. Cookie 和網路信標",
          body: "與其他網站一樣，OpenCard AI 使用 Cookie 來儲存訪問者的偏好設定以及他們訪問過的頁面資訊。這些資訊用於優化用戶體驗。"
        },
        {
          heading: "3. 第三方廣告",
          body: "我們可能使用第三方廣告公司（包括 Google）在您訪問我們網站時投放廣告。這些公司可能使用您訪問本網站及其他網站的資訊來提供相關廣告。"
        },
        {
          heading: "4. 聯盟行銷揭露",
          body: "OpenCard AI 參與多項聯盟行銷計劃。當您通過我們網站上的鏈接購買產品時，我們可能會獲得佣金。這不會影響我們的編輯獨立性或卡片推薦。"
        },
        {
          heading: "5. AI 和資料處理",
          body: "我們的聊天介面使用大型語言模型 (LLM) 來處理您的查詢。您輸入的任何資料僅用於提供推薦，不會出售給第三方。"
        },
        {
          heading: "6. 您的同意",
          body: "使用我們的網站即表示您同意本隱私權政策並接受其條款。"
        },
        {
          heading: "7. 聯繫我們",
          body: "如果您對本隱私權政策有任何疑問，請通過 support@opencardai.com 與我們聯繫。"
        }
      ]
    },
    es: {
      title: "Política de Privacidad",
      lastUpdated: "Última actualización: 15 de abril de 2026",
      sections: [
        {
          heading: "1. Información que Recopilamos",
          body: "No requerimos que los usuarios creen cuentas para usar nuestro motor de recomendaciones de IA. Podemos recopilar datos no personales como el tipo de navegador, páginas de referencia y tiempo transcurrido en el sitio."
        },
        {
          heading: "2. Cookies y Web Beacons",
          body: "Al igual que cualquier otro sitio web, OpenCard AI utiliza cookies para almacenar información, incluidas las preferencias de los visitantes y las páginas que han visitado. Esta información se utiliza para optimizar la experiencia del usuario."
        },
        {
          heading: "3. Publicidad de Terceros",
          body: "Podemos utilizar empresas de publicidad de terceros (incluidos Google) para mostrar anuncios cuando visite nuestro sitio web. Estas empresas pueden utilizar información sobre sus visitas a este y otros sitios web para mostrar anuncios relevantes."
        },
        {
          heading: "4. Divulgación de Afiliados",
          body: "OpenCard AI participa en varios programas de marketing de afiliados. Podemos ganar comisiones cuando compre productos a través de enlaces en nuestro sitio. Esto no afecta nuestra independencia editorial ni las recomendaciones de tarjetas."
        },
        {
          heading: "5. IA y Procesamiento de Datos",
          body: "Nuestra interfaz de chat utiliza modelos de lenguaje grandes (LLM) para procesar sus consultas. Cualquier dato que ingrese se utiliza únicamente para proporcionar recomendaciones y no se vende a terceros."
        },
        {
          heading: "6. Su Consentimiento",
          body: "Al usar nuestro sitio web, usted acepta esta Política de Privacidad y está de acuerdo con sus términos."
        },
        {
          heading: "7. Contáctenos",
          body: "Si tiene alguna pregunta sobre esta Política de Privacidad, contáctenos en support@opencardai.com."
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
