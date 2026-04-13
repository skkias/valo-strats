import {
  forwardRayViewBoxTInterval,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import { stratStagePinForDisplay } from "@/lib/strat-stage-coords";
import {
  computeVisionConeRayEnd,
  isVisionOriginInPlayable,
  type VisionLosContext,
} from "@/lib/vision-cone-los";
import type {
  StratPlacedAgent,
  StratSide,
  StratVisionConeWidth,
} from "@/types/strat";

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

/** Center look ray in SVG / strat display space (same frame as `stratStagePinForDisplay`). */
export function stratAgentVisionConeRayInDisplay(args: {
  vb: ViewBoxRect;
  side: StratSide;
  vbWidth: number;
  /** Coach pin scale (`clampCoachMapPinScale(mapPinScale)`), same as wedge rendering. */
  pinS: number;
  agent: StratPlacedAgent;
  width: StratVisionConeWidth;
  visionLosContext: VisionLosContext | null;
}): { pos: MapPoint; rayEnd: MapPoint; dir: MapPoint; lenRay: number } {
  const { vb, side, vbWidth, pinS, agent, width, visionLosContext } = args;
  const pos = stratStagePinForDisplay(vb, side, { x: agent.x, y: agent.y });
  const rot = agent.visionConeRotationDeg ?? 0;
  const rotRad = (rot * Math.PI) / 180;
  const sh = stratAgentVisionConeDisplayHints(
    pos,
    vbWidth,
    width,
    rot,
    pinS,
  );
  const coneMidRange = Math.hypot(sh.hx - pos.x, sh.hy - pos.y) / 0.78;
  const inPlayable =
    visionLosContext != null &&
    isVisionOriginInPlayable(pos, visionLosContext);
  const rayEnd =
    visionLosContext && inPlayable
      ? computeVisionConeRayEnd({
          origin: pos,
          angleRad: rotRad,
          context: visionLosContext,
        })
      : {
          x: pos.x + Math.cos(rotRad) * coneMidRange,
          y: pos.y + Math.sin(rotRad) * coneMidRange,
        };
  let dx = rayEnd.x - pos.x;
  let dy = rayEnd.y - pos.y;
  let lenRay = Math.hypot(dx, dy);
  if (lenRay < 1e-6) {
    dx = Math.cos(rotRad);
    dy = Math.sin(rotRad);
    lenRay = Math.max(vbWidth * 0.08 * pinS, 1e-3);
  }
  const dir = { x: dx / lenRay, y: dy / lenRay };
  return { pos, rayEnd, dir, lenRay };
}

/** Allowed distance along the look ray for the draggable handle (display space). */
export function stratAgentVisionConeHandleAlongBounds(args: {
  vb: ViewBoxRect;
  pos: MapPoint;
  dir: MapPoint;
  lenRay: number;
  vbWidth: number;
  pinS: number;
}): { sNear: number; sFar: number } {
  const { vb, pos, dir, lenRay, vbWidth, pinS } = args;
  const sNear = Math.max(vbWidth * 0.01 * pinS, 2.2 * pinS);
  const boxIv = forwardRayViewBoxTInterval(vb, pos, dir);
  const maxMapT = boxIv ? boxIv.tMax : lenRay;
  const sFar = Math.max(sNear, Math.min(lenRay, maxMapT) - 1e-4);
  return { sNear, sFar };
}
