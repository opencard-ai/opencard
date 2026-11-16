import type { OtherBenefit } from "./cards";

export interface NormalizedOtherBenefit {
  name?: string;
  description: string;
}

/** Normalize legacy benefit shapes for display without changing card data. */
export function normalizeOtherBenefit(value: OtherBenefit): NormalizedOtherBenefit | null {
  if (value === null) return null;
  if (typeof value === "string") {
    const description = value.trim();
    return description ? { description } : null;
  }

  const name = value.name?.trim() || value.benefit?.trim();
  const description = value.description?.trim() || "";
  if (!name && !description) return null;
  return name ? { name, description } : { description };
}

export function normalizeOtherBenefits(values: readonly OtherBenefit[] | null | undefined): NormalizedOtherBenefit[] {
  return (values ?? []).flatMap((value) => {
    const benefit = normalizeOtherBenefit(value);
    return benefit ? [benefit] : [];
  });
}
