/**
 * Loads all card JSON files from data/cards/.
 * Excludes discontinued cards and cards in cards-archive/.
 */

import fs from "fs";
import path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");
const ARCHIVE_DIR = path.join(process.cwd(), "data/cards-archive");

export interface Card {
  card_id: string;
  name: string;
  issuer: string;
  network: string;
  annual_fee: number;
  foreign_transaction_fee: number;
  credit_required: string;
  welcome_offer?: {
    bonus_points?: number;
    spending_requirement?: number;
    time_period_months?: number;
    description?: string;
    point_program?: string;
    estimated_value?: number;
    is_elevated?: boolean;
    normal_bonus_points?: number;
    elevated_until?: string;
  };
  earning_rates: { category: string; rate: number; notes?: string }[];
  recurring_credits?: unknown[];
  travel_benefits?: unknown;
  insurance?: unknown;
  sources?: { url: string }[];
  last_updated?: string;
  featured?: boolean;
  status?: string;
  tags?: string[];
}

export function loadCards(): Card[] {
  if (!fs.existsSync(CARDS_DIR)) {
    console.error(`Cards directory not found: ${CARDS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));

  return files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(CARDS_DIR, f), "utf8");
        const card = JSON.parse(raw) as Card;
        return card;
      } catch {
        console.warn(`⚠️  Failed to parse ${f}, skipping`);
        return null;
      }
    })
    .filter((c): c is Card => {
      if (!c) return false;
      // Exclude discontinued
      if (c.status === "discontinued") return false;
      return true;
    });
}
