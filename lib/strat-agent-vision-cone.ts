import type { StratVisionConeWidth } from "@/types/strat";

/** Half-angle (degrees) for the wide agent-attached vision cone. */
export const STRAT_AGENT_VISION_CONE_WIDE_HALF_DEG = 52;
/**
 * Half-angle for the thin cone (~50% narrower than the previous 28° half-angle).
 */
export const STRAT_AGENT_VISION_CONE_THIN_HALF_DEG = 14;

export function stratAgentVisionConeHalfDeg(width: StratVisionConeWidth): number {
  return width === "wide"
    ? STRAT_AGENT_VISION_CONE_WIDE_HALF_DEG
    : STRAT_AGENT_VISION_CONE_THIN_HALF_DEG;
}

/** Display-space wedge hints for LOS + handles (origin = agent pin position). */
export function stratAgentVisionConeDisplayHints(
  origin: { x: number; y: number },
  vbWidth: number,
  width: StratVisionConeWidth,
  rotationDeg: number,
  scale = 1,
): {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  hx: number;
  hy: number;
} {
  const len = vbWidth * (width === "wide" ? 0.13 : 0.16) * scale;
  const halfDeg = stratAgentVisionConeHalfDeg(width);
  const base = (rotationDeg * Math.PI) / 180;
  const left = base + (halfDeg * Math.PI) / 180;
  const right = base - (halfDeg * Math.PI) / 180;
  const lx = origin.x + Math.cos(left) * len;
  const ly = origin.y + Math.sin(left) * len;
  const rx = origin.x + Math.cos(right) * len;
  const ry = origin.y + Math.sin(right) * len;
  const handleDist = len * 0.78;
  const hx = origin.x + Math.cos(base) * handleDist;
  const hy = origin.y + Math.sin(base) * handleDist;
  return { lx, ly, rx, ry, hx, hy };
}
