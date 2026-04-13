import type { GameMap } from "@/types/catalog";
import {
  flipPointsThroughViewBoxCenter,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import { stratSideDisplayFlip } from "@/lib/strat-side-display-geometry";
import type { StratSide } from "@/types/strat";

function stratStoredAttackPointToDisplay(
  vb: ViewBoxRect,
  map: GameMap,
  side: StratSide,
  p: MapPoint,
): MapPoint {
  const mode = stratSideDisplayFlip(map, side);
  if (mode === "none") return p;
  return flipPointsThroughViewBoxCenter(vb, [p])[0]!;
}

/**
 * Stage pins are stored in attack-side viewBox coordinates. Display matches
 * {@link stratMapDisplayData} (180° flip when showing the mirrored strat side).
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
