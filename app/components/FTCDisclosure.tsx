import { t, type Locale } from "@/lib/i18n";

export default function FTCDisclosure({ locale }: { locale: Locale }) {
  return (
    <div className="text-xs text-slate-500 leading-relaxed space-y-2">
      <p className="font-semibold text-slate-600 mb-1">
        {t("ftc.disclosure", locale)}
      </p>
      <p>{t("ftc.text", locale)}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        <a href={`/${locale}/guides`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "信用卡指南" : locale === "zh-cn" ? "信用卡指南" : locale === "es" ? "Guías" : "Guides"}
        </a>
        <span>·</span>
        <a href={`/${locale}/about`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "關於我們" : locale === "zh-cn" ? "关于我们" : locale === "es" ? "Sobre nosotros" : "About"}
        </a>
        <span>·</span>
        <a href={`/${locale}/contact`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "聯絡我們" : locale === "zh-cn" ? "联系我们" : locale === "es" ? "Contacto" : "Contact"}
        </a>
        <span>·</span>
        <a href={`/${locale}/find`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "挑卡精靈" : locale === "zh-cn" ? "挑卡精灵" : locale === "es" ? "Buscar tarjeta" : "Find your card"}
        </a>
        <span>·</span>
        <a href={`/${locale}/elevated-offers`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "高額開卡禮" : locale === "zh-cn" ? "高额开卡奖励" : locale === "es" ? "Mejores bonos" : "Top welcome offers"}
        </a>
        <span>·</span>
        <a href={`/${locale}/privacy`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "隱私權政策" : locale === "zh-cn" ? "隐私政策" : locale === "es" ? "Política de Privacidad" : "Privacy Policy"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "服務條款" : locale === "zh-cn" ? "服务条款" : locale === "es" ? "Términos de Servicio" : "Terms of Service"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms#not-financial-advice`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "免責聲明" : locale === "zh-cn" ? "免责声明" : locale === "es" ? "Aviso legal" : "Disclaimer"}
        </a>
        <span>·</span>
        <a href={`/${locale}/terms#affiliate-links`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "聯盟揭露" : locale === "zh-cn" ? "联盟披露" : locale === "es" ? "Divulgación de afiliados" : "Affiliate Disclosure"}
        </a>
        <span>·</span>
        <a href={`/${locale}/methodology`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "方法論" : locale === "zh-cn" ? "方法论" : locale === "es" ? "Metodología" : "Methodology"}
        </a>
        <span>·</span>
        <a href={`/${locale}/developers`} className="inline-flex min-h-11 items-center px-2 hover:text-blue-600 transition-colors">
          {locale === "zh" ? "開發者" : locale === "zh-cn" ? "开发者" : locale === "es" ? "Desarrolladores" : "Developers"}
        </a>
      </div>
    </div>
  );
}
