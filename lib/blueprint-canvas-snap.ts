import type { MapPoint } from "@/lib/map-path";
import {
  BLUEPRINT_CANVAS_SIZE,
  BLUEPRINT_EDITOR_COORD_MAX,
} from "@/lib/agent-ability-blueprint-scale";

export function clampBlueprintPoint(p: MapPoint): MapPoint {
  return {
    x: Math.min(BLUEPRINT_CANVAS_SIZE, Math.max(0, p.x)),
    y: Math.min(BLUEPRINT_CANVAS_SIZE, Math.max(0, p.y)),
  };
}

/** For movement / ricochet “to” handles and other long vectors outside the 1000×1000 canvas. */
export function clampBlueprintPointExtended(p: MapPoint): MapPoint {
  return {
    x: Math.min(BLUEPRINT_EDITOR_COORD_MAX, Math.max(0, p.x)),
    y: Math.min(BLUEPRINT_EDITOR_COORD_MAX, Math.max(0, p.y)),
  };
}

/** Snap to `step` grid in blueprint units; `step <= 0` skips snapping. */
export function snapBlueprintPoint(p: MapPoint, step: number): MapPoint {
  if (!Number.isFinite(step) || step <= 0) return clampBlueprintPoint(p);
  const s = clampBlueprintPoint({
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
  });
  return s;
}

export function snapBlueprintPointExtended(p: MapPoint, step: number): MapPoint {
  if (!Number.isFinite(step) || step <= 0) return clampBlueprintPointExtended(p);
  return clampBlueprintPointExtended({
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
  });
}
