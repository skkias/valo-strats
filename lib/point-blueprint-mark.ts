import type {
  AgentAbilityBlueprint,
  PointMarkStyle,
  PointMarkSymbolId,
} from "@/types/agent-ability";
import { POINT_MARK_SYMBOL_IDS } from "@/types/agent-ability";

export const POINT_MARK_SYMBOL_LABELS: Record<PointMarkSymbolId, string> = {
  crosshair: "Crosshair",
  diamond: "Diamond",
  pin: "Map pin",
  star: "Star",
  bolt: "Bolt",
  square: "Square",
  triangle: "Triangle",
  plus_ring: "Plus in ring",
};

export function effectivePointMarkStyle(
  b: Pick<AgentAbilityBlueprint, "pointMarkStyle" | "pointIconShow">,
): PointMarkStyle {
  if (b.pointMarkStyle) return b.pointMarkStyle;
  if (b.pointIconShow === false) return "dot";
  return "ability_icon";
}

/** Strat map + blueprint editor: opacity multiplier for point markers (default full). */
export function effectivePointColorIntensity(
  b: Pick<AgentAbilityBlueprint, "pointColorIntensity">,
): number {
  const n = b.pointColorIntensity;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0.15, n));
}

export function effectivePointMarkSymbolId(
  b: Pick<AgentAbilityBlueprint, "pointMarkSymbolId">,
): PointMarkSymbolId {
  const id = b.pointMarkSymbolId;
  if (id && (POINT_MARK_SYMBOL_IDS as readonly string[]).includes(id)) {
    return id;
  }
  return "crosshair";
}

export function normalizePointMarkStyle(raw: unknown): PointMarkStyle | undefined {
  if (raw === "ability_icon" || raw === "dot" || raw === "symbol") return raw;
  return undefined;
}

export function normalizePointMarkSymbolId(
  raw: unknown,
): PointMarkSymbolId | undefined {
  if (typeof raw !== "string") return undefined;
  return (POINT_MARK_SYMBOL_IDS as readonly string[]).includes(raw)
    ? (raw as PointMarkSymbolId)
    : undefined;
}
