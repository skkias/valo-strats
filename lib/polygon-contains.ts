import type { MapPoint } from "@/lib/map-path";

/** Closed polygon from vertices (edge from last to first). Ray-cast parity test. */
export function pointInPolygon(p: MapPoint, poly: MapPoint[]): boolean {
  if (poly.length < 3) return false;
  const { x, y } = p;
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if ((yi > y) !== (yj > y)) {
      const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xCross) inside = !inside;
    }
  }
  return inside;
}

function polygonCentroid(poly: MapPoint[]): MapPoint {
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  const n = poly.length;
  return { x: sx / n, y: sy / n };
}

/**
 * If `p` is outside the polygon, move it along the segment from the centroid
 * toward `p` until it lies inside (or on the boundary).
 */
export function clampPointInsidePolygon(p: MapPoint, poly: MapPoint[]): MapPoint {
  if (poly.length < 3) return p;
  if (pointInPolygon(p, poly)) return p;
  const c = polygonCentroid(poly);
  if (!pointInPolygon(c, poly)) {
    const b = poly[0];
    if (!b) return p;
    return b;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const q = {
      x: c.x + (p.x - c.x) * mid,
      y: c.y + (p.y - c.y) * mid,
    };
    if (pointInPolygon(q, poly)) lo = mid;
    else hi = mid;
  }
  const t = lo;
  return {
    x: c.x + (p.x - c.x) * t,
    y: c.y + (p.y - c.y) * t,
  };
}

/**
 * Move from `from` toward `to`, staying inside `poly`. Assumes `from` is inside.
 */
export function clampSegmentToInside(
  from: MapPoint,
  to: MapPoint,
  poly: MapPoint[],
): MapPoint {
  if (poly.length < 3) return to;
  if (pointInPolygon(to, poly)) return to;
  if (!pointInPolygon(from, poly)) {
    const f = clampPointInsidePolygon(from, poly);
    if (pointInPolygon(to, poly)) return to;
    return clampSegmentToInside(f, to, poly);
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const q = {
      x: from.x + (to.x - from.x) * mid,
      y: from.y + (to.y - from.y) * mid,
    };
    if (pointInPolygon(q, poly)) lo = mid;
    else hi = mid;
  }
  const t = lo;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** True if `p` is inside the outer polygon and not inside any hole. */
export function pointInOutlineWithHoles(
  p: MapPoint,
  outer: MapPoint[],
  holes: MapPoint[][],
): boolean {
  if (!pointInPolygon(p, outer)) return false;
  for (const h of holes) {
    if (h.length >= 3 && pointInPolygon(p, h)) return false;
  }
  return true;
}

function findAnchorInPlayable(
  outer: MapPoint[],
  holes: MapPoint[][],
): MapPoint | null {
  const c = polygonCentroid(outer);
  if (pointInOutlineWithHoles(c, outer, holes)) return c;
  for (const v of outer) {
    if (pointInOutlineWithHoles(v, outer, holes)) return v;
  }
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % outer.length];
    if (!a || !b) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pointInOutlineWithHoles(mid, outer, holes)) return mid;
  }
  return null;
}

/** Snap a point into the playable region (outer minus holes). */
export function clampPointInsidePlayableRegion(
  p: MapPoint,
  outer: MapPoint[],
  holes: MapPoint[][],
): MapPoint {
  if (outer.length < 3) return p;
  if (pointInOutlineWithHoles(p, outer, holes)) return p;
  const anchor = findAnchorInPlayable(outer, holes);
  if (!anchor) return p;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const q = {
      x: anchor.x + (p.x - anchor.x) * mid,
      y: anchor.y + (p.y - anchor.y) * mid,
    };
    if (pointInOutlineWithHoles(q, outer, holes)) lo = mid;
    else hi = mid;
  }
  return {
    x: anchor.x + (p.x - anchor.x) * lo,
    y: anchor.y + (p.y - anchor.y) * lo,
  };
}

/** Like {@link clampSegmentToInside} but respects holes in the outline. */
export function clampSegmentToOutlineRegion(
  from: MapPoint,
  to: MapPoint,
  outer: MapPoint[],
  holes: MapPoint[][],
): MapPoint {
  const inside = (q: MapPoint) => pointInOutlineWithHoles(q, outer, holes);
  if (outer.length < 3) return to;
  if (inside(to)) return to;
  if (!inside(from)) {
    const f = clampPointInsidePlayableRegion(from, outer, holes);
    if (inside(to)) return to;
    return clampSegmentToOutlineRegion(f, to, outer, holes);
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const q = {
      x: from.x + (to.x - from.x) * mid,
      y: from.y + (to.y - from.y) * mid,
    };
    if (inside(q)) lo = mid;
    else hi = mid;
  }
  const t = lo;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

/** Ensure every vertex lies in the outer polygon and outside holes. */
export function clampPointsToOutline(
  points: MapPoint[],
  outer: MapPoint[],
  holes: MapPoint[][],
): MapPoint[] {
  if (outer.length < 3) return points;
  return points.map((p) =>
    pointInOutlineWithHoles(p, outer, holes)
      ? p
      : clampPointInsidePlayableRegion(p, outer, holes),
  );
}
