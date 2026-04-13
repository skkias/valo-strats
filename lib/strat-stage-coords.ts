import {
  flipPointsOverHorizontalMidline,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import type { StratSide } from "@/types/strat";

/**
 * Stage pins are stored in attack-side viewBox coordinates. Defense view reflects
 * across the horizontal midline (`flipPointsOverHorizontalMidline`), matching
 * `path_def` and `stratMapDisplayData`.
 */
export function stratStagePinForDisplay(
  vb: ViewBoxRect,
  side: StratSide,
  storedAttack: MapPoint,
): MapPoint {
  if (side === "atk") return storedAttack;
  return flipPointsOverHorizontalMidline(vb, [storedAttack])[0]!;
}

/** Convert a screen coordinate (for the current strat side) to stored attack coords. */
export function stratStagePinToStoredAttack(
  vb: ViewBoxRect,
  side: StratSide,
  displayCoords: MapPoint,
): MapPoint {
  if (side === "atk") return displayCoords;
  return flipPointsOverHorizontalMidline(vb, [displayCoords])[0]!;
}
