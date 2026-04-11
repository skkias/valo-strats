import type { GameMap } from "@/types/catalog";

/** SVG outline path for a strat side, respecting `side_meaning_inverted` on the map. */
export function outlinePathForStratSide(
  map: GameMap,
  side: "atk" | "def",
): string | null {
  const inv = map.editor_meta?.side_meaning_inverted === true;
  if (!inv) {
    return side === "atk" ? map.path_atk : map.path_def;
  }
  return side === "atk" ? map.path_def : map.path_atk;
}
