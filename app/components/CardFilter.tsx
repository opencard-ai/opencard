"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";

interface CardFilterProps {
  issuers: string[];
  tags: string[];
}

// Clean tag groupings — map raw DB tags to display groups
const TAG_GROUPS: Record<string, { label: string; tags: string[] }> = {
  "no-annual-fee": {
    label: "No Annual Fee",
    tags: [],
  },
  "travel": {
    label: "✈️ Travel",
    tags: ["travel", "flights", "hotels, car rentals & attractions (cititravel.com)", "hotel_hilton", "hotel_marriott", "hilton hotels and resorts", "marriott hotels", "ihg", "chase travel"],
  },
  "airline": {
    label: "✈️ Airline",
    tags: ["united flights", "united purchases (airline tickets, seat upgrades, economy plus, inflight food/beverages/wi-fi, united fees)", "delta purchases"],
  },
  "hotel": {
    label: "🏨 Hotel",
    tags: ["hotel_hilton", "hotel_marriott", "hilton hotels and resorts", "marriott hotels", "ihg"],
  },
  "cashback": {
    label: "💰 Cash Back",
    tags: ["all purchases", "all purchases (flat)", "all purchases (buy)", "groceries", "grocery stores", "gas (costco)", "restaurants", "u.s. supermarkets", "rotating", "rotating 5% categories"],
  },
  "points": {
    label: "🏅 Points & Miles",
    tags: ["travel", "flights"],
  },
  "business": {
    label: "💼 Business",
    tags: ["top 2 eligible business categories", "office supply stores"],
  },
  "dining": {
    label: "🍽️ Dining",
    tags: ["restaurants"],
  },
  "groceries": {
    label: "🛒 Groceries",
    tags: ["groceries", "grocery stores", "u.s. supermarkets"],
  },
};

// Build display list: group labels for known groups, raw tags for unknown ones
function buildDisplayTags(allTags: string[]) {
  const usedGroupTags = new Set<string>();
  const groups: { value: string; label: string }[] = [];

  // Add known groups (only if they have matching tags)
  for (const [groupKey, group] of Object.entries(TAG_GROUPS)) {
    if (groupKey === "no-annual-fee") {
      // No AF group — always show
      groups.push({ value: groupKey, label: "✅ No Annual Fee" });
      continue;
    }
    const matchingTags = group.tags.filter((t) => allTags.includes(t));
    if (matchingTags.length > 0) {
      groups.push({ value: groupKey, label: group.label });
      matchingTags.forEach((t) => usedGroupTags.add(t));
    }
  }

  // Add remaining raw tags that aren't covered by any group
  for (const tag of allTags) {
    if (usedGroupTags.has(tag)) continue;
    // Skip generic tags already covered
    if (["travel", "flights", "all purchases", "all purchases (flat)", "all purchases (buy)", "groceries", "grocery stores", "restaurants", "u.s. supermarkets", "rotating", "rotating 5% categories"].includes(tag)) continue;
    groups.push({ value: tag, label: tag });
  }

  return groups;
}

// Map selected tag value back to actual DB tags to filter
function resolveTagFilter(selectedValue: string, allTags: string[]): string {
  if (!selectedValue) return "";
  const group = TAG_GROUPS[selectedValue];
  if (!group) return selectedValue;
  if (selectedValue === "no-annual-fee") {
    // No AF is special — return a magic value the CardGrid will handle
    return "__no-af__";
  }
  // Return first matching tag for this group
  return group.tags.find((t) => allTags.includes(t)) || "";
}

export default function CardFilter({ issuers, tags }: CardFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showFilters, setShowFilters] = useState(false);

  const selectedIssuer = searchParams.get("issuer") || "";
  const selectedTag = searchParams.get("tag") || "";
  const search = searchParams.get("search") || "";

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}#cards`, { scroll: true });
    },
    [router, pathname, searchParams]
  );

  const displayTags = buildDisplayTags(tags);

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="搜尋卡片名稱..."
            defaultValue={search}
            onChange={(e) => updateParams("search", e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="sm:hidden px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          篩選 {showFilters ? "▲" : "▼"}
        </button>
      </div>

      {/* Filter row */}
      <div
        className={`flex flex-wrap gap-2 ${
          showFilters ? "block" : "hidden sm:flex"
        }`}
      >
        <select
          value={selectedIssuer}
          onChange={(e) => updateParams("issuer", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">所有發卡機構</option>
          {issuers.map((issuer) => (
            <option key={issuer} value={issuer}>
              {issuer}
            </option>
          ))}
        </select>

        <select
          value={selectedTag}
          onChange={(e) => updateParams("tag", e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
        >
          <option value="">所有類型</option>
          {displayTags.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {(selectedIssuer || selectedTag || search) && (
          <button
            onClick={() => router.push(`${pathname}#cards`)}
            className="px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            清除篩選
          </button>
        )}
      </div>
    </div>
  );
}

// Export helper for CardGrid to use
export { resolveTagFilter, TAG_GROUPS };
