import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import {
  flipPointsThroughViewBoxCenter,
  parsePathToRings,
  ringsToPathD,
  type ViewBoxRect,
} from "@/lib/map-path";
import { stratSideDisplayFlip } from "@/lib/strat-side-display-geometry";
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
 * Outline for the strat viewer: 180° about the viewBox center whenever the strat side is
 * the “mirrored” one (defense on normal maps, attack when invert-meaning is on), always
 * derived from `path_atk` so outline + overlays + pins stay one consistent frame.
 */
export function outlinePathForStratDisplay(
  map: GameMap,
  side: StratSide,
): string | null {
  const mode = stratSideDisplayFlip(map, side);
  const atk = map.path_atk?.trim() ? map.path_atk : null;
  if (!atk) return null;

  if (mode === "none") return atk;

  const vb = viewBoxRectFromMap(map);
  const rings = parsePathToRings(atk);
  if (rings.length === 0) return atk;
  const outer0 = rings[0];
  if (!outer0 || outer0.length < 3) return atk;
  const flipped = rings.map((ring) => flipPointsThroughViewBoxCenter(vb, ring));
  const outer = flipped[0] ?? [];
  const holes = flipped.slice(1);
  return ringsToPathD(outer, holes);
}
