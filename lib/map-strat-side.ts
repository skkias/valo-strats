import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";

/**
 * Which “recording” of the map matches this strat side name: attack-side editor frame
 * (`path_atk`, attack layers) vs defense frame (`path_def`, mirrored layers). Inversion
 * swaps which name uses which recording: `(side === "atk") !== inverted`.
 */
export function stratUsesAttackEditorFrame(
  map: GameMap,
  side: StratSide,
): boolean {
  const inv = normalizeEditorMeta(map.editor_meta).side_meaning_inverted === true;
  return (side === "atk") !== inv;
}

/**
 * Territory outline: `path_atk` in the attack editor frame, `path_def` in the defense frame.
 */
export function outlinePathForStratSide(
  map: GameMap,
  side: "atk" | "def",
): string | null {
  const atkFrame = stratUsesAttackEditorFrame(map, side);
  const atk = map.path_atk?.trim() ? map.path_atk : null;
  const def = map.path_def?.trim() ? map.path_def : null;
  if (atkFrame) return atk ?? def;
  return def ?? atk;
}

/** Territory outline for the strat viewer (same as {@link outlinePathForStratSide}). */
export function outlinePathForStratDisplay(
  map: GameMap,
  side: StratSide,
): string | null {
  return outlinePathForStratSide(map, side);
}
