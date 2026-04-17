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
      lastUpdated: "Last updated: April 17, 2026",
      sections: [
        {
          heading: "1. Information We Collect",
          body: "We do not require users to create accounts to use our AI recommendation engine. We may collect non-personal data such as browser type, referring pages, and time spent on the site to improve our service."
        },
        {
          heading: "2. Information You Provide",
          body: "When you sign up for credit card benefit reminders, you may voluntarily provide your email address. The credit cards you select in \"My Cards\" are stored locally in your browser (localStorage) and are not transmitted to our servers unless you opt in to email reminders."
        },
        {
          heading: "3. Email Reminders",
          body: "If you opt in to receive credit card benefit reminders, we will send you periodic emails about upcoming or expiring benefits on cards you own (such as quarterly credits, annual credits, and fee deadlines). We use a third-party email service provider to deliver these messages. You may unsubscribe at any time via the unsubscribe link in any email. We do not sell or rent your email address to third parties."
        },
        {
          heading: "4. Cookies and Web Beacons",
          body: "Like any other website, OpenCard AI uses cookies to store information including visitors' preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize the users' experience."
        },
        {
          heading: "5. Third-Party Advertising",
          body: "We may use third-party advertising companies (including Google) to serve ads when you visit our website. These companies may use information about your visits to this and other websites in order to provide relevant advertisements."
        },
        {
          heading: "6. Affiliate Disclosure",
          body: "OpenCard AI participates in various affiliate marketing programs. We may earn commissions when you purchase products through links on our site. This does not affect our editorial independence or card recommendations."
        },
        {
          heading: "7. AI and Data Processing",
          body: "Our chat interface uses Large Language Models (LLMs) to process your queries. Any data you enter is used solely to provide recommendations and is not sold to third parties."
        },
        {
          heading: "8. Data Retention and Deletion",
          body: "If you have subscribed to email reminders and wish to delete your data, contact us at support@opencardai.com. We will remove your email and associated card preferences from our systems within 30 days. Your locally stored data in your browser can be cleared by clearing your browser cache."
        },
        {
          heading: "9. Your Consent",
          body: "By using our website, you hereby consent to our Privacy Policy and agree to its terms. If you opt in to receive email reminders, you consent to receive periodic reminder emails and agree that you may unsubscribe at any time."
        },
        {
          heading: "10. Contact Us",
          body: "If you have any questions about this Privacy Policy, please contact us at support@opencardai.com."
        }
      ]
    },
    zh: {
      title: "隱私權政策",
      lastUpdated: "最後更新：2026年4月17日",
      sections: [
        {
          heading: "1. 我們收集的資訊",
          body: "我們不需要用戶創建帳戶即可使用 AI 推薦引擎。我們可能會收集非個人資料，例如瀏覽器類型、引用頁面以及在網站上停留的時間，以改進我們的服務。"
        },
        {
          heading: "2. 您主動提供的資訊",
          body: "當您訂閱信用卡福利提醒時，可能會自願提供您的電子信箱。您在「我的卡片」中選擇的信用卡會儲存在本機瀏覽器（localStorage）中，在您未訂閱郵件提醒前不會傳輸到我們的伺服器。"
        },
        {
          heading: "3. 郵件提醒服務",
          body: "若您選擇接收信用卡福利提醒，我們將定期發送電子郵件，通知您持有的卡片中即將到來或即將到期的福利（如季費回饋、年費優惠及年費截止日期）。我們使用第三方郵件服務供應商傳送郵件。您可隨時透過任何郵件中的取消訂閱連結退出。我們不會將您的電子信箱出售或出租給第三方。"
        },
        {
          heading: "4. Cookie 和網路信標",
          body: "與其他網站一樣，OpenCard AI 使用 Cookie 來儲存訪問者的偏好設定以及他們訪問過的頁面資訊。這些資訊用於優化用戶體驗。"
        },
        {
          heading: "5. 第三方廣告",
          body: "我們可能使用第三方廣告公司（包括 Google）在您訪問我們網站時投放廣告。這些公司可能使用您訪問本網站及其他網站的資訊來提供相關廣告。"
        },
        {
          heading: "6. 聯盟行銷揭露",
          body: "OpenCard AI 參與多項聯盟行銷計劃。當您通過我們網站上的鏈接購買產品時，我們可能會獲得佣金。這不會影響我們的編輯獨立性或卡片推薦。"
        },
        {
          heading: "7. AI 和資料處理",
          body: "我們的聊天介面使用大型語言模型 (LLM) 來處理您的查詢。您輸入的任何資料僅用於提供推薦，不會出售給第三方。"
        },
        {
          heading: "8. 資料保留與刪除",
          body: "若您已訂閱郵件提醒並希望刪除您的資料，請聯繫 support@opencardai.com。我們將在 30 天內從系統中移除您的電子信箱及相關卡片偏好。您瀏覽器中的本地資料可通過清除瀏覽器緩存來清除。"
        },
        {
          heading: "9. 您的同意",
          body: "使用我們的網站即表示您同意本隱私權政策並接受其條款。若您選擇訂閱郵件提醒，即表示您同意接收定期福利提醒郵件，並可隨時取消訂閱。"
        },
        {
          heading: "10. 聯繫我們",
          body: "如果您對本隱私權政策有任何疑問，請通過 support@opencardai.com 與我們聯繫。"
        }
      ]
    },
    es: {
      title: "Política de Privacidad",
      lastUpdated: "Última actualización: 17 de abril de 2026",
      sections: [
        {
          heading: "1. Información que Recopilamos",
          body: "No requerimos que los usuarios creen cuentas para usar nuestro motor de recomendaciones de IA. Podemos recopilar datos no personales como el tipo de navegador, páginas de referencia y tiempo transcurrido en el sitio."
        },
        {
          heading: "2. Información que Usted Proporciona",
          body: "Cuando se registre para recibir recordatorios de beneficios de tarjetas de crédito, puede proporcionar voluntariamente su dirección de correo electrónico. Las tarjetas de crédito que seleccione en \"Mis Tarjetas\" se almacenan localmente en su navegador (localStorage) y no se transmiten a nuestros servidores a menos que acepte recibir recordatorios por correo."
        },
        {
          heading: "3. Servicio de Recordatorios por Correo",
          body: "Si acepta recibir recordatorios de beneficios de tarjetas de crédito, le enviaremos correos electrónicos periódicos sobre beneficios próximos o que caducan en las tarjetas que posee (como créditos trimestrales, créditos anuales y fechas límite de tarifas). Utilizamos un proveedor de servicios de correo electrónico de terceros para entregar estos mensajes. Puede cancelar la suscripción en cualquier momento a través del enlace en cualquier correo. No vendemos ni alquilamos su dirección de correo a terceros."
        },
        {
          heading: "4. Cookies y Web Beacons",
          body: "Al igual que cualquier otro sitio web, OpenCard AI utiliza cookies para almacenar información, incluidas las preferencias de los visitantes y las páginas que han visitado. Esta información se utiliza para optimizar la experiencia del usuario."
        },
        {
          heading: "5. Publicidad de Terceros",
          body: "Podemos utilizar empresas de publicidad de terceros (incluidos Google) para mostrar anuncios cuando visite nuestro sitio web. Estas empresas pueden utilizar información sobre sus visitas a este y otros sitios web para mostrar anuncios relevantes."
        },
        {
          heading: "6. Divulgación de Afiliados",
          body: "OpenCard AI participa en varios programas de marketing de afiliados. Podemos ganar comisiones cuando compre productos a través de enlaces en nuestro sitio. Esto no afecta nuestra independencia editorial ni las recomendaciones de tarjetas."
        },
        {
          heading: "7. IA y Procesamiento de Datos",
          body: "Nuestra interfaz de chat utiliza modelos de lenguaje grandes (LLM) para procesar sus consultas. Cualquier dato que ingrese se utiliza únicamente para proporcionar recomendaciones y no se vende a terceros."
        },
        {
          heading: "8. Retención y Eliminación de Datos",
          body: "Si se ha inscrito en recordatorios por correo y desea eliminar sus datos, contáctenos en support@opencardai.com. Eliminaremos su correo electrónico y las preferencias de tarjetas asociadas de nuestros sistemas dentro de 30 días. Los datos almacenados localmente en su navegador se pueden borrar clearing la caché del navegador."
        },
        {
          heading: "9. Su Consentimiento",
          body: "Al usar nuestro sitio web, usted acepta esta Política de Privacidad y está de acuerdo con sus términos. Si acepta recibir recordatorios por correo, acepta recibir correos electrónicos periódicos y puede cancelar la suscripción en cualquier momento."
        },
        {
          heading: "10. Contáctenos",
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
