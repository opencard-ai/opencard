import { getCardArt } from "@/lib/card-art";

interface Props {
  cardId: string;
  issuer: string;
  /** Visual size; thumbnail (sm) for list rows, hero (lg) for detail page. */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  xs: { w: 32, h: 20 },
  sm: { w: 56, h: 36 },
  md: { w: 120, h: 76 },
  lg: { w: 240, h: 152 },
} as const;

/**
 * Deterministic SVG card art driven by issuer + card_id.
 *
 * No issuer trademarks rendered — just an issuer-tinted gradient panel with
 * a chip-shaped accent and one of four subtle pattern overlays. Gives card
 * lists a recognisable visual cue per issuer without infringing brand marks.
 */
export default function CardArt({ cardId, issuer, size = "sm", className = "" }: Props) {
  const { palette, angle, pattern } = getCardArt(cardId, issuer);
  const { w, h } = SIZES[size];
  const gradientId = `cg-${cardId}-${size}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 100 64"
      preserveAspectRatio="xMidYMid slice"
      className={`shrink-0 rounded-md shadow-sm ${className}`}
      role="img"
      aria-label={`${issuer} card art`}
    >
      <defs>
        <linearGradient id={gradientId} gradientTransform={`rotate(${angle}, 0.5, 0.5)`}>
          <stop offset="0%" stopColor={palette.c1} />
          <stop offset="100%" stopColor={palette.c2} />
        </linearGradient>
      </defs>

      <rect width="100" height="64" fill={`url(#${gradientId})`} />

      {/* Pattern overlays — picked by deterministic hash. */}
      {pattern === 0 && (
        <g opacity="0.18" stroke={palette.accent} strokeWidth="0.6">
          {[10, 25, 40, 55, 70, 85].map((x) => (
            <line key={x} x1={x} y1="0" x2={x + 30} y2="64" />
          ))}
        </g>
      )}
      {pattern === 1 && (
        <g opacity="0.22" fill={palette.accent}>
          {Array.from({ length: 8 }).map((_, i) =>
            Array.from({ length: 5 }).map((_, j) => (
              <circle key={`${i}-${j}`} cx={6 + i * 12} cy={6 + j * 13} r="0.9" />
            )),
          )}
        </g>
      )}
      {pattern === 2 && (
        <g opacity="0.18" stroke={palette.accent} strokeWidth="0.4" fill="none">
          <path d="M0 32 Q25 20 50 32 T100 32" />
          <path d="M0 44 Q25 32 50 44 T100 44" />
        </g>
      )}
      {pattern === 3 && (
        <g opacity="0.22">
          <rect x="0" y="0" width="100" height="2" fill={palette.accent} />
          <rect x="0" y="62" width="100" height="2" fill={palette.accent} />
        </g>
      )}

      {/* EMV chip (always-present, sells the card-ness). */}
      <rect x="10" y="22" width="14" height="10" rx="1.5" fill={palette.accent} opacity="0.85" />
      <rect x="11.5" y="24" width="11" height="6" rx="0.5" fill={palette.c2} opacity="0.5" />

      {/* Subtle highlight glaze (top-left). */}
      <path d="M0 0 L100 0 L100 8 Q50 20 0 8 Z" fill="white" opacity="0.08" />
    </svg>
  );
}
