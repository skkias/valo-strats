import type { GameMap } from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import type { MapPoint } from "@/lib/map-path";
import { parsePathToRings } from "@/lib/map-path";
import { outlinePathForStratDisplay } from "@/lib/map-strat-side";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import { circleToPolygon, isCircleOverlay } from "@/lib/map-overlay-geometry";
import { pointInOutlineWithHoles, pointInPolygon } from "@/lib/polygon-contains";
import {
  effectiveDoorIsOpen,
  type StratDoorOpenByOverlayId,
} from "@/lib/strat-stage-door-states";

export type VisionLosContext = {
  outer: MapPoint[];
  holes: MapPoint[][];
  /** Filled zones: edges block rays; interior invalidates vision-cone origins. */
  filledBlockerPolygons: MapPoint[][];
  /**
   * Hollow shells (e.g. smoke rim): boundary can block, but interior is
   * transparent to LOS and vision origins may lie inside.
   */
  hollowBlockerRings: MapPoint[][];
  /** Opaque 1D obstacles (walls drawn as lines, rays, polylines). */
  openBlockerSegments: Segment[];
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

function opaqueSegmentsFromContext(ctx: VisionLosContext): Segment[] {
  return [
    ...ringSegments(ctx.outer),
    ...ctx.holes.flatMap((h) => ringSegments(h)),
    ...ctx.filledBlockerPolygons.flatMap((p) => ringSegments(p)),
    ...ctx.openBlockerSegments,
  ];
}

function sortedUniqueRayRingHits(
  o: MapPoint,
  dx: number,
  dy: number,
  ring: MapPoint[],
  maxT: number,
): number[] {
  const ts: number[] = [];
  for (const seg of ringSegments(ring)) {
    const t = raySegmentHitDistance(o, dx, dy, seg);
    if (t != null && t > 1e-6 && t <= maxT + 1e-6) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of ts) {
    if (out.length === 0 || Math.abs(t - out[out.length - 1]!) > 1e-4) {
      out.push(t);
    }
  }
  return out;
}

/**
 * If the ray can pass through a hollow ring before the next opaque hit, return
 * how far along the ray to advance (past the exit boundary).
 */
function trySkipThroughHollowRing(
  o: MapPoint,
  dx: number,
  dy: number,
  ring: MapPoint[],
  remaining: number,
  nextOpaqueDist: number | null,
): number | null {
  const EPS = 1e-3;
  const cap = Math.min(remaining, nextOpaqueDist ?? remaining);
  const ts = sortedUniqueRayRingHits(o, dx, dy, ring, cap + EPS);
  const inside = pointInPolygon(o, ring);

  if (inside) {
    if (ts.length === 0) return null;
    const t0 = ts[0]!;
    if (t0 > cap + EPS) return null;
    return Math.min(t0 + EPS, remaining);
  }

  if (ts.length >= 2) {
    const tEnter = ts[0]!;
    const tExit = ts[1]!;
    if (tEnter > cap + EPS) return null;
    if (tExit > cap + EPS) return null;
    return Math.min(tExit + EPS, remaining);
  }

  return null;
}

function nearestRayHitDistance(
  origin: MapPoint,
  angleRad: number,
  maxRange: number,
  context: VisionLosContext,
): number {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const EPS = 1e-3;
  let traveled = 0;
  let ox = origin.x;
  let oy = origin.y;
  let remaining = maxRange;

  for (let iter = 0; iter < 128; iter++) {
    if (remaining <= EPS) return traveled;

    const opaqueSegs = opaqueSegmentsFromContext(context);
    let nextOpaque: number | null = null;
    for (const seg of opaqueSegs) {
      const t = raySegmentHitDistance({ x: ox, y: oy }, dx, dy, seg);
      if (t != null && t > EPS && t <= remaining + EPS) {
        if (nextOpaque == null || t < nextOpaque) nextOpaque = t;
      }
    }

    for (const ring of context.hollowBlockerRings) {
      const oPt = { x: ox, y: oy };
      const ts = sortedUniqueRayRingHits(oPt, dx, dy, ring, remaining + EPS);
      if (ts.length === 1 && !pointInPolygon(oPt, ring)) {
        const t0 = ts[0]!;
        if (nextOpaque == null || t0 < nextOpaque) nextOpaque = t0;
      }
    }

    let bestSkip: number | null = null;
    for (const ring of context.hollowBlockerRings) {
      const skip = trySkipThroughHollowRing(
        { x: ox, y: oy },
        dx,
        dy,
        ring,
        remaining + EPS,
        nextOpaque,
      );
      if (skip != null && skip > EPS && (bestSkip == null || skip < bestSkip)) {
        bestSkip = skip;
      }
    }

    if (
      bestSkip != null &&
      (nextOpaque == null || bestSkip < nextOpaque - EPS)
    ) {
      const step = Math.min(bestSkip, remaining);
      traveled += step;
      ox += dx * step;
      oy += dy * step;
      remaining -= step;
      continue;
    }

    if (nextOpaque != null) {
      return traveled + Math.min(nextOpaque, remaining);
    }

    return traveled + remaining;
  }

  return traveled;
}

export function buildVisionLosContext(
  gameMap: GameMap,
  side: StratSide,
  doorOpenByOverlayId?: StratDoorOpenByOverlayId,
): VisionLosContext | null {
  const outlinePath = outlinePathForStratDisplay(gameMap, side);
  const rings = parsePathToRings(outlinePath);
  const outer = rings[0] ?? [];
  if (outer.length < 3) return null;
  const holes = rings.slice(1).filter((r) => r.length >= 3);
  const overlays = stratMapDisplayData(gameMap, side).overlays;
  const filledBlockerPolygons: MapPoint[][] = overlays
    .filter((sh) => sh.kind === "obstacle" || sh.kind === "wall")
    .map((sh) => {
      if (isCircleOverlay(sh) && sh.circle) {
        return circleToPolygon(sh.circle, 72);
      }
      return sh.points;
    })
    .filter((pts) => pts.length >= 3);

  const openBlockerSegments: Segment[] = [];
  for (const sh of overlays) {
    if (sh.kind !== "toggle_door" && sh.kind !== "breakable_doorway") continue;
    if (effectiveDoorIsOpen(sh, doorOpenByOverlayId)) continue;
    const pts = sh.points;
    if (pts.length < 2) continue;
    for (let i = 0; i + 1 < pts.length; i++) {
      openBlockerSegments.push({ a: pts[i]!, b: pts[i + 1]! });
    }
  }

  return {
    outer,
    holes,
    filledBlockerPolygons,
    hollowBlockerRings: [],
    openBlockerSegments,
  };
}

export function isVisionOriginInPlayable(
  origin: MapPoint,
  context: VisionLosContext,
): boolean {
  if (!pointInOutlineWithHoles(origin, context.outer, context.holes)) return false;
  for (const poly of context.filledBlockerPolygons) {
    if (pointInPolygon(origin, poly)) return false;
  }
  return true;
}

/**
 * Large enough cast distance so rays reach the far side of the map; actual
 * length is always clamped by ray hits.
 */
export function visionLosMaxCastRange(
  origin: MapPoint,
  context: VisionLosContext,
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const expand = (pts: MapPoint[]) => {
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  };
  expand(context.outer);
  for (const h of context.holes) expand(h);
  for (const poly of context.filledBlockerPolygons) expand(poly);
  for (const ring of context.hollowBlockerRings) expand(ring);
  for (const seg of context.openBlockerSegments) {
    expand([seg.a, seg.b]);
  }
  if (!Number.isFinite(minX)) return 1e9;
  const corners: MapPoint[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  let maxCornerDist = 0;
  for (const c of corners) {
    maxCornerDist = Math.max(
      maxCornerDist,
      Math.hypot(c.x - origin.x, c.y - origin.y),
    );
  }
  return Math.max(maxCornerDist * 2.5, 1);
}

export function computeVisionConeRayEnd(args: {
  origin: MapPoint;
  angleRad: number;
  context: VisionLosContext;
}): MapPoint {
  const { origin, angleRad, context } = args;
  const range = visionLosMaxCastRange(origin, context);
  const hit = nearestRayHitDistance(origin, angleRad, range, context);
  return {
    x: origin.x + Math.cos(angleRad) * hit,
    y: origin.y + Math.sin(angleRad) * hit,
  };
}

export function computeVisionConeLosPolygon(args: {
  origin: MapPoint;
  left: MapPoint;
  right: MapPoint;
  context: VisionLosContext;
}): MapPoint[] {
  const { origin, left, right, context } = args;
  if (!isVisionOriginInPlayable(origin, context)) return [origin];

  const lvx = left.x - origin.x;
  const lvy = left.y - origin.y;
  const rvx = right.x - origin.x;
  const rvy = right.y - origin.y;
  const leftAng = Math.atan2(lvy, lvx);
  const rightAng = Math.atan2(rvy, rvx);
  const sweep = normalizeSignedRad(rightAng - leftAng);
  const range = visionLosMaxCastRange(origin, context);
  const rayCount = Math.max(18, Math.min(120, Math.round(Math.abs(sweep) * 36)));

  const pts: MapPoint[] = [origin];
  for (let i = 0; i <= rayCount; i++) {
    const t = i / rayCount;
    const a = leftAng + sweep * t;
    const nearest = nearestRayHitDistance(origin, a, range, context);
    pts.push({
      x: origin.x + Math.cos(a) * nearest,
      y: origin.y + Math.sin(a) * nearest,
    });
  }
  return pts;
}
