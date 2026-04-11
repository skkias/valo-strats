import type {
  GameMap,
  MapLocationLabel,
  MapOverlayShape,
  MapSpawnMarker,
} from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import {
  transformLocationLabelForVerticalMidlineFlip,
} from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  isCircleOverlay,
} from "@/lib/map-overlay-geometry";
import {
  flipPointsOverVerticalMidline,
  type ViewBoxRect,
} from "@/lib/map-path";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import { parseViewBox } from "@/lib/view-box";

export function viewBoxRectFromMap(map: GameMap): ViewBoxRect {
  const p = parseViewBox(map.view_box);
  return { minX: p.minX, minY: p.minY, width: p.width, height: p.height };
}

/**
 * Map data is stored in attack-side viewBox coordinates. For defense strats, mirror
 * across the **vertical** midline (reflection over the y-axis / flip X): B and A swap
 * east–west so B sits on the right, matching common defense callout orientation.
 * Top/bottom (T vs CT) is unchanged for spawns on the vertical centerline.
 */
export function stratMapDisplayData(
  map: GameMap,
  side: StratSide,
): {
  vb: ViewBoxRect;
  overlays: MapOverlayShape[];
  spawn_markers: MapSpawnMarker[];
  location_labels: MapLocationLabel[];
} {
  const em = normalizeEditorMeta(map.editor_meta);
  const vb = viewBoxRectFromMap(map);
  const rect = vb;
  const extra = map.extra_paths ?? [];

  if (side === "atk") {
    return {
      vb,
      overlays: extra,
      spawn_markers: em.spawn_markers,
      location_labels: em.location_labels,
    };
  }

  const midX = rect.minX + rect.width / 2;
  const flipX = (x: number) => 2 * midX - x;

  const flipOverlay = (s: MapOverlayShape): MapOverlayShape => {
    const gradeSide =
      s.kind === "grade"
        ? ((s.gradeHighSide ?? 1) === 1 ? (-1 as const) : (1 as const))
        : undefined;
    if (isCircleOverlay(s) && s.circle) {
      const c = s.circle;
      const nc = { cx: flipX(c.cx), cy: c.cy, r: c.r };
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
      const flipped = flipPointsOverVerticalMidline(rect, s.points);
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
      points: flipPointsOverVerticalMidline(rect, s.points),
      ...(s.kind === "grade" && gradeSide !== undefined
        ? { gradeHighSide: gradeSide }
        : {}),
    };
  };

  return {
    vb,
    overlays: extra.map(flipOverlay),
    spawn_markers: em.spawn_markers.map((s) => ({
      ...s,
      x: flipX(s.x),
    })),
    location_labels: em.location_labels.map((l) => ({
      ...l,
      ...transformLocationLabelForVerticalMidlineFlip(rect, rect.width, l),
    })),
  };
}
