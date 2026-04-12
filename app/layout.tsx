import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenCard — 信用卡資訊百科",
  description: "查詢、整理全台灣熱門信用卡的回饋、優惠與比較",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 text-slate-900 antialiased`}
      >
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-2xl">💳</span>
              <span className="font-bold text-xl text-slate-900">OpenCard</span>
            </a>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <a href="/" className="hover:text-slate-900 transition-colors">
                所有卡片
              </a>
              <a
                href="/#about"
                className="hover:text-slate-900 transition-colors"
              >
                關於
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-white border-t border-slate-200 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-8">
            <FTCDisclosure />
          </div>
        </footer>
      </body>
    </html>
  );
}

function FTCDisclosure() {
  return (
    <div className="text-xs text-slate-500 leading-relaxed">
      <p className="font-semibold text-slate-600 mb-1">FTC 揭露聲明</p>
      <p>
        本網站包含贊助連結。當您透過我們的連結申請信用卡並成功核卡時，我們可能會獲得報酬，但這不會影響您的核卡結果或我們的編輯獨立性。
        本網站上的資訊僅供參考，不構成財務建議。在申請任何信用卡前，請自行評估是否符合您的需求。
      </p>
    </div>
  );
}
