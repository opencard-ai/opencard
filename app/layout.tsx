import type { Metadata } from "next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

export const metadata: Metadata = {
  title: "OpenCard",
};

export const alternates = {
  languages: {
    en: "https://opencardai.com/en",
    zh: "https://opencardai.com/zh",
    es: "https://opencardai.com/es",
    "x-default": "https://opencardai.com/en",
  },
};
