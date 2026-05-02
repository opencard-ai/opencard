/**
 * Issuer brand-color tokens for the IssuerChip component.
 *
 * Mapping is approximate (Tailwind palette, lighter "tinted" rather than the
 * exact brand hex) so chips read as a recognizable color cue without claiming
 * to BE the brand mark. Unknown issuers fall back to neutral slate.
 *
 * Note: tailwind needs static class strings to detect & emit. Don't switch
 * to template literal interpolation on color/shade — keep the full classes
 * baked into this map.
 */
export interface IssuerStyle {
  bg: string;
  text: string;
  /** Short label (≤4 chars). Used when the chip needs to be ultra-compact. */
  short: string;
}

const STYLES: Record<string, IssuerStyle> = {
  "American Express":            { bg: "bg-blue-100",    text: "text-blue-900",    short: "Amex"  },
  "Chase":                       { bg: "bg-indigo-100",  text: "text-indigo-800",  short: "Chase" },
  "Citi":                        { bg: "bg-sky-100",     text: "text-sky-800",     short: "Citi"  },
  "Bank of America":             { bg: "bg-rose-100",    text: "text-rose-800",    short: "BoA"   },
  "Capital One":                 { bg: "bg-red-100",     text: "text-red-800",     short: "C1"    },
  "U.S. Bank":                   { bg: "bg-blue-100",    text: "text-blue-800",    short: "USB"   },
  "Wells Fargo":                 { bg: "bg-rose-100",    text: "text-rose-900",    short: "WF"    },
  "Barclays":                    { bg: "bg-cyan-100",    text: "text-cyan-800",    short: "Barc"  },
  "Discover":                    { bg: "bg-orange-100",  text: "text-orange-800",  short: "Disc"  },
  "Synchrony":                   { bg: "bg-violet-100",  text: "text-violet-800",  short: "Sync"  },
  "Bread Financial":             { bg: "bg-amber-100",   text: "text-amber-800",   short: "Bread" },
  "PenFed Credit Union":         { bg: "bg-emerald-100", text: "text-emerald-800", short: "PenF"  },
  "Navy Federal Credit Union":   { bg: "bg-blue-100",    text: "text-blue-900",    short: "NFCU"  },
  "TD Bank":                     { bg: "bg-green-100",   text: "text-green-800",   short: "TD"    },
  "PNC Bank":                    { bg: "bg-orange-100",  text: "text-orange-900",  short: "PNC"   },
  "Goldman Sachs":               { bg: "bg-slate-200",   text: "text-slate-800",   short: "GS"    },
  "HSBC":                        { bg: "bg-red-100",     text: "text-red-900",     short: "HSBC"  },
  "Petal":                       { bg: "bg-purple-100",  text: "text-purple-800",  short: "Petal" },
  "Robinhood Credit":            { bg: "bg-lime-100",    text: "text-lime-800",    short: "RH"    },
  "First Electronic Bank":       { bg: "bg-slate-200",   text: "text-slate-800",   short: "FEB"   },
  "Fidelity Investments / Elan Financial Services": { bg: "bg-emerald-100", text: "text-emerald-800", short: "Fido" },
  "SoFi / First Bank":           { bg: "bg-violet-100",  text: "text-violet-800",  short: "SoFi"  },
  "Upgrade (Cross River Bank)":  { bg: "bg-slate-200",   text: "text-slate-800",   short: "Upg"   },
};

const FALLBACK: IssuerStyle = { bg: "bg-slate-100", text: "text-slate-700", short: "?" };

export function issuerStyle(issuer: string | null | undefined): IssuerStyle {
  if (!issuer) return FALLBACK;
  return STYLES[issuer] || FALLBACK;
}
