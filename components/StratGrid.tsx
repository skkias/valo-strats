"use client";

import { useMemo, useState } from "react";
import type { Strat, StratSide } from "@/types/strat";
import { StratCard } from "@/components/StratCard";
import { StratModal } from "@/components/StratModal";
import { Search } from "lucide-react";

function normalizeStrat(raw: Strat): Strat {
  return {
    ...raw,
    agents: Array.isArray(raw.agents) ? raw.agents : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

export function StratGrid({ initialStrats }: { initialStrats: Strat[] }) {
  const strats = useMemo(
    () => initialStrats.map(normalizeStrat),
    [initialStrats],
  );

  const maps = useMemo(() => {
    const set = new Set(strats.map((s) => s.map));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [strats]);

  const [query, setQuery] = useState("");
  const [mapFilter, setMapFilter] = useState("All");
  const [sideFilter, setSideFilter] = useState<"all" | StratSide>("all");
  const [selected, setSelected] = useState<Strat | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return strats.filter((s) => {
      if (mapFilter !== "All" && s.map !== mapFilter) return false;
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
  }, [strats, query, mapFilter, sideFilter]);

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-md">
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
          <div className="flex flex-wrap gap-2">
            {maps.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMapFilter(m)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  mapFilter === m
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/25"
                    : "border border-violet-800/40 bg-slate-950/50 text-violet-200/80 hover:border-violet-600/35 hover:bg-violet-950/30"
                }`}
              >
                {m}
              </button>
            ))}
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

        {filtered.length === 0 ? (
          <p className="mt-12 text-center text-violet-300/50">
            No strats match your filters. Coaches can add strats from the Coach
            page.
          </p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <li key={s.id}>
                <StratCard strat={s} onOpen={setSelected} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <StratModal
        key={selected?.id ?? "closed"}
        strat={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
