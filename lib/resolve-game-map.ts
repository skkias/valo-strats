import type { GameMap } from "@/types/catalog";
import type { Strat } from "@/types/strat";

/** Prefer `map_id`; otherwise match catalog by name or slug (legacy rows). */
export function resolveGameMapForStrat(
  strat: Strat,
  maps: GameMap[],
): GameMap | null {
  if (strat.map_id) {
    const byId = maps.find((m) => m.id === strat.map_id);
    if (byId) return byId;
  }
  const n = strat.map.trim().toLowerCase();
  if (!n) return null;
  return (
    maps.find((m) => m.name.toLowerCase() === n) ??
    maps.find((m) => m.slug.toLowerCase() === n) ??
    null
  );
}
