import type {
  GameMap,
  MapLocationLabel,
  MapOverlayShape,
  MapSpawnMarker,
} from "@/types/catalog";
import type { StratSide } from "@/types/strat";
import { mirrorAttackFrameLayersToDefFrame } from "@/lib/map-def-frame-layers";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import { normalizeExtraPaths } from "@/lib/map-extra-paths";
import { stratUsesAttackEditorFrame } from "@/lib/map-strat-side";
import { parseViewBox } from "@/lib/view-box";
import type { ViewBoxRect } from "@/lib/map-path";

export function viewBoxRectFromMap(map: GameMap): ViewBoxRect {
  const p = parseViewBox(map.view_box);
  return { minX: p.minX, minY: p.minY, width: p.width, height: p.height };
}

/**
 * Overlays/spawns/labels for the strat map: attack-side storage as edited in the map
 * shape editor, or persisted defense-frame copies (no runtime flip — legacy rows without
 * `extra_paths_def` mirror once from attack data).
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
  const extra = map.extra_paths ?? [];

  if (stratUsesAttackEditorFrame(map, side)) {
    return {
      vb,
      overlays: extra,
      spawn_markers: em.spawn_markers,
      location_labels: em.location_labels,
    };
  }

  const defStored = map.extra_paths_def;
  if (defStored == null) {
    return {
      vb,
      ...mirrorAttackFrameLayersToDefFrame(vb, extra, em.spawn_markers, em.location_labels),
    };
  }

  return {
    vb,
    overlays: normalizeExtraPaths(defStored),
    spawn_markers: em.spawn_markers_def,
    location_labels: em.location_labels_def,
  };
}
