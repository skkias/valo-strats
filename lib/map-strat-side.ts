import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import {
  flipPointsOverVerticalMidline,
  parsePathToRings,
  ringsToPathD,
  type ViewBoxRect,
} from "@/lib/map-path";
import { parseViewBox } from "@/lib/view-box";

function viewBoxRectFromMap(map: GameMap): ViewBoxRect {
  const p = parseViewBox(map.view_box);
  return { minX: p.minX, minY: p.minY, width: p.width, height: p.height };
}

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

/**
 * Territory outline for the strat viewer. Attack uses the stored attack outline.
 * Defense uses a **vertical** (y-axis / left↔right) mirror of that outline so it
 * matches `stratMapDisplayData` — not the DB `path_def` top↔bottom mirror.
 */
export function outlinePathForStratDisplay(
  map: GameMap,
  side: StratSide,
): string | null {
  const atkPath = outlinePathForStratSide(map, "atk");
  if (side === "atk" || !atkPath?.trim()) return atkPath;
  const vb = viewBoxRectFromMap(map);
  const rings = parsePathToRings(atkPath);
  if (rings.length === 0) return atkPath;
  const outer0 = rings[0];
  if (!outer0 || outer0.length < 3) return atkPath;
  const flipped = rings.map((ring) => flipPointsOverVerticalMidline(vb, ring));
  const outer = flipped[0] ?? [];
  const holes = flipped.slice(1);
  return ringsToPathD(outer, holes);
}
