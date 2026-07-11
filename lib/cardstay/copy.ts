import type { Locale } from "@/lib/i18n";

export type StayCopy = {
  beta: string;
  title: string;
  subtitle: string;
  openStay: string;
  backToMyCards: string;
  backToStay: string;
  mapTitle: string;
  mapPlaceholder: string;
  seededPlaces: string;
  howWeRankTitle: string;
  howWeRankPoints: string[];
  savedTitle: string;
  savedBody: string;
  hotelFallback: string;
  verdict: string;
};

const stayCopy: Record<Locale, StayCopy> = {
  en: {
    beta: "Beta test version",
    title: "Find hotels where your OpenCard benefits actually work.",
    subtitle: "Seeded hotel routing for FHR, THC, The Edit, Premier Collection, and Hilton benefits.",
    openStay: "Open CardStay",
    backToMyCards: "← Back to My Cards",
    backToStay: "← Back to CardStay",
    mapTitle: "Map placeholder",
    mapPlaceholder: "map/list view scaffold",
    seededPlaces: "Seed places",
    howWeRankTitle: "How we rank",
    howWeRankPoints: ["Eligibility first, verdict second.", "Official source URL and verification date are shown for every seed.", "High-confidence matches rank above placeholder/maybe matches."],
    savedTitle: "Saved places",
    savedBody: "Scaffold only for now.",
    hotelFallback: "Place not found",
    verdict: "Verdict",
  },
  zh: {
    beta: "Beta 測試版本",
    title: "找出你的 OpenCard 福利真的能用上的飯店。",
    subtitle: "目前先支援 FHR、THC、The Edit、Premier Collection 與 Hilton 福利的飯店路由。",
    openStay: "開啟 CardStay",
    backToMyCards: "← 回到我的卡片",
    backToStay: "← 回到 CardStay",
    mapTitle: "地圖佔位區",
    mapPlaceholder: "地圖／清單佔位區",
    seededPlaces: "已建立地點",
    howWeRankTitle: "我們怎麼排序",
    howWeRankPoints: ["先看資格，再看結果。", "每個 seed 都會顯示官方來源網址與驗證日期。", "高信心命中會排在 placeholder / 可能命中之前。"],
    savedTitle: "已儲存地點",
    savedBody: "目前先做骨架。",
    hotelFallback: "找不到地點",
    verdict: "判定",
  },
  "zh-cn": {
    beta: "Beta 测试版本",
    title: "找出你的 OpenCard 福利真正能用上的酒店。",
    subtitle: "当前先支持 FHR、THC、The Edit、Premier Collection 和 Hilton 福利的酒店路由。",
    openStay: "打开 CardStay",
    backToMyCards: "← 返回我的卡片",
    backToStay: "← 返回 CardStay",
    mapTitle: "地图占位区",
    mapPlaceholder: "地图／列表占位区",
    seededPlaces: "已建立地点",
    howWeRankTitle: "我们如何排序",
    howWeRankPoints: ["先看资格，再看结果。", "每个 seed 都会显示官方来源网址与验证日期。", "高置信度命中会排在 placeholder / 可能命中之前。"],
    savedTitle: "已保存地点",
    savedBody: "目前先做骨架。",
    hotelFallback: "找不到地点",
    verdict: "判定",
  },
  es: {
    beta: "Versión beta",
    title: "Encuentra hoteles donde tus beneficios de OpenCard realmente apliquen.",
    subtitle: "Enrutamiento inicial para beneficios de FHR, THC, The Edit, Premier Collection y Hilton.",
    openStay: "Abrir CardStay",
    backToMyCards: "← Volver a Mis tarjetas",
    backToStay: "← Volver a CardStay",
    mapTitle: "Marcador de mapa",
    mapPlaceholder: "boceto de vista mapa/lista",
    seededPlaces: "Lugares semilla",
    howWeRankTitle: "Cómo ordenamos",
    howWeRankPoints: ["Primero elegibilidad, luego veredicto.", "Cada seed muestra la URL oficial y la fecha de verificación.", "Las coincidencias de alta confianza van antes que los marcadores de posición o coincidencias dudosas."],
    savedTitle: "Lugares guardados",
    savedBody: "Solo es un boceto por ahora.",
    hotelFallback: "Lugar no encontrado",
    verdict: "Veredicto",
  },
};

export function getStayCopy(lang: Locale): StayCopy {
  return stayCopy[lang] ?? stayCopy.en;
}
