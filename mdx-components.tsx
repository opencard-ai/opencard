/**
 * Global MDX component map used by `@next/mdx`. Required by the App Router
 * (the package will not work without this file).
 *
 * Styles MDX-rendered HTML with Tailwind utilities tuned to OpenCard's
 * dark-first design and Geist sans body. The site doesn't use
 * `@tailwindcss/typography`, so prose-like spacing is implemented here
 * inline instead of via `.prose` classes.
 *
 * If a guide overrides a component locally, the per-page map (passed when
 * importing the MDX module) wins over this global map.
 */
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

const components: MDXComponents = {
  h1: (props) => (
    <h1
      className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-2 mb-6"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mt-12 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="text-xl font-semibold text-slate-900 dark:text-slate-50 mt-8 mb-3"
      {...props}
    />
  ),
  p: (props) => (
    <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 mb-4" {...props} />
  ),
  ul: (props) => (
    <ul
      className="list-disc pl-6 space-y-1.5 text-[15px] text-slate-700 dark:text-slate-300 mb-4"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="list-decimal pl-6 space-y-1.5 text-[15px] text-slate-700 dark:text-slate-300 mb-4"
      {...props}
    />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="border-l-4 border-amber-500 pl-4 my-6 italic text-slate-600 dark:text-slate-400"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[13px] text-amber-700 dark:text-amber-300"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="bg-slate-900 text-slate-100 rounded-md p-4 my-4 overflow-x-auto text-[13px] leading-snug"
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full text-[14px] border-collapse" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="text-left font-semibold text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/60 align-top text-slate-700 dark:text-slate-300"
      {...props}
    />
  ),
  a: ({ href, ...rest }: ComponentPropsWithoutRef<"a">) => {
    // Render internal links via next/link for client-side nav + prefetch.
    // External links open in a new tab with security defaults.
    if (href && href.startsWith("/")) {
      return (
        <Link
          href={href}
          className="text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-200"
          {...rest}
        />
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:text-amber-600 dark:hover:text-amber-200"
        {...rest}
      />
    );
  },
  hr: () => <hr className="my-10 border-slate-200 dark:border-slate-800" />,
  strong: (props) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-100" {...props} />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
