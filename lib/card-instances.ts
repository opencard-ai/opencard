import { resolveCardId } from "./card-aliases";

export interface UserCardInstance {
  [field: string]: unknown;
  instance_id: string;
  card_id: string;
  nickname?: string;
  last4?: string;
  created_at: number;
  status: "active" | "closed";
}

/** Migrate rows without deduplicating products or dropping per-copy metadata.
 * Keep the first legacy ID for existing open-date / benefit-use sidecars.
 * Deterministic suffixes keep read-only cloud migrations stable across loads.
 */
export function normalizeCardInstances(input: unknown, fallbackCards?: unknown): UserCardInstance[] {
  const source = Array.isArray(input) ? input : Array.isArray(fallbackCards) ? fallbackCards : [];
  const rows = source.flatMap((entry): Record<string, unknown>[] => {
    if (typeof entry === "string") return [{ card_id: entry, instance_id: entry }];
    return entry && typeof entry === "object" ? [entry as Record<string, unknown>] : [];
  });
  const reserved = new Set(rows.map(row => String(row.instance_id || row.card_id || "")));
  const used = new Set<string>();
  return rows.flatMap((row): UserCardInstance[] => {
    const cardId = String(row.card_id || row.instance_id || "");
    const base = String(row.instance_id || cardId);
    const validId = /^[a-z0-9][a-z0-9-]{0,80}$/;
    if (!validId.test(cardId) || !validId.test(base)) return [];
    let id = base;
    let suffix = 2;
    while (used.has(id) || (id !== base && reserved.has(id))) {
      const tail = `-copy-${suffix++}`;
      id = `${base.slice(0, 80 - tail.length)}${tail}`;
    }
    used.add(id);
    return [{
      instance_id: id,
      card_id: resolveCardId(cardId),
      ...(row.nickname ? { nickname: String(row.nickname).slice(0, 80) } : {}),
      ...(row.last4 ? { last4: String(row.last4).slice(-4) } : {}),
      ...(row.open_date !== undefined ? { open_date: row.open_date } : {}),
      created_at: typeof row.created_at === "number" && Number.isFinite(row.created_at) ? row.created_at : Date.now(),
      status: row.status === "closed" ? "closed" : "active",
    }];
  });
}

export function addCardInstance(input: unknown, cardId: string): UserCardInstance[] {
  return [...normalizeCardInstances(input), {
    instance_id: `card-${crypto.randomUUID()}`,
    card_id: resolveCardId(cardId), created_at: Date.now(), status: "active",
  }];
}

/** Product checkboxes select all existing copies; unrelated edits retain them. */
export function selectCardProducts(input: unknown, cardIds: string[]): UserCardInstance[] {
  let next = normalizeCardInstances(input).filter(row => cardIds.includes(row.card_id));
  for (const id of cardIds) {
    if (!next.some(row => row.card_id === id)) next = addCardInstance(next, id);
  }
  return next;
}

export function cardProductIds(input: unknown): string[] {
  return [...new Set(normalizeCardInstances(input).map(row => row.card_id))];
}
