import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";

/**
 * Map shape editor stores traced geometry as `path_atk` (purple). `path_def` is the auto
 * horizontal midline mirror. Strat map viewer: horizontal-mirror overlays/spawns/labels/pins
 * from `path_atk` space when the row says **Yes**:
 *
 * | Invert meaning | Strat side | Horizontal mirror |
 * |----------------|------------|---------------------|
 * | No             | Attack     | **Yes**             |
 * | No             | Defense    | **No**              |
 * | Yes            | Attack     | **No**              |
 * | Yes            | Defense    | **Yes**             |
 */
export function stratMapViewerShowsMirroredOutline(
  map: GameMap,
  side: StratSide,
): boolean {
  const inv = normalizeEditorMeta(map.editor_meta).side_meaning_inverted === true;
  return (!inv && side === "atk") || (inv && side === "def");
}

/**
 * Territory outline: `path_def` when {@link stratMapViewerShowsMirroredOutline} (same rows
 * as **Yes** in the table); otherwise `path_atk`.
 */
export function outlinePathForStratSide(
  map: GameMap,
  side: "atk" | "def",
): string | null {
  const useDef = stratMapViewerShowsMirroredOutline(map, side);
  const atk = map.path_atk?.trim() ? map.path_atk : null;
  const def = map.path_def?.trim() ? map.path_def : null;
  if (useDef) return def ?? atk;
  return atk ?? def;
}

/** Territory outline for the strat viewer (same as {@link outlinePathForStratSide}). */
export function outlinePathForStratDisplay(
  map: GameMap,
  side: StratSide,
): string | null {
  return outlinePathForStratSide(map, side);
}
