import type { MapPoint } from "@/lib/map-path";
import { BLUEPRINT_CANVAS_SIZE } from "@/lib/agent-ability-blueprint-scale";

export function clampBlueprintPoint(p: MapPoint): MapPoint {
  return {
    x: Math.min(BLUEPRINT_CANVAS_SIZE, Math.max(0, p.x)),
    y: Math.min(BLUEPRINT_CANVAS_SIZE, Math.max(0, p.y)),
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
