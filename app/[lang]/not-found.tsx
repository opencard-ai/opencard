"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNotFoundLinks, getNotFoundLocale, notFoundCopy } from "@/lib/not-found";

export default function NotFound() {
  // This boundary receives no params. Read the URL so locale changes during
  // client navigation work too, without depending on a previous locale cookie.
  const locale = getNotFoundLocale(usePathname());
  const copy = notFoundCopy[locale];

  return (
    <section aria-labelledby="not-found-heading" className="max-w-2xl mx-auto px-4 py-12 sm:py-16 text-center">
      <p className="mb-3 text-sm font-semibold tracking-widest text-blue-600 dark:text-blue-400">404</p>
      <h1 id="not-found-heading" className="mb-4 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {copy.heading}
      </h1>
      <p className="mb-8 text-slate-600 dark:text-slate-400">{copy.description}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {getNotFoundLinks(locale).map(({ href, label }, index) => (
          <li key={href} className={index === 0 ? "sm:col-span-2" : undefined}>
            <Link
              href={href}
              className={`flex min-h-12 items-center justify-center rounded-xl px-5 py-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 ${
                index === 0
                  ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                  : "border border-slate-200 bg-white text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
