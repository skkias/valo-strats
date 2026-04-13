import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";

/**
 * Whether strat map layers should use point reflection through the viewBox center (180°),
 * same as MapShapeEditor “Swap sides”.
 *
 * That applies whenever the strat side is the “mirrored” one relative to stored `path_atk`
 * geometry — including **defense** on normal maps and **attack** when
 * `side_meaning_inverted` is true (Split-style label swap). One transform keeps Pearl and
 * inverted maps consistent; we do not use a separate horizontal-mirror path for inverted
 * attack (that mixed `path_def` with center-flipped pins and looked wrong).
 */
export type StratSideDisplayFlip = "none" | "center";

export function stratSideDisplayFlip(
  map: GameMap,
  side: StratSide,
): StratSideDisplayFlip {
  const em = normalizeEditorMeta(map.editor_meta);
  const meaningInverted = em.side_meaning_inverted === true;
  const shouldFlipForSide = meaningInverted ? side === "atk" : side === "def";
  if (!shouldFlipForSide) return "none";
  return "center";
}
