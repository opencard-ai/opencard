import type { Metadata } from "next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

const baseUrl = "https://opencardai.com";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AI-Powered Credit Card Selection | OpenCard.AI",
  description: "Find the best credit card for your lifestyle.",
  openGraph: {
    title: "AI-Powered Credit Card Selection",
    description: "Find the best credit card for your lifestyle.",
    url: baseUrl,
    siteName: "OpenCard.AI",
    images: [
      {
        url: `${baseUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "OpenCard.AI — AI-powered credit card selection",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI-Powered Credit Card Selection",
    description: "Find the best credit card for your lifestyle.",
    images: [`${baseUrl}/og-image.png`],
  },
};

export const alternates = {
  canonical: "https://opencardai.com/en",
  languages: {
    en: "https://opencardai.com/en",
    zh: "https://opencardai.com/zh",
    es: "https://opencardai.com/es",
    "x-default": "https://opencardai.com/en",
  },
};
