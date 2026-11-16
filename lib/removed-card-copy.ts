import type { Locale } from "./i18n";

export const removedCardCopy: Record<Locale, {
  title: string;
  heading: string;
  description: (name: string) => string;
  alternatives: string;
}> = {
  en: {
    title: "Card no longer covered | OpenCard",
    heading: "This card is no longer covered on OpenCard",
    description: (name) => `OpenCard no longer lists ${name}.`,
    alternatives: "Other cards on OpenCard",
  },
  zh: {
    title: "已停止收錄此卡 | OpenCard",
    heading: "OpenCard 已停止收錄此卡",
    description: (name) => `OpenCard 已不再列出 ${name}。`,
    alternatives: "OpenCard 上的其他信用卡",
  },
  "zh-cn": {
    title: "已停止收录此卡 | OpenCard",
    heading: "OpenCard 已停止收录此卡",
    description: (name) => `OpenCard 已不再列出 ${name}。`,
    alternatives: "OpenCard 上的其他信用卡",
  },
  es: {
    title: "Tarjeta ya no cubierta | OpenCard",
    heading: "OpenCard ya no cubre esta tarjeta",
    description: (name) => `OpenCard ya no incluye ${name}.`,
    alternatives: "Otras tarjetas en OpenCard",
  },
};
