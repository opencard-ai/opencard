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

  const c = {
    en: {
      title: "Privacy Policy",
      lastUpdated: "Last updated: April 18, 2026",
      intro: "OpenCard AI is committed to protecting your privacy. This policy explains how we collect, use, and protect your information when you use our credit card benefits management service.",
      sections: [
        {
          heading: "1. Information We Collect",
          body: "We collect the following information:\n\n• Email address: When you subscribe to benefit reminders, you provide your email. We store it using industry-standard one-way hashing (SHA-256). We never store your plaintext email in our database.\n\n• Saved card IDs: When you add cards to \"My Cards,\" we store only the card identifiers (e.g., \"amex-platinum\"), not your actual credit card numbers or personal financial data.\n\n• Usage data: Browser type, referring pages, and time spent on the site to improve our service."
        },
        {
          heading: "2. How We Protect Your Data",
          body: "We take data security seriously:\n\n• Email hashing: Your email is hashed with SHA-256 before storage. We cannot reverse the hash to recover your email.\n\n• Secure transmission: All data is transmitted over HTTPS (TLS encryption).\n\n• Minimal data collection: We only store what is necessary to provide the service.\n\n• Third-party email service: We use AgentMail to send reminder emails. Your email is obfuscated (reversed and base64 encoded) when passed to our email service, and is deleted from that service after sending."
        },
        {
          heading: "3. Email Reminders (Opt-In)",
          body: "If you opt in to receive benefit reminders:\n\n• We send periodic emails about upcoming or expiring credits on cards you own.\n\n• Every email includes an unsubscribe link. Clicking it immediately removes you from all future mailings.\n\n• You can also request full data deletion at any time (see Section 6).\n\n• We never sell, rent, or share your email with advertisers or third parties."
        },
        {
          heading: "4. Double Opt-In Verification",
          body: "When you subscribe, we send a verification email to confirm your address. Your subscription is only activated after you click the verification link. This prevents unauthorized signups and ensures email deliverability."
        },
        {
          heading: "5. Cookies",
          body: "We use minimal cookies to:\n\n• Store your language preference\n• Maintain basic session state\n\nWe do not use advertising cookies or tracking pixels."
        },
        {
          heading: "6. Data Retention and Deletion",
          body: "You have full control over your data:\n\n• Unsubscribe: Click the \"Unsubscribe\" link in any email, or visit /my-cards to update your preferences.\n\n• Delete all data: Send a DELETE request to /api/my-cards/delete with your email. All your data is permanently removed within 30 days.\n\n• Local data: Cards saved in your browser (localStorage) are only on your device. Clear your browser cache to remove them."
        },
        {
          heading: "7. Third-Party Services",
          body: "We use the following third-party services:\n\n• Vercel: Website hosting and serverless functions\n• Upstash Redis: Encrypted data storage\n• AgentMail: Transactional email delivery\n• Google (optional): Google Sign-In for future authentication features\n\nThese providers have their own privacy policies."
        },
        {
          heading: "8. Children's Privacy",
          body: "Our service is not intended for users under 18 years of age. We do not knowingly collect information from minors."
        },
        {
          heading: "9. Changes to This Policy",
          body: "We may update this policy from time to time. Significant changes will be communicated via email to subscribers. Continued use of the service after changes constitutes acceptance of the new policy."
        },
        {
          heading: "10. Contact Us",
          body: "For privacy-related questions, data deletion requests, or concerns:\n\nEmail: opencard@opencardai.com\nWebsite: https://opencardai.com"
        }
      ]
    },
    zh: {
      title: "隱私權政策",
      lastUpdated: "最後更新：2026年4月18日",
      intro: "OpenCard AI 致力於保護您的隱私。本政策說明我們如何收集、使用及保護您在使用信用卡福利管理服務時的資訊。",
      sections: [
        {
          heading: "1. 我們收集的資訊",
          body: "我們收集以下資訊：\n\n• 電子信箱：當您訂閱福利提醒時提供。我們使用產業標準單向雜湊（SHA-256）儲存，絕不以明文形式存放。\n\n• 卡片 ID：當您將卡片加入「我的卡片」時，我們只儲存卡片識別符（如 \"amex-platinum\"），而非您的實際信用卡號碼或財務資料。\n\n• 使用資料：瀏覽器類型、引用頁面及網站停留時間，以改善服務品質。"
        },
        {
          heading: "2. 我們如何保護您的資料",
          body: "我們重視資料安全：\n\n• 信箱雜湊：您的 email 經 SHA-256 雜湊後儲存，無法逆向還原。\n\n• 安全傳輸：所有資料透過 HTTPS（TLS 加密）傳輸。\n\n• 最小化收集：只儲存提供服務所必需的資料。\n\n• 第三方郵件服務：我們使用 AgentMail 傳送提醒郵件。您的 email 在傳遞至郵件服務時經過混淆處理，且在發送後從該服務中刪除。"
        },
        {
          heading: "3. 郵件提醒（自願訂閱）",
          body: "若您選擇接收福利提醒：\n\n• 我們會定期發送關於您持有卡片即將到來或即將到期的回饋通知。\n\n• 每封郵件皆含取消訂閱連結，點擊後立即移除所有未來郵件。\n\n• 您也可隨時申請完全刪除資料（見第6節）。\n\n• 我們絕不會出售、出租或與廣告商或第三方分享您的 email。"
        },
        {
          heading: "4. 雙重驗證訂閱",
          body: "當您訂閱時，我們會發送驗證郵件確認您的地址。點擊驗證連結後，訂閱才會啟用。這能防止未經授權的註冊並確保郵件送達。"
        },
        {
          heading: "5. Cookie",
          body: "我們使用最少量 Cookie：\n\n• 儲存您的語言偏好\n• 維持基本工作階段狀態\n\n我們不使用廣告追蹤 Cookie 或追蹤像素。"
        },
        {
          heading: "6. 資料保留與刪除",
          body: "您對資料擁有完整控制權：\n\n• 取消訂閱：點擊任意郵件中的「取消訂閱」連結，或訪問 /my-cards 更新偏好設定。\n\n• 刪除所有資料：發送 DELETE 請求至 /api/my-cards/delete（附上您的 email）。所有資料將在30天內永久移除。\n\n• 本機資料：儲存在瀏覽器（localStorage）中的卡片資料僅在您的裝置上，清除瀏覽器緩存即可移除。"
        },
        {
          heading: "7. 第三方服務",
          body: "我們使用以下第三方服務：\n\n• Vercel：網站代管與無伺服器函式\n• Upstash Redis：加密資料儲存\n• AgentMail：交易郵件傳送\n• Google（可選）：用於未來驗證功能\n\n各服務供應商均有其專屬隱私權政策。"
        },
        {
          heading: "8. 兒童隱私",
          body: "本服務不適用於未滿18歲的用戶。我們不會故意收集未成年人的資訊。"
        },
        {
          heading: "9. 政策變更",
          body: "我們可能不時更新本政策。重大變更將透過電子郵件通知訂閱者。於變更後繼續使用服務即表示接受新政策。"
        },
        {
          heading: "10. 聯繫我們",
          body: "關於隱私權相關問題、資料刪除請求或疑慮：\n\n電子郵件：opencard@opencardai.com\n網站：https://opencardai.com"
        }
      ]
    },
    es: {
      title: "Política de Privacidad",
      lastUpdated: "Última actualización: 18 de abril de 2026",
      intro: "OpenCard AI se compromete a proteger su privacidad. Esta política explica cómo recopilamos, usamos y protegemos su información cuando usa nuestro servicio de gestión de beneficios de tarjetas de crédito.",
      sections: [
        {
          heading: "1. Información que Recopilamos",
          body: "Recopilamos la siguiente información:\n\n• Correo electrónico: Cuando se suscribe a recordatorios de beneficios. Lo almacenamos usando hash unidireccional estándar de la industria (SHA-256). Nunca almacenamos su correo en texto plano.\n\n• IDs de tarjetas: Cuando agrega tarjetas a \"Mis Tarjetas\", solo almacenamos los identificadores de tarjetas (p. ej., \"amex-platinum\"), no sus números reales de tarjetas de crédito ni datos financieros.\n\n• Datos de uso: Tipo de navegador, páginas de referencia y tiempo en el sitio para mejorar nuestro servicio."
        },
        {
          heading: "2. Cómo Protegemos sus Datos",
          body: "Tomamos la seguridad de datos en serio:\n\n• Hash de correo: Su correo se procesa con SHA-256 antes del almacenamiento. No podemos revertir el hash para recuperar su correo.\n\n• Transmisión segura: Todos los datos se transmiten por HTTPS (cifrado TLS).\n\n• Recopilación mínima: Solo almacenamos lo necesario para prestar el servicio.\n\n• Servicio de correo de terceros: Usamos AgentMail para enviar recordatorios. Su correo se ofusca al pasarse al servicio de correo y se elimina después del envío."
        },
        {
          heading: "3. Recordatorios por Correo (Suscripción Voluntaria)",
          body: "Si acepta recibir recordatorios de beneficios:\n\n• Enviamos correos periódicos sobre créditos próximos o que caducan en sus tarjetas.\n\n• Cada correo incluye un enlace para cancelar la suscripción. Al hacer clic, se le elimina inmediatamente de futuros envíos.\n\n• También puede solicitar la eliminación total de sus datos en cualquier momento (ver Sección 6).\n\n• Nunca vendemos, alquilamos ni compartimos su correo con anunciantes o terceros."
        },
        {
          heading: "4. Verificación de Doble Opt-In",
          body: "Cuando se suscribe, enviamos un correo de verificación para confirmar su dirección. Su suscripción solo se activa después de hacer clic en el enlace de verificación. Esto previene registros no autorizados y garantiza la entrega de correos."
        },
        {
          heading: "5. Cookies",
          body: "Usamos cookies mínimas para:\n\n• Almacenar su preferencia de idioma\n• Mantener el estado básico de la sesión\n\nNo usamos cookies publicitarias ni píxeles de seguimiento."
        },
        {
          heading: "6. Retención y Eliminación de Datos",
          body: "Tiene control total sobre sus datos:\n\n• Cancelar suscripción: Haga clic en \"Cancelar suscripción\" en cualquier correo, o visite /my-cards.\n\n• Eliminar todos los datos: Envíe una solicitud DELETE a /api/my-cards/delete con su correo. Todos sus datos se eliminan permanentemente en 30 días.\n\n• Datos locales: Las tarjetas guardadas en su navegador (localStorage) solo están en su dispositivo. Borre la caché del navegador para eliminarlas."
        },
        {
          heading: "7. Servicios de Terceros",
          body: "Usamos los siguientes servicios de terceros:\n\n• Vercel: Alojamiento web y funciones sin servidor\n• Upstash Redis: Almacenamiento de datos cifrado\n• AgentMail: Entrega de correos transaccionales\n• Google (opcional): Inicio de sesión con Google para futuras funciones de autenticación\n\nEstos proveedores tienen sus propias políticas de privacidad."
        },
        {
          heading: "8. Privacidad de Menores",
          body: "Nuestro servicio no está dirigido a usuarios menores de 18 años. No recopilamos intencionalmente información de menores."
        },
        {
          heading: "9. Cambios a Esta Política",
          body: "Podemos actualizar esta política ocasionalmente. Los cambios importantes se comunicarán por correo a los suscriptores. El uso continuado del servicio después de los cambios constituye la aceptación de la nueva política."
        },
        {
          heading: "10. Contáctenos",
          body: "Para preguntas relacionadas con la privacidad, solicitudes de eliminación de datos o inquietudes:\n\nCorreo: opencard@opencardai.com\nSitio web: https://opencardai.com"
        }
      ]
    }
  };

  const content = c[lang as keyof typeof c] || c.en;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2 text-slate-900">{content.title}</h1>
      <p className="text-slate-500 text-sm mb-6">{content.lastUpdated}</p>
      <p className="text-slate-600 leading-relaxed mb-8">{content.intro}</p>

      <div className="space-y-10 text-slate-700 leading-relaxed">
        {content.sections.map((section, i) => (
          <section key={i}>
            <h2 className="text-xl font-bold text-slate-900 mb-3">{section.heading}</h2>
            {section.body.split('\n\n').map((para, j) => (
              para.startsWith('•') ? (
                <ul key={j} className="list-disc pl-5 space-y-1">
                  {para.split('\n').map((item, k) => (
                    <li key={k} className="text-sm">{item.replace(/^• /, '')}</li>
                  ))}
                </ul>
              ) : (
                <p key={j} className="text-sm mb-2">{para}</p>
              )
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
