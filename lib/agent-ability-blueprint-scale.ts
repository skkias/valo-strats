import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import {
  blueprintBoundsCenterAndSpan,
  blueprintGeometryBounds,
} from "@/lib/strat-ability-blueprint-bounds";

/** Normalized blueprint drawing canvas (matches `types/agent-ability` docs). */
export const BLUEPRINT_CANVAS_SIZE = 1000;

/**
 * The **1000×1000 blueprint canvas** spans this fraction of the strat map viewBox
 * width when rendered. Individual shapes keep their size **in blueprint units** — e.g.
 * doubling radius doubles diameter on the map (linear scale).
 */
export const STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO = 0.22;

export function stratBlueprintTargetSpanForMap(vbWidth: number): number {
  return vbWidth * STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO;
}

/**
 * Map user units per one blueprint user unit: the full canvas edge (1000) maps to
 * `STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO × vbWidth`.
 */
export function stratBlueprintUnitsToMapScale(vbWidth: number): number {
  return stratBlueprintTargetSpanForMap(vbWidth) / BLUEPRINT_CANVAS_SIZE;
}

/** @deprecated Use {@link stratBlueprintUnitsToMapScale} — scale no longer depends on bbox. */
export function stratBlueprintUniformScale(
  _blueprint: AgentAbilityBlueprint,
  vbWidth: number,
): number {
  return stratBlueprintUnitsToMapScale(vbWidth);
}

export function blueprintStratSizingReadout(blueprint: AgentAbilityBlueprint): {
  bboxMaxSide: number;
  targetPercentOfMapWidth: number;
} {
  const bounds = blueprintGeometryBounds(blueprint.geometry);
  const { span } = blueprintBoundsCenterAndSpan(bounds);
  return {
    bboxMaxSide: span,
    targetPercentOfMapWidth: STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO * 100,
  };
}
