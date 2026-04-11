import type {
  GameMap,
  MapLocationLabel,
  MapOverlayShape,
  MapSpawnMarker,
} from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import {
  transformLocationLabelForHorizontalMidlineFlip,
} from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  isCircleOverlay,
} from "@/lib/map-overlay-geometry";
import {
  flipPointsOverHorizontalMidline,
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
 * across the **horizontal** midline (flip Y): CT toward bottom, T toward top — same
 * relationship as `path_def` vs `path_atk` in the map editor. Left/right (e.g. A vs B
 * east/west) is unchanged.
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

  const midY = rect.minY + rect.height / 2;
  const flipY = (y: number) => 2 * midY - y;

  const flipOverlay = (s: MapOverlayShape): MapOverlayShape => {
    const gradeSide =
      s.kind === "grade"
        ? ((s.gradeHighSide ?? 1) === 1 ? (-1 as const) : (1 as const))
        : undefined;
    if (isCircleOverlay(s) && s.circle) {
      const c = s.circle;
      const nc = { cx: c.cx, cy: flipY(c.cy), r: c.r };
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
    vb,
    overlays: extra.map(flipOverlay),
    spawn_markers: em.spawn_markers.map((s) => ({
      ...s,
      y: flipY(s.y),
    })),
    location_labels: em.location_labels.map((l) => ({
      ...l,
      ...transformLocationLabelForHorizontalMidlineFlip(rect, rect.width, l),
    })),
  };
}
