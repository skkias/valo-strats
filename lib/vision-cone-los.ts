import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import type { MapPoint } from "@/lib/map-path";
import { parsePathToRings } from "@/lib/map-path";
import { outlinePathForStratDisplay } from "@/lib/map-strat-side";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import { circleToPolygon, isCircleOverlay } from "@/lib/map-overlay-geometry";
import { pointInPolygon } from "@/lib/polygon-contains";

export type VisionLosContext = {
  outer: MapPoint[];
  holes: MapPoint[][];
  obstaclePolygons: MapPoint[][];
};

type Segment = { a: MapPoint; b: MapPoint };

function ringSegments(points: MapPoint[]): Segment[] {
  if (points.length < 2) return [];
  const segs: Segment[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    segs.push({ a, b });
  }
  return segs;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function raySegmentHitDistance(
  o: MapPoint,
  dx: number,
  dy: number,
  seg: Segment,
): number | null {
  const sx = seg.b.x - seg.a.x;
  const sy = seg.b.y - seg.a.y;
  const den = cross(dx, dy, sx, sy);
  if (Math.abs(den) < 1e-9) return null;
  const qpx = seg.a.x - o.x;
  const qpy = seg.a.y - o.y;
  const t = cross(qpx, qpy, sx, sy) / den;
  const u = cross(qpx, qpy, dx, dy) / den;
  if (t < 0) return null;
  if (u < 0 || u > 1) return null;
  return t;
}

function normalizeSignedRad(rad: number): number {
  let r = rad;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function buildVisionLosContext(
  gameMap: GameMap,
  side: StratSide,
): VisionLosContext | null {
  const outlinePath = outlinePathForStratDisplay(gameMap, side);
  const rings = parsePathToRings(outlinePath);
  const outer = rings[0] ?? [];
  if (outer.length < 3) return null;
  const holes = rings.slice(1).filter((r) => r.length >= 3);
  const overlays = stratMapDisplayData(gameMap, side).overlays;
  const obstaclePolygons: MapPoint[][] = overlays
    .filter((sh) => sh.kind === "obstacle")
    .map((sh) => {
      if (isCircleOverlay(sh) && sh.circle) {
        return circleToPolygon(sh.circle, 72);
      }
      return sh.points;
    })
    .filter((pts) => pts.length >= 3);
  return { outer, holes, obstaclePolygons };
}

export function computeVisionConeLosPolygon(args: {
  origin: MapPoint;
  left: MapPoint;
  right: MapPoint;
  context: VisionLosContext;
}): MapPoint[] {
  const { origin, left, right, context } = args;
  for (const poly of context.obstaclePolygons) {
    if (pointInPolygon(origin, poly)) return [origin];
  }

  const boundarySegments: Segment[] = [
    ...ringSegments(context.outer),
    ...context.holes.flatMap((h) => ringSegments(h)),
    ...context.obstaclePolygons.flatMap((p) => ringSegments(p)),
  ];

  const lvx = left.x - origin.x;
  const lvy = left.y - origin.y;
  const rvx = right.x - origin.x;
  const rvy = right.y - origin.y;
  const leftAng = Math.atan2(lvy, lvx);
  const rightAng = Math.atan2(rvy, rvx);
  const sweep = normalizeSignedRad(rightAng - leftAng);
  const range = Math.max(Math.hypot(lvx, lvy), Math.hypot(rvx, rvy), 1);
  const rayCount = Math.max(18, Math.min(120, Math.round(Math.abs(sweep) * 36)));

  const pts: MapPoint[] = [origin];
  for (let i = 0; i <= rayCount; i++) {
    const t = i / rayCount;
    const a = leftAng + sweep * t;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let nearest = range;
    for (const seg of boundarySegments) {
      const hit = raySegmentHitDistance(origin, dx, dy, seg);
      if (hit == null) continue;
      if (hit < nearest) nearest = hit;
    }
    pts.push({
      x: origin.x + dx * nearest,
      y: origin.y + dy * nearest,
    });
  }
  return pts;
}
