import { defaultLocale, locales, t, type Locale } from "./i18n";

type NotFoundCopy = {
  heading: string;
  description: string;
  find: string;
  home: string;
  cards: string;
  guides: string;
  myCards: string;
};

export const notFoundCopy: Record<Locale, NotFoundCopy> = {
  en: {
    heading: "We couldn't find that page",
    description: "Try one of these links to find your way back.",
    find: "Find my next card",
    home: "Home",
    cards: "Browse cards",
    guides: "Guides",
    myCards: t("home.heroMyCards", "en"),
  },
  zh: {
    heading: "找不到這個頁面",
    description: "試試以下連結，繼續探索適合你的信用卡。",
    find: "尋找我的下一張卡",
    home: "首頁",
    cards: "瀏覽信用卡",
    guides: "指南",
    myCards: t("home.heroMyCards", "zh"),
  },
  "zh-cn": {
    heading: "找不到这个页面",
    description: "试试以下链接，继续探索适合你的信用卡。",
    find: "寻找我的下一张卡",
    home: "首页",
    cards: "浏览信用卡",
    guides: "指南",
    myCards: t("home.heroMyCards", "zh-cn"),
  },
  es: {
    heading: "No encontramos esa página",
    description: "Prueba uno de estos enlaces para seguir explorando.",
    find: "Encontrar mi próxima tarjeta",
    home: "Inicio",
    cards: "Explorar tarjetas",
    guides: "Guías",
    myCards: t("home.heroMyCards", "es"),
  },
};

export function getNotFoundLocale(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return locales.find((locale) => locale === segment) ?? defaultLocale;
}

export function getNotFoundLinks(locale: Locale) {
  const copy = notFoundCopy[locale];
  return [
    { href: `/${locale}/find`, label: copy.find },
    { href: `/${locale}`, label: copy.home },
    { href: `/${locale}#cards-section`, label: copy.cards },
    { href: `/${locale}/guides`, label: copy.guides },
    { href: `/${locale}/my-cards`, label: copy.myCards },
  ];
}
