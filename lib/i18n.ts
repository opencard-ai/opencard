// OpenCard i18n - English, Chinese, Spanish

export const locales = ["en", "zh", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  es: "Español",
};

export interface CardLabels {
  name: string;
  issuer: string;
  annualFee: string;
  annualFeeWaived: string;
  welcomeBonus: string;
  earningRates: string;
  category: string;
  searchPlaceholder: string;
  allIssuers: string;
  allTags: string;
  clearFilters: string;
  showing: string;
  of: string;
  cards: string;
  backToList: string;
  quickInfo: string;
  creditRequired: string;
  network: string;
  foreignFee: string;
  none: string;
  applicationRules: string;
  travelBenefits: string;
  insurance: string;
  sources: string;
  lastUpdated: string;
  aboutTitle: string;
  aboutText: string;
  loading: string;
  noResults: string;
  tryAdjust: string;
}

const zh: Record<string, string> = {
  "site.title": "OpenCard AI 信用卡百科",
  "site.subtitle": "整理全美國熱門信用卡的回饋、優惠與詳細比較，幫你找到最適合的卡片。",
  "card.name": "卡片名稱",
  "card.issuer": "發卡機構",
  "card.annualFee": "年費",
  "card.annualFeeWaived": "免年費",
  "card.welcomeBonus": "開卡禮",
  "card.earningRates": "回饋比率",
  "card.category": "類別",
  "search.placeholder": "搜尋卡片名稱...",
  "filter.allIssuers": "所有發卡機構",
  "filter.allTags": "所有類型",
  "filter.clear": "清除篩選",
  "list.showing": "顯示",
  "list.of": "/",
  "list.cards": "張卡片",
  "nav.allCards": "所有卡片",
  "nav.about": "關於",
  "detail.backToList": "返回列表",
  "detail.quickInfo": "快速資訊",
  "detail.creditRequired": "信用要求",
  "detail.network": "卡片網路",
  "detail.foreignFee": "國外手續費",
  "detail.none": "無",
  "detail.welcomeBonus": "開卡禮",
  "detail.spendingReq": "需在 {months} 個月內消費 ${amount}",
  "detail.estimatedValue": "約 ${value}",
  "detail.points": "點",
  "detail.earningRates": "回饋比率",
  "detail.annualCredits": "年費回饋",
  "detail.travelBenefits": "旅遊福利",
  "detail.hotelStatus": "酒店會籍",
  "detail.loungeAccess": "貴賓室",
  "detail.otherBenefits": "其他福利",
  "detail.insurance": "保險保障",
  "detail.tripCancel": "旅遊取消",
  "detail.tripDelay": "航班延誤",
  "detail.rentalIns": "租車保險",
  "detail.purchaseProt": "購物保障",
  "detail.returnProt": "退貨保障",
  "detail.extendedWarranty": "延長保固",
  "detail.applicationRules": "申辦規定",
  "detail.sources": "資料來源",
  "detail.lastUpdated": "最後更新",
  "detail.credits": "報銷",
  "detail.perMonth": "每月",
  "detail.annual": "每年",
  "detail.semiAnnual": "每半年",
  "about.title": "關於 OpenCard AI",
  "about.text": "OpenCard 是一個開源的信用卡資訊平台，所有資料皆來自公開資訊，並標明原始出處。我們致力於提供完整、客觀的信用卡比較資訊，幫助持卡人做出明智的選擇。資料更新時間可能與官網有所出入，申請前請以官方公告為準。",
  "ftc.disclosure": "FTC 揭露聲明",
  "ftc.text": "本網站包含贊助連結。當您透過我們的連結申請信用卡並成功核卡時，我們可能會獲得報酬，但這不會影響您的核卡結果或我們的編輯獨立性。本網站上的資訊僅供參考，不構成財務建議。在申請任何信用卡前，請自行評估是否符合您的需求。",
  "ai.chatTitle": "AI 卡片助理",
  "ai.placeholder": "問我關於這張卡的事...",
  "ai.send": "送出",
  "ai.thinking": "思考中...",
  "ai.disclaimer": "AI 回覆僅供參考，核卡結果由銀行決定",
  "ai.welcome": "嗨！歡迎來到 {cardName} 的 AI 助理。我可以幫你分析這張卡片的優缺點、比較回饋，或回答任何相關問題。",
  "status.loading": "載入中...",
  "feed.title": "相關新聞",
  "feed.subtitle": "即時資訊與福利",
  "feed.updated": "更新於",
  "feed.all": "全部新聞",
  "feed.cards": "信用卡",
  "feed.banking": "銀行帳戶",
  "feed.noItems": "此分類目前沒有新聞",
  "feed.loading": "正在載入最新新聞...",
  "feed.refresh": "刷新",
  "feed.showLess": "↑ 顯示較少",
  "feed.loadMore": "↓ 展開更多 {count} 項",
  "home.title": "用 AI 找到最適合的卡片",
  "home.subtitle": "瀏覽 {count} 張來自頂尖發卡機構的卡片",
  "home.cardsAvailable": "{count} 張卡片可用",
  "status.noResults": "找不到符合條件的卡片",
  "status.tryAdjust": "試著調整篩選條件",
  "tag.noAnnualFee": "免年費",
  "tag.premium": " premium",
  "tag.travel": "旅遊",
  "tag.hotel": "飯店",
  "tag.airline": "航空",
  "tag.points": "點數回饋",
  "tag.cashback": "現金回饋",
};

const en: Record<string, string> = {
  "site.title": "OpenCard AI — Credit Card Wiki",
  "site.subtitle": "Compare the best US credit cards — rewards, benefits, and detailed reviews to find your perfect card.",
  "card.name": "Card Name",
  "card.issuer": "Issuer",
  "card.annualFee": "Annual Fee",
  "card.annualFeeWaived": "No Annual Fee",
  "card.welcomeBonus": "Welcome Bonus",
  "card.earningRates": "Earning Rates",
  "card.category": "Category",
  "search.placeholder": "Search cards...",
  "filter.allIssuers": "All Issuers",
  "filter.allTags": "All Types",
  "filter.clear": "Clear Filters",
  "list.showing": "Showing",
  "list.of": "of",
  "list.cards": "cards",
  "nav.allCards": "All Cards",
  "nav.about": "About",
  "detail.backToList": "← Back to List",
  "detail.quickInfo": "Quick Info",
  "detail.creditRequired": "Credit Required",
  "detail.network": "Network",
  "detail.foreignFee": "Foreign Fee",
  "detail.none": "None",
  "detail.welcomeBonus": "Welcome Offer",
  "detail.spendingReq": "Spend ${amount} within {months} months",
  "detail.estimatedValue": "≈ ${value}",
  "detail.points": "pts",
  "detail.earningRates": "Earning Rates",
  "detail.annualCredits": "Annual Credits",
  "detail.travelBenefits": "Travel Benefits",
  "detail.hotelStatus": "Hotel Status",
  "detail.loungeAccess": "Lounges",
  "detail.otherBenefits": "Other Benefits",
  "detail.insurance": "Insurance",
  "detail.tripCancel": "Trip Cancellation",
  "detail.tripDelay": "Trip Delay",
  "detail.rentalIns": "Rental Insurance",
  "detail.purchaseProt": "Purchase Protection",
  "detail.returnProt": "Return Protection",
  "detail.extendedWarranty": "Extended Warranty",
  "detail.applicationRules": "Application Rules",
  "detail.sources": "Sources",
  "detail.lastUpdated": "Last Updated",
  "detail.credits": "credit",
  "detail.perMonth": "per month",
  "detail.annual": "per year",
  "detail.semiAnnual": "every 6 months",
  "about.title": "About OpenCard AI",
  "about.text": "OpenCard is an open-source credit card information platform. All data comes from publicly available sources with clear citations. We are committed to providing complete, unbiased credit card comparisons to help cardholders make informed decisions. Information may differ from official announcements; please verify with the issuer before applying.",
  "ftc.disclosure": "FTC Disclosure",
  "ftc.text": "This site contains sponsored links. When you apply for a credit card through our links and get approved, we may receive compensation, but this does not affect your approval results or our editorial independence. Information on this site is for reference only and does not constitute financial advice.",
  "ai.chatTitle": "AI Card Assistant",
  "ai.placeholder": "Ask about this card...",
  "ai.send": "Send",
  "ai.thinking": "Thinking...",
  "ai.disclaimer": "AI responses are for reference only. Approval decisions are made by the bank.",
  "ai.welcome": "Hi! Welcome to the {cardName} AI assistant. I can help you analyze this card's pros and cons, compare rewards, or answer any questions.",
  "status.loading": "Loading...",
  "feed.title": "Related News",
  "feed.subtitle": "Real-time information & benefits",
  "feed.updated": "Updated",
  "feed.all": "All News",
  "feed.cards": "Cards",
  "feed.banking": "Banking",
  "feed.noItems": "No items in this category yet",
  "feed.loading": "Loading latest news...",
  "feed.refresh": "Refresh",
  "feed.showLess": "↑ Show less",
  "feed.loadMore": "↓ Load {count} more items",
  "home.title": "Find Your Perfect Card with AI",
  "home.subtitle": "Browse {count} cards from top issuers",
  "home.cardsAvailable": "{count} cards available",
  "status.noResults": "No cards match your criteria",
  "status.tryAdjust": "Try adjusting your filters",
  "tag.noAnnualFee": "No Annual Fee",
  "tag.premium": " Premium",
  "tag.travel": "Travel",
  "tag.hotel": "Hotel",
  "tag.airline": "Airline",
  "tag.points": "Points",
  "tag.cashback": "Cash Back",
};

const es: Record<string, string> = {
  "site.title": "OpenCard AI — Wiki de Tarjetas de Crédito",
  "site.subtitle": "Compara las mejores tarjetas de crédito de EE.UU. — recompensas, beneficios y reseñas detalladas para encontrar tu tarjeta perfecta.",
  "card.name": "Nombre de Tarjeta",
  "card.issuer": "Emisor",
  "card.annualFee": "Cuota Anual",
  "card.annualFeeWaived": "Sin Cuota Anual",
  "card.welcomeBonus": "Bono de Bienvenida",
  "card.earningRates": "Tasas de Recompensa",
  "card.category": "Categoría",
  "search.placeholder": "Buscar tarjetas...",
  "filter.allIssuers": "Todos los Emisores",
  "filter.allTags": "Todos los Tipos",
  "filter.clear": "Limpiar Filtros",
  "list.showing": "Mostrando",
  "list.of": "de",
  "list.cards": "tarjetas",
  "nav.allCards": "Todas las Tarjetas",
  "nav.about": "Acerca de",
  "detail.backToList": "← Volver a la Lista",
  "detail.quickInfo": "Información Rápida",
  "detail.creditRequired": "Crédito Requerido",
  "detail.network": "Red",
  "detail.foreignFee": "Comisión Extranjera",
  "detail.none": "Ninguna",
  "detail.welcomeBonus": "Oferta de Bienvenida",
  "detail.spendingReq": "Gasta ${amount} en {months} meses",
  "detail.estimatedValue": "≈ ${value}",
  "detail.points": "pts",
  "detail.earningRates": "Tasas de Recompensa",
  "detail.annualCredits": "Créditos Anuales",
  "detail.travelBenefits": "Beneficios de Viaje",
  "detail.hotelStatus": "Estatus de Hotel",
  "detail.loungeAccess": "Salas VIP",
  "detail.otherBenefits": "Otros Beneficios",
  "detail.insurance": "Seguro",
  "detail.tripCancel": "Cancelación de Viaje",
  "detail.tripDelay": "Retraso de Viaje",
  "detail.rentalIns": "Seguro de Auto",
  "detail.purchaseProt": "Protección de Compra",
  "detail.returnProt": "Protección de Devolución",
  "detail.extendedWarranty": "Garantía Extendida",
  "detail.applicationRules": "Reglas de Solicitud",
  "detail.sources": "Fuentes",
  "detail.lastUpdated": "Última Actualización",
  "detail.credits": "crédito",
  "detail.perMonth": "por mes",
  "detail.annual": "por año",
  "detail.semiAnnual": "cada 6 meses",
  "about.title": "Acerca de OpenCard AI",
  "about.text": "OpenCard es una plataforma de información de tarjetas de crédito de código abierto. Todos los datos provienen de fuentes públicas con citas claras. Nos comprometemos a proporcionar comparaciones completas e imparciales para ayudar a los tarjetahabientes a tomar decisiones informadas.",
  "ftc.disclosure": "Divulgación FTC",
  "ftc.text": "Este sitio contiene enlaces patrocinados. Cuando solicitas una tarjeta a través de nuestros enlaces y eres aprobado, podemos recibir una compensación, pero esto no afecta los resultados de tu aprobación ni nuestra independencia editorial.",
  "ai.chatTitle": "Asistente AI de Tarjetas",
  "ai.placeholder": "Pregunta sobre esta tarjeta...",
  "ai.send": "Enviar",
  "ai.thinking": "Pensando...",
  "ai.disclaimer": "Las respuestas de IA son solo para referencia. Las decisiones de aprobación las toma el banco.",
  "ai.welcome": "¡Hola! Bienvenido al asistente AI de {cardName}. Puedo ayudarte a analizar los pros y contras de esta tarjeta, comparar recompensas o responder cualquier pregunta.",
  "status.loading": "Cargando...",
  "feed.title": "Noticias Financieras",
  "feed.subtitle": "Noticias de tarjetas de crédito y banca en tiempo real",
  "feed.updated": "Actualizado",
  "feed.all": "Todas",
  "feed.cards": "Tarjetas",
  "feed.banking": "Banca",
  "feed.noItems": "No hay noticias en esta categoría",
  "feed.loading": "Cargando últimas noticias...",
  "feed.refresh": "Actualizar",
  "feed.showLess": "↑ Mostrar menos",
  "feed.loadMore": "↓ Cargar {count} más",
  "home.title": "Encuentra tu Tarjeta Perfecta con IA",
  "home.subtitle": "Explora {count} tarjetas de los principales emisores",
  "home.cardsAvailable": "{count} tarjetas disponibles",
  "status.noResults": "No hay tarjetas que coincidan con tus criterios",
  "status.tryAdjust": "Intenta ajustar tus filtros",
  "tag.noAnnualFee": "Sin Cuota Anual",
  "tag.premium": " Premium",
  "tag.travel": "Viaje",
  "tag.hotel": "Hotel",
  "tag.airline": "Aerolínea",
  "tag.points": "Puntos",
  "tag.cashback": "Cash Back",
};

const translations: Record<Locale, Record<string, string>> = { zh, en, es };

export function t(key: string, locale: Locale = "en", params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] || translations.en[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}

export function getLocaleFromHeader(acceptLang: string | null): Locale {
  if (!acceptLang) return defaultLocale;
  const lang = acceptLang.toLowerCase();
  if (lang.includes("zh")) return "zh";
  if (lang.includes("es")) return "es";
  return "en";
}
