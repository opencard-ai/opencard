import type { Metadata } from "next";
import { localizedAlternates, pageMetadata } from "@/lib/seo";

type Props = { children: React.ReactNode; params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const copy: Record<string, { title: string; description: string }> = {
    en: { title: "My Cards: Manage Your Card Benefits | OpenCard", description: "Manage your saved credit cards, track remaining benefit credits, and set up benefit reminders." },
    zh: { title: "我的卡片：管理信用卡福利 | OpenCard", description: "管理已儲存的信用卡、追蹤剩餘福利抵用額，並設定福利到期提醒。" },
    "zh-cn": { title: "我的卡片：管理信用卡权益 | OpenCard", description: "管理已保存的信用卡、追踪剩余权益抵扣额度，并设置权益到期提醒。" },
    es: { title: "Mis tarjetas: administra tus beneficios | OpenCard", description: "Administra tus tarjetas guardadas, consulta los créditos de beneficios restantes y configura recordatorios." },
  };
  return pageMetadata(lang, "/my-cards", {
    ...(copy[lang] ?? copy.en),
    robots: { index: false, follow: false },
    alternates: localizedAlternates(lang, "/my-cards"),
  });
}

export default function MyCardsLayout({ children }: Props) {
  return children;
}
