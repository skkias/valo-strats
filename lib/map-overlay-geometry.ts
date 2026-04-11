import type { MapOverlayCircle, MapOverlayShape } from "@/types/catalog";
import {
  flipPointsOverHorizontalMidline,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import {
  clampPointInsidePlayableRegion,
  clampPointsToOutline,
  pointInOutlineWithHoles,
} from "@/lib/polygon-contains";

export const OVERLAY_CIRCLE_SEGMENTS = 64;

export function circleToPolygon(
  c: MapOverlayCircle,
  segments: number = OVERLAY_CIRCLE_SEGMENTS,
): MapPoint[] {
  const { cx, cy, r } = c;
  if (!(r > 0) || !Number.isFinite(cx) || !Number.isFinite(cy)) return [];
  const pts: MapPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Closed polyline for grade (includes closing segment p[last]→p[0]). */
export function circleToGradeClosedPoints(c: MapOverlayCircle): MapPoint[] {
  const ring = circleToPolygon(c, OVERLAY_CIRCLE_SEGMENTS);
  if (ring.length === 0) return [];
  return [...ring, ring[0]!];
}

export function isCircleOverlay(sh: MapOverlayShape): boolean {
  const c = sh.circle;
  return c != null && c.r > 0 && Number.isFinite(c.cx) && Number.isFinite(c.cy);
}

export function clampCircleInPlayableRegion(
  c: MapOverlayCircle,
  outer: MapPoint[],
  holes: MapPoint[][],
): MapOverlayCircle {
  if (outer.length < 3) return c;
  let { cx, cy, r } = c;
  if (!(r > 0)) return c;
  const center = clampPointInsidePlayableRegion({ x: cx, y: cy }, outer, holes);
  cx = center.x;
  cy = center.y;
  let lo = 0;
  let hi = Math.max(r, 1e-9);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const ring = circleToPolygon({ cx, cy, r: mid }, 32);
    const ok = ring.every((p) =>
      pointInOutlineWithHoles(p, outer, holes),
    );
    if (ok) lo = mid;
    else hi = mid;
  }
  return { cx, cy, r: lo };
}

export function sanitizeOverlayForSave(
  s: MapOverlayShape,
  outer: MapPoint[],
  holes: MapPoint[][],
): MapOverlayShape {
  if (isCircleOverlay(s)) {
    const c = clampCircleInPlayableRegion(s.circle!, outer, holes);
    if (s.kind === "grade") {
      return {
        ...s,
        circle: c,
        points: circleToGradeClosedPoints(c),
      };
    }
    return { ...s, circle: c, points: [] };
  }
  const clamped = clampPointsToOutline(s.points, outer, holes);
  return { ...s, points: clamped, circle: null };
}

/**
 * Horizontal mirror of an overlay for defense-side preview (matches `path_def` vs attack).
 * Grade high-side is toggled so spikes stay on the correct flank after mirroring.
 */
export function mirrorOverlayForDefensePreview(
  vb: ViewBoxRect,
  sh: MapOverlayShape,
): MapOverlayShape {
  const flipSide =
    sh.kind === "grade"
      ? (((sh.gradeHighSide ?? 1) === 1 ? -1 : 1) as 1 | -1)
      : undefined;
  if (isCircleOverlay(sh) && sh.circle) {
    const q = flipPointsOverHorizontalMidline(vb, [
      { x: sh.circle.cx, y: sh.circle.cy },
    ])[0]!;
    const nc = { cx: q.x, cy: q.y, r: sh.circle.r };
    if (sh.kind === "grade") {
      return {
        ...sh,
        circle: nc,
        points: circleToGradeClosedPoints(nc),
        gradeHighSide: flipSide,
      };
    }
    return { ...sh, circle: nc, points: [] };
  }
  const pts = flipPointsOverHorizontalMidline(vb, sh.points);
  if (sh.kind === "grade") {
    return { ...sh, points: pts, gradeHighSide: flipSide };
  }
  return { ...sh, points: pts };
}
