import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Allow .mdx alongside .tsx as routable extensions so the long-form
  // editorial content under content/guides/*.mdx can be dynamically
  // imported by app/[lang]/guides/[slug]/page.tsx. Added 2026-05-24 for
  // the opencard-adsense-longform-content AgentHub task.
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  // External image hosts allowed for next/image. Currently only Amazon's
  // media CDN, used by TravelProducts.tsx for affiliate product photos.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        pathname: "/images/**",
      },
    ],
  },
  // Ensure static files like ads.txt are served correctly
  async headers() {
    return [
      {
        source: "/ads.txt",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  async redirects() {
    // Legacy card slug redirects. These cover URLs that Google may still know
    // from earlier catalog imports/refactors and preserve SEO equity instead
    // of letting retired slugs surface as Search Console 404s. Each mapping is
    // emitted for both locale-prefixed card pages and bare /cards/* paths.
    const legacyCardRedirects = [
      ["amex-bce", "amex-blue-cash-everyday"],
      ["amex-bcp", "amex-blue-cash-preferred"],
      ["amex-hilton-aspire", "amex-hilton-honors-aspire"],
      ["amex-hilton-business", "amex-hilton-honors-biz"],
      ["amex-hilton-honors-business", "amex-hilton-honors-biz"],
      ["amex-delta-business-gold", "amex-delta-gold-biz"],
      ["amex-delta-skymiles-gold-biz", "amex-delta-gold-biz"],
      ["amex-delta-business-platinum", "amex-delta-skymiles-platinum-biz"],
      ["amex-delta-business-reserve", "amex-delta-skymiles-reserve-biz"],
      ["chase-ink-cash", "chase-ink-biz-cash"],
      ["chase-ink-unlimited", "chase-ink-biz-unlimited"],
      ["chase-ink-preferred", "chase-ink-biz-preferred"],
      ["chase-united-club", "chase-united-club-infinite"],
      ["united-explorer-card", "chase-united-explorer"],
      ["united-quest-card", "chase-united-quest"],
      ["world-of-hyatt-credit-card", "chase-hyatt"],
      ["hyatt-credit-card", "chase-hyatt"],
      ["bofa-atmos-ascent", "boa-alaska-ascent"],
      ["bofa-atmos-summit", "boa-alaska-summit"],
      ["bofa-customized-cash", "boa-customized-cash-rewards"],
      ["bofa-travel-rewards", "boa-travel-rewards"],
      ["citi-aa-exec", "citi-aadvantage-executive"],
      ["citi-aa-mileup", "citi-aadvantage-mileup"],
      ["citi-aadvantage-platinum-select", "citi-aa-platinum-select"],
      ["citi-strata-elite-premier", "citi-strata-elite"],
      ["barclays-jetblue-business", "barclays-jetblue-biz"],
      ["wyndham-rewards-earner-barclays", "barclays-wyndham-earner"],
      ["wyndham-rewards-earner-plus-barclays", "barclays-wyndham-earner-plus"],
      ["wyndham-rewards-earner-business-barclays", "barclays-wyndham-earner-biz"],
      ["bilt-palladian", "bilt-palladium"],
    ] as const;

    return legacyCardRedirects.flatMap(([from, to]) => [
      {
        source: `/:lang/cards/${from}`,
        destination: `/:lang/cards/${to}`,
        permanent: true,
      },
      {
        source: `/cards/${from}`,
        destination: `/cards/${to}`,
        permanent: true,
      },
    ]);
  },
};

// Wrap with @next/mdx so MDX files are processed at build time.
// remark-gfm enables GitHub-flavored markdown — tables, strikethrough, task
// lists, autolinks. Needed by pillar guides (the Transferable Points 101
// "four programs at a glance" table was rendering as literal pipe-and-dash
// text without this plugin). Specified as a string per the Next.js Turbopack
// requirement (node_modules/next/dist/docs/01-app/02-guides/mdx.md
// § Using Plugins with Turbopack).
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
