import type {
  MapLocationLabel,
  MapOverlayShape,
  MapSpawnMarker,
} from "@/types/catalog";
import {
  transformLocationLabelForHorizontalMidlineFlip,
} from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  isCircleOverlay,
} from "@/lib/map-overlay-geometry";
import { flipPointsOverHorizontalMidline, type ViewBoxRect } from "@/lib/map-path";

/**
 * Same horizontal midline mirror as `path_def` from `path_atk` in the map shape editor.
 * Used when persisting defense-frame copies of overlays/spawns/labels, and as a legacy
 * fallback when `extra_paths_def` was never saved.
 */
export function mirrorAttackFrameLayersToDefFrame(
  vb: ViewBoxRect,
  overlays: MapOverlayShape[],
  spawn_markers: MapSpawnMarker[],
  location_labels: MapLocationLabel[],
): {
  overlays: MapOverlayShape[];
  spawn_markers: MapSpawnMarker[];
  location_labels: MapLocationLabel[];
} {
  const rect = vb;

  const flipOverlay = (s: MapOverlayShape): MapOverlayShape => {
    const gradeSide =
      s.kind === "grade"
        ? ((s.gradeHighSide ?? 1) === 1 ? (-1 as const) : (1 as const))
        : undefined;
    if (isCircleOverlay(s) && s.circle) {
      const c = s.circle;
      const q = flipPointsOverHorizontalMidline(rect, [{ x: c.cx, y: c.cy }])[0]!;
      const nc = { cx: q.x, cy: q.y, r: c.r };
      if (s.kind === "grade") {
        return {
          ...s,
          circle: nc,
          points: circleToGradeClosedPoints(nc),
          gradeHighSide: gradeSide ?? 1,
        };
      }
      return { ...s, circle: nc, points: [] };
    }
    if (s.kind === "rope") {
      const flipped = flipPointsOverHorizontalMidline(rect, s.points);
      const e0 = flipped[0];
      const e1 = flipped[flipped.length - 1];
      return {
        ...s,
        points: flipped,
        ...(e0 && e1 ? { enter: e0, exit: e1 } : {}),
      };
    }
    return {
      ...s,
      points: flipPointsOverHorizontalMidline(rect, s.points),
      ...(s.kind === "grade" && gradeSide !== undefined
        ? { gradeHighSide: gradeSide }
        : {}),
    };
  };

  return {
    overlays: overlays.map(flipOverlay),
    spawn_markers: spawn_markers.map((s) => {
      const q = flipPointsOverHorizontalMidline(rect, [{ x: s.x, y: s.y }])[0]!;
      return { ...s, x: q.x, y: q.y };
    }),
    location_labels: location_labels.map((l) => ({
      ...l,
      ...transformLocationLabelForHorizontalMidlineFlip(rect, rect.width, l),
    })),
  };
}
