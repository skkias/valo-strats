import type { MapPoint } from "@/lib/map-path";

/** Distance from anchor to rotation handle on the strat map (logical units, ~% of view width). */
export function stratAbilityRotationHandleDistance(vbWidth: number): number {
  return Math.max(vbWidth * 0.048, 14);
}

/** Stored attack-space point for the rotation handle (angle follows `rotationDeg` from +X). */
export function stratAbilityRotationHandleStored(
  origin: MapPoint,
  rotationDeg: number,
  dist: number,
): MapPoint {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    x: origin.x + dist * Math.cos(rad),
    y: origin.y + dist * Math.sin(rad),
  };
}

/**
 * Ricochet: place the rotate affordance beside the launch ray (perpendicular offset) so
 * short paths and the origin mover stay visible; drag math still uses pointer vs origin.
 */
export function stratRicochetRotationHandleDisplay(
  origin: MapPoint,
  rotationDeg: number,
  vbWidth: number,
  pinScale: number,
): MapPoint {
  const rad = (rotationDeg * Math.PI) / 180;
  const px = -Math.sin(rad);
  const py = Math.cos(rad);
  const lateral = Math.max(vbWidth * 0.02, 7) * pinScale;
  return {
    x: origin.x + px * lateral,
    y: origin.y + py * lateral,
  };
}

/**
 * Toggleable ray ON/OFF was drawn at the segment midpoint, which sits on the same line as
 * the origin mover and rotation diamond — they stack and fight for hits. Nudge the label
 * perpendicular to the blueprint chord, choosing the side with more clearance from handles.
 */
export function stratToggleableRayToggleOffsetFromLine(
  mid: MapPoint,
  segmentStartDisplay: MapPoint,
  segmentEndDisplay: MapPoint,
  avoid: readonly MapPoint[],
  vbWidth: number,
  pinScale: number,
): MapPoint {
  let dx = segmentEndDisplay.x - segmentStartDisplay.x;
  let dy = segmentEndDisplay.y - segmentStartDisplay.y;
  let len = Math.hypot(dx, dy);
  if (len < 1e-4 && avoid.length >= 2) {
    dx = avoid[1].x - avoid[0].x;
    dy = avoid[1].y - avoid[0].y;
    len = Math.hypot(dx, dy);
  }
  if (len < 1e-4) return mid;

  const nx0 = -dy / len;
  const ny0 = dx / len;
  /** Enough to clear ON/OFF circle (~1.1% vb) plus handle stacks. */
  const step = Math.max(vbWidth * 0.03, 15) * pinScale;

  function minDistToAvoid(p: MapPoint): number {
    let m = Infinity;
    for (const q of avoid) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < m) m = d;
    }
    return m;
  }

  const plus = { x: mid.x + nx0 * step, y: mid.y + ny0 * step };
  const minus = { x: mid.x - nx0 * step, y: mid.y - ny0 * step };
  return minDistToAvoid(plus) >= minDistToAvoid(minus) ? plus : minus;
}
