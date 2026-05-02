/**
 * Deterministic card-art parameters per (card_id, issuer). Drives the
 * <CardArt> SVG component — same inputs always paint the same gradient.
 *
 * No real card images (avoids issuer trademark issues). Gradient palette
 * picked from issuer brand color, with the gradient angle + optional pattern
 * variant chosen by hashing the card_id so cards from the same issuer don't
 * all look identical.
 */

interface ArtPalette {
  /** Top stop of the linear gradient. */
  c1: string;
  /** Bottom stop. */
  c2: string;
  /** Optional accent color used by the bottom-right corner stripe. */
  accent: string;
}

const FALLBACK_PALETTE: ArtPalette = { c1: "#475569", c2: "#1e293b", accent: "#94a3b8" };

const PALETTES: Record<string, ArtPalette> = {
  "American Express":            { c1: "#3b82f6", c2: "#1e3a8a", accent: "#bfdbfe" },
  "Chase":                       { c1: "#6366f1", c2: "#312e81", accent: "#c7d2fe" },
  "Citi":                        { c1: "#0ea5e9", c2: "#0c4a6e", accent: "#bae6fd" },
  "Bank of America":             { c1: "#dc2626", c2: "#7f1d1d", accent: "#fecaca" },
  "Capital One":                 { c1: "#ef4444", c2: "#9f1239", accent: "#fed7aa" },
  "U.S. Bank":                   { c1: "#1d4ed8", c2: "#1e3a8a", accent: "#dbeafe" },
  "Wells Fargo":                 { c1: "#dc2626", c2: "#451a03", accent: "#fbbf24" },
  "Barclays":                    { c1: "#06b6d4", c2: "#0e7490", accent: "#a5f3fc" },
  "Discover":                    { c1: "#f97316", c2: "#c2410c", accent: "#fed7aa" },
  "Synchrony":                   { c1: "#7c3aed", c2: "#4c1d95", accent: "#ddd6fe" },
  "Bread Financial":             { c1: "#f59e0b", c2: "#92400e", accent: "#fde68a" },
  "PenFed Credit Union":         { c1: "#10b981", c2: "#064e3b", accent: "#a7f3d0" },
  "Navy Federal Credit Union":   { c1: "#1e40af", c2: "#1e3a8a", accent: "#dbeafe" },
  "TD Bank":                     { c1: "#16a34a", c2: "#14532d", accent: "#bbf7d0" },
  "PNC Bank":                    { c1: "#ea580c", c2: "#7c2d12", accent: "#fed7aa" },
  "Goldman Sachs":               { c1: "#475569", c2: "#0f172a", accent: "#cbd5e1" },
  "HSBC":                        { c1: "#dc2626", c2: "#7f1d1d", accent: "#fecaca" },
  "Petal":                       { c1: "#a855f7", c2: "#581c87", accent: "#e9d5ff" },
  "Robinhood Credit":            { c1: "#84cc16", c2: "#365314", accent: "#d9f99d" },
  "First Electronic Bank":       { c1: "#64748b", c2: "#1e293b", accent: "#cbd5e1" },
  "Fidelity Investments / Elan Financial Services": { c1: "#10b981", c2: "#065f46", accent: "#a7f3d0" },
  "SoFi / First Bank":           { c1: "#8b5cf6", c2: "#5b21b6", accent: "#ddd6fe" },
  "Upgrade (Cross River Bank)":  { c1: "#475569", c2: "#1e293b", accent: "#cbd5e1" },
};

/** Trivial 32-bit FNV-1a-ish hash for stable variant selection. */
function hashCode(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export interface CardArtParams {
  palette: ArtPalette;
  /** Gradient angle in deg (0/45/90/135). */
  angle: number;
  /** Pattern variant index 0-3. */
  pattern: 0 | 1 | 2 | 3;
}

export function getCardArt(cardId: string, issuer: string): CardArtParams {
  const palette = PALETTES[issuer] || FALLBACK_PALETTE;
  const h = hashCode(cardId);
  const ANGLES = [0, 45, 90, 135] as const;
  return {
    palette,
    angle: ANGLES[h % 4],
    pattern: (Math.floor(h / 4) % 4) as 0 | 1 | 2 | 3,
  };
}
