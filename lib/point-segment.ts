import type { MapPoint } from "@/lib/map-path";

/** Distance from p to segment ab, and closest point on the segment. */
export function pointToSegmentDistance(
  p: MapPoint,
  a: MapPoint,
  b: MapPoint,
): { dist: number; closest: MapPoint } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) {
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    return { dist, closest: { x: a.x, y: a.y } };
  }
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const closest = { x: cx, y: cy };
  const dist = Math.hypot(p.x - cx, p.y - cy);
  return { dist, closest };
}

/**
 * Find the closest polygon / polyline edge to `p` within `maxDist`.
 * `closed`: include edge from last vertex back to first (needs n ≥ 3).
 */
export function closestEdgeWithinDistance(
  points: MapPoint[],
  p: MapPoint,
  closed: boolean,
  maxDist: number,
): { edgeIndex: number; closest: MapPoint } | null {
  const n = points.length;
  if (n < 2) return null;
  let bestDist = Infinity;
  let bestEdge = -1;
  let bestClosest = p;

  const consider = (edgeIndex: number, a: MapPoint, b: MapPoint) => {
    const { dist, closest } = pointToSegmentDistance(p, a, b);
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist;
      bestEdge = edgeIndex;
      bestClosest = closest;
    }
  };

  if (closed && n >= 3) {
    for (let i = 0; i < n; i++) {
      consider(i, points[i]!, points[(i + 1) % n]!);
    }
  } else {
    for (let i = 0; i < n - 1; i++) {
      consider(i, points[i]!, points[i + 1]!);
    }
  }

  return bestEdge >= 0
    ? { edgeIndex: bestEdge, closest: bestClosest }
    : null;
}

/** Insert `newPoint` on the edge that starts at `edgeIndex` (toward the next vertex along the ring). */
export function insertPointOnEdge(
  points: MapPoint[],
  edgeIndex: number,
  newPoint: MapPoint,
  closed: boolean,
): MapPoint[] {
  const n = points.length;
  if (closed && n >= 3) {
    if (edgeIndex === n - 1) {
      return [...points, newPoint];
    }
    return [
      ...points.slice(0, edgeIndex + 1),
      newPoint,
      ...points.slice(edgeIndex + 1),
    ];
  }
  if (edgeIndex < n - 1) {
    return [
      ...points.slice(0, edgeIndex + 1),
      newPoint,
      ...points.slice(edgeIndex + 1),
    ];
  }
  return points;
}
