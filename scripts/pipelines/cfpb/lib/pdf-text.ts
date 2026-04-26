/**
 * PDF → text extractor.
 *
 * Wraps pdf-parse. Handles:
 *   - Spanish-language CFPB filings (filtered out so we don't waste LLM calls)
 *   - Image-only / scanned PDFs (returns empty text → caller should skip)
 */

import * as fs from "fs";
import * as path from "path";

// pdf-parse has CJS-only typings; import lazily to avoid esModuleInterop noise
type PdfParseFn = (buf: Buffer) => Promise<{ text: string; numpages: number; info?: unknown }>;
let _pdfParse: PdfParseFn | null = null;
async function getPdfParse(): Promise<PdfParseFn> {
  if (_pdfParse) return _pdfParse;
  // pdf-parse has no published type definitions; we treat it as `any` here.
  // After `npm install`, this resolves at runtime.
  // @ts-ignore -- no @types/pdf-parse on registry; treat as untyped.
  const mod = await import("pdf-parse");
  _pdfParse = (mod as { default?: PdfParseFn }).default ?? (mod as unknown as PdfParseFn);
  return _pdfParse;
}

export interface PdfTextResult {
  text: string;
  page_count: number;
  language: "english" | "spanish" | "other";
  size_bytes: number;
}

const SPANISH_HINTS = [
  "contrato de cuenta",
  "tarjeta de crédito",
  "tasa de porcentaje anual",
  "cargo por anualidad",
];

/** Read PDF from disk and return its text + metadata. */
export async function readPdf(filepath: string): Promise<PdfTextResult> {
  const buf = fs.readFileSync(filepath);
  return parsePdfBuffer(buf);
}

export async function parsePdfBuffer(buf: Buffer): Promise<PdfTextResult> {
  const fn = await getPdfParse();
  const parsed = await fn(buf);
  const text = (parsed.text ?? "").trim();
  const lower = text.toLowerCase();
  const language = detectLanguage(lower);
  return {
    text,
    page_count: parsed.numpages ?? 0,
    language,
    size_bytes: buf.length,
  };
}

function detectLanguage(loweredText: string): "english" | "spanish" | "other" {
  const spanishHits = SPANISH_HINTS.filter((s) => loweredText.includes(s)).length;
  if (spanishHits >= 2) return "spanish";
  // Quick English check: if "annual" + ("fee" or "membership") appears, probably English
  if (loweredText.includes("annual") && (loweredText.includes("fee") || loweredText.includes("membership"))) {
    return "english";
  }
  return loweredText.length > 100 ? "other" : "other";
}

/** Filename-level language check (faster than parsing). */
export function isLikelySpanishFromFilename(filenameOrUrl: string): boolean {
  const name = path.basename(filenameOrUrl).toLowerCase();
  return (
    name.startsWith("contrato_") ||
    name.includes("_spanish") ||
    name.endsWith("-spanish.pdf") ||
    name.includes("contrato%20") ||
    name.includes("contrato%5f")
  );
}
