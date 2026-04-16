import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "@/lib/i18n";

const PUBLIC_FILE = /^\/.*\..*$/;

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip public files and API routes
  if (PUBLIC_FILE.test(pathname) || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check if pathname starts with a locale
  const pathnameLocale = locales.find(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameLocale) {
    // Locale already in URL - set cookie and continue
    const response = NextResponse.next();
    response.cookies.set("NEXT_LOCALE", pathnameLocale, { path: "/" });
    return response;
  }

  // No locale in URL - detect and redirect
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

  // Redirect to locale-prefixed URL
  const newUrl = new URL(`/${locale}${pathname}`, req.url);
  // Preserve query string (e.g. ?ask=...)
  newUrl.search = req.nextUrl.search;
  return NextResponse.redirect(newUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|images|icons|robots.txt|sitemap.xml).*)"],
};
