"use client";

import type { ReactNode } from "react";
import { trackAffiliateClick } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n";
import AffiliateDisclosure from "./AffiliateDisclosure";

interface AffiliateLinkProps {
  /** Must come from getAffiliateUrl(); pass null and nothing renders. */
  href: string | null;
  cardId: string;
  placement: string;
  lang: Locale;
  className?: string;
  children: ReactNode;
}

/** Affiliate outbound link with its inline FTC disclosure and consent-gated click tracking. */
export default function AffiliateLink({ href, cardId, placement, lang, className, children }: AffiliateLinkProps) {
  if (!href) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        href={href}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        data-affiliate-link=""
        data-card-id={cardId}
        className={className}
        onClick={() => trackAffiliateClick(cardId, placement)}
      >
        {children}
      </a>
      <AffiliateDisclosure lang={lang} />
    </span>
  );
}
