import { issuerStyle } from "@/lib/issuer-colors";

interface Props {
  issuer: string;
  /** Render the short abbreviation instead of the full issuer name. */
  short?: boolean;
  className?: string;
}

/**
 * Color-coded badge that tints the card row by issuer for faster scanning.
 * Falls back to neutral slate for unknown issuers.
 */
export default function IssuerChip({ issuer, short, className = "" }: Props) {
  const s = issuerStyle(issuer);
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${s.bg} ${s.text} ${className}`}
      title={issuer}
    >
      {short ? s.short : issuer}
    </span>
  );
}
