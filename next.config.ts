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
    // Catalog dedup (commit b2b0ba5) merged amex-bce / amex-bcp into the
    // long-form canonical IDs. 301 the retired short IDs so inbound links /
    // bookmarks / SEO equity carry over. Cover both the language-prefixed
    // and the bare /cards/* paths.
    return [
      {
        source: "/:lang/cards/amex-bce",
        destination: "/:lang/cards/amex-blue-cash-everyday",
        permanent: true,
      },
      {
        source: "/:lang/cards/amex-bcp",
        destination: "/:lang/cards/amex-blue-cash-preferred",
        permanent: true,
      },
      {
        source: "/cards/amex-bce",
        destination: "/cards/amex-blue-cash-everyday",
        permanent: true,
      },
      {
        source: "/cards/amex-bcp",
        destination: "/cards/amex-blue-cash-preferred",
        permanent: true,
      },
    ];
  },
};

// Wrap with @next/mdx so MDX files are processed at build time. No remark /
// rehype plugins yet — GFM-style tables + auto heading slugs can be added
// here later if pillar articles need them.
const withMDX = createMDX({});

export default withMDX(nextConfig);
