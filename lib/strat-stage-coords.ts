import type { GameMap } from "@/types/catalog";
import {
  flipPointsOverHorizontalMidline,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import { stratMapViewerShowsMirroredOutline } from "@/lib/map-strat-side";
import type { StratSide } from "@/types/strat";

function stratStoredAttackPointToDisplay(
  vb: ViewBoxRect,
  map: GameMap,
  side: StratSide,
  p: MapPoint,
): MapPoint {
  if (!stratMapViewerShowsMirroredOutline(map, side)) return p;
  return flipPointsOverHorizontalMidline(vb, [p])[0]!;
}

/**
 * Stage pins are stored in `path_atk` coordinates. Strat map viewer: mirror into `path_def`
 * frame when {@link stratMapViewerShowsMirroredOutline} (same as `stratMapDisplayData`).
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
