import type { GameMap } from "@/types/catalog";
import { parseViewBox } from "@/lib/view-box";
import {
  flipPointsOverHorizontalMidline,
  parsePathToRings,
  type MapOutlineRings,
} from "@/lib/map-path";

/**
 * Attack-side outline rings from stored paths (must match SSR; computed on the server
 * so client state matches hydration).
 */
export function initialOutlineRings(initial: GameMap): MapOutlineRings {
  const vb = parseViewBox(initial.view_box);
  const vbRect = {
    minX: vb.minX,
    minY: vb.minY,
    width: vb.width,
    height: vb.height,
  };

  const atk = parsePathToRings(initial.path_atk);
  if (atk.length > 0) {
    const outer = atk[0]!;
    const holes = atk.slice(1).filter((r) => r.length >= 3);
    if (outer.length >= 3) return { outer, holes };
  }

  const def = parsePathToRings(initial.path_def);
  if (def.length > 0) {
    const outer0 = def[0]!;
    const holes0 = def.slice(1).filter((r) => r.length >= 3);
    if (outer0.length >= 3) {
      return {
        outer: flipPointsOverHorizontalMidline(vbRect, outer0),
        holes: holes0.map((h) => flipPointsOverHorizontalMidline(vbRect, h)),
      };
    }
  }

  return { outer: [], holes: [] };
}
