import type {
  AgentAbilityBlueprint,
  AgentAbilityShapeKind,
  StratPlacementMode,
} from "@/types/agent-ability";
import {
  blueprintBoundsCenterAndSpan,
  blueprintGeometryBounds,
} from "@/lib/strat-ability-blueprint-bounds";

/** Strat map anchor in blueprint canvas space (defaults to geometry bbox center). */
export function blueprintStratAnchor(
  blueprint: AgentAbilityBlueprint,
): { x: number; y: number } {
  const o = blueprint.origin;
  if (
    o &&
    typeof o.x === "number" &&
    typeof o.y === "number" &&
    Number.isFinite(o.x) &&
    Number.isFinite(o.y)
  ) {
    return { x: o.x, y: o.y };
  }
  const bounds = blueprintGeometryBounds(blueprint.geometry);
  const { cx, cy } = blueprintBoundsCenterAndSpan(bounds);
  return { x: cx, y: cy };
}

export function defaultStratPlacementForShape(
  kind: AgentAbilityShapeKind,
): StratPlacementMode {
  switch (kind) {
    case "rectangle":
    case "arc":
    case "polyline":
    case "polygon":
    case "movement":
    case "cone":
    case "vision_cone_narrow":
    case "vision_cone_wide":
    case "ray":
      return "origin_direction";
    default:
      return "center";
  }
}

export function effectiveStratPlacementMode(
  blueprint: AgentAbilityBlueprint,
): StratPlacementMode {
  return (
    blueprint.stratPlacementMode ??
    defaultStratPlacementForShape(blueprint.shapeKind)
  );
}

/** Shapes that can use {@link AgentAbilityBlueprint.stratAttachToAgent} on the strat map. */
export function blueprintSupportsStratAttachToAgent(
  shapeKind: AgentAbilityShapeKind,
): boolean {
  switch (shapeKind) {
    case "rectangle":
    case "arc":
    case "cone":
    case "circle":
    case "polygon":
    case "polyline":
    case "ray":
    case "vision_cone_narrow":
    case "vision_cone_wide":
    case "point":
      return true;
    default:
      return false;
  }
}

export function effectiveStratAttachToAgent(
  blueprint: AgentAbilityBlueprint,
): boolean {
  return (
    blueprint.stratAttachToAgent === true &&
    blueprintSupportsStratAttachToAgent(blueprint.shapeKind)
  );
}
