import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "@/lib/i18n";

export function GET(req: NextRequest) {
  const cookieLocale = req.cookies.get("NEXT_LOCALE")?.value;
  const acceptLang = req.headers.get("accept-language");

  let locale = defaultLocale;
  if (cookieLocale && locales.includes(cookieLocale as typeof locales[number])) {
    locale = cookieLocale as typeof locales[number];
  } else if (acceptLang) {
    const lang = acceptLang.toLowerCase();
    if (lang.includes("zh")) locale = "zh";
    else if (lang.includes("es")) locale = "es";
  }

  return NextResponse.redirect(new URL(`/${locale}`, req.url));
}

export const dynamic = "force-dynamic";
