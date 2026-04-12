"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";

interface CardFilterProps {
  issuers: string[];
  tags: string[];
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
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">所有類型</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
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
