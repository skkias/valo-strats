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
