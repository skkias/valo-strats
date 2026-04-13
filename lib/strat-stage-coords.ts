import type { GameMap } from "@/types/catalog";
import {
  flipPointsOverHorizontalMidline,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import { stratUsesAttackEditorFrame } from "@/lib/map-strat-side";
import type { StratSide } from "@/types/strat";

function stratStoredAttackPointToDisplay(
  vb: ViewBoxRect,
  map: GameMap,
  side: StratSide,
  p: MapPoint,
): MapPoint {
  if (stratUsesAttackEditorFrame(map, side)) return p;
  return flipPointsOverHorizontalMidline(vb, [p])[0]!;
}

/**
 * Strat pins are stored in attack-frame coordinates. When the viewer shows the defense
 * recording, mirror into defense-frame space (same transform as `path_def`).
 */
export function stratStagePinForDisplay(
  vb: ViewBoxRect,
  side: StratSide,
  map: GameMap,
  storedAttack: MapPoint,
): MapPoint {
  return stratStoredAttackPointToDisplay(vb, map, side, storedAttack);
}

export function stratStagePinToStoredAttack(
  vb: ViewBoxRect,
  side: StratSide,
  map: GameMap,
  displayCoords: MapPoint,
): MapPoint {
  return stratStoredAttackPointToDisplay(vb, map, side, displayCoords);
}
