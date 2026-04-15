"use client";

import { useMemo, useState } from "react";
import type { Agent, GameMap } from "@/types/catalog";
import type { Strat, StratSide } from "@/types/strat";
import { StratCard } from "@/components/StratCard";
import { StratModal } from "@/components/StratModal";
import { normalizeStratRow } from "@/lib/strat-normalize";
import { Search } from "lucide-react";

const MAP_FILTER_ALL = "__all__";

type SortKey = "newest" | "oldest" | "title-asc" | "title-desc";

function legacyMapKey(displayName: string): string {
  return `legacy:${encodeURIComponent(displayName)}`;
}

function stratMatchesMapFilter(
  s: Strat,
  mapKey: string,
  catalog: GameMap[],
): boolean {
  if (mapKey === MAP_FILTER_ALL) return true;
  if (mapKey.startsWith("legacy:")) {
    const name = decodeURIComponent(mapKey.slice(7));
    return s.map.trim() === name;
  }
  const gm = catalog.find((m) => m.id === mapKey);
  if (!gm) return true;
  if (s.map_id) return s.map_id === gm.id;
  const sm = s.map.trim().toLowerCase();
  return (
    sm === gm.name.trim().toLowerCase() ||
    sm === gm.slug.trim().toLowerCase()
  );
}

export function StratGrid({
  initialStrats,
  agentNamesBySlug = {},
  initialMaps = [],
  initialAgents = [],
}: {
  initialStrats: Strat[];
  agentNamesBySlug?: Record<string, string>;
  initialMaps?: GameMap[];
  initialAgents?: Agent[];
}) {
  const strats = useMemo(
    () => initialStrats.map(normalizeStratRow),
    [initialStrats],
  );

  const agentPortraitsBySlug = useMemo(() => {
    const o: Record<string, string> = {};
    for (const a of initialAgents) {
      const u = a.portrait_url?.trim();
      if (u) o[a.slug] = u;
    }
    return o;
  }, [initialAgents]);

  const mapFilterOptions = useMemo(() => {
    const items: { key: string; label: string }[] = [
      { key: MAP_FILTER_ALL, label: "All maps" },
    ];
    const legacySeen = new Set<string>();

    for (const m of initialMaps) {
      items.push({ key: m.id, label: m.name });
    }

    for (const s of strats) {
      const label = s.map.trim();
      if (!label) continue;
      const covered =
        (s.map_id && initialMaps.some((m) => m.id === s.map_id)) ||
        initialMaps.some(
          (m) =>
            m.name === label ||
            m.slug.toLowerCase() === label.toLowerCase(),
        );
      if (!covered) {
        const k = label.toLowerCase();
        if (!legacySeen.has(k)) {
          legacySeen.add(k);
          items.push({
            key: legacyMapKey(label),
            label: `${label} (unlinked)`,
          });
        }
      }
    }

    return items;
  }, [strats, initialMaps]);

  const [query, setQuery] = useState("");
  const [mapFilter, setMapFilter] = useState(MAP_FILTER_ALL);
  const [sideFilter, setSideFilter] = useState<"all" | StratSide>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Strat | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return strats.filter((s) => {
      if (!stratMatchesMapFilter(s, mapFilter, initialMaps)) return false;
      if (sideFilter !== "all" && s.side !== sideFilter) return false;
      if (!q) return true;
      const hay = [
        s.title,
        s.description,
        s.map,
        ...s.agents,
        ...s.tags,
        s.notes,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [strats, query, mapFilter, sideFilter, initialMaps]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      switch (sortKey) {
        case "newest":
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
          );
        case "title-asc":
          return a.title.localeCompare(b.title, undefined, {
            sensitivity: "base",
          });
        case "title-desc":
          return b.title.localeCompare(a.title, undefined, {
            sensitivity: "base",
          });
        default:
          return 0;
      }
    });
    return out;
  }, [filtered, sortKey]);

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative flex-1 lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400/50"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search strats, agents, maps…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input-field w-full pl-10"
              aria-label="Search strats"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="flex flex-col gap-1 text-xs text-violet-300/70">
              <span className="font-medium text-violet-200/80">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="input-field min-w-44 py-2 text-sm"
                aria-label="Sort strats"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-violet-300/70">
              <span className="font-medium text-violet-200/80">Map</span>
              <select
                value={mapFilter}
                onChange={(e) => setMapFilter(e.target.value)}
                className="input-field min-w-[12rem] py-2 text-sm"
                aria-label="Filter by map"
              >
                {mapFilterOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All sides"],
              ["atk", "Attack"],
              ["def", "Defense"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSideFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                sideFilter === value
                  ? "bg-violet-500 text-slate-950 shadow-md shadow-violet-500/30"
                  : "text-violet-200/60 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <p className="mt-12 text-center text-violet-300/50">
            No strats match your filters. Coaches can add strats from the Coach
            page.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((s) => (
              <li key={s.id}>
                <StratCard
                  strat={s}
                  agentNamesBySlug={agentNamesBySlug}
                  agentPortraitsBySlug={agentPortraitsBySlug}
                  onOpen={setSelected}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <StratModal
        key={selected?.id ?? "closed"}
        strat={selected}
        onClose={() => setSelected(null)}
        maps={initialMaps}
        agentsCatalog={initialAgents}
      />
    </>
  );
}
