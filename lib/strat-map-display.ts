import type {
  GameMap,
  MapLocationLabel,
  MapOverlayShape,
  MapSpawnMarker,
} from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import { transformLocationLabelForViewBoxCenterFlip } from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  isCircleOverlay,
} from "@/lib/map-overlay-geometry";
import {
  flipPointsThroughViewBoxCenter,
  type ViewBoxRect,
} from "@/lib/map-path";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import { stratSideDisplayFlip } from "@/lib/strat-side-display-geometry";
import { parseViewBox } from "@/lib/view-box";

export function viewBoxRectFromMap(map: GameMap): ViewBoxRect {
  const p = parseViewBox(map.view_box);
  return { minX: p.minX, minY: p.minY, width: p.width, height: p.height };
}

/**
 * Map data is stored in attack-side viewBox coordinates. Whenever the strat side is the
 * mirrored one (see {@link stratSideDisplayFlip}), apply the same 180° flip as MapShapeEditor
 * “Swap sides” — for both normal defense and invert-meaning attack (e.g. Split).
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
  const flipMode = stratSideDisplayFlip(map, side);

  if (flipMode === "none") {
    return {
      vb,
      overlays: extra,
      spawn_markers: em.spawn_markers,
      location_labels: em.location_labels,
    };
  }

  const flipOverlay = (s: MapOverlayShape): MapOverlayShape => {
    const gradeSide =
      s.kind === "grade"
        ? ((s.gradeHighSide ?? 1) === 1 ? (-1 as const) : (1 as const))
        : undefined;
    if (isCircleOverlay(s) && s.circle) {
      const c = s.circle;
      const q = flipPointsThroughViewBoxCenter(rect, [{ x: c.cx, y: c.cy }])[0]!;
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
      const flipped = flipPointsThroughViewBoxCenter(rect, s.points);
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
      points: flipPointsThroughViewBoxCenter(rect, s.points),
      ...(s.kind === "grade" && gradeSide !== undefined
        ? { gradeHighSide: gradeSide }
        : {}),
    };
  };

  return {
    vb,
    overlays: extra.map(flipOverlay),
    spawn_markers: em.spawn_markers.map((s) => {
      const q = flipPointsThroughViewBoxCenter(rect, [{ x: s.x, y: s.y }])[0]!;
      return { ...s, x: q.x, y: q.y };
    }),
    location_labels: em.location_labels.map((l) => ({
      ...l,
      ...transformLocationLabelForViewBoxCenterFlip(rect, rect.width, l, {
        collapseReadableRotation: false,
      }),
    })),
  };
}
