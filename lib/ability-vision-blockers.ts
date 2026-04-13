import type { Agent } from "@/types/catalog";
import type {
  AgentAbilityBlueprint,
  AgentAbilityGeometry,
  AgentAbilityShapeKind,
} from "@/types/agent-ability";
import type {
  StratPlacedAbility,
  StratPlacedAgent,
  StratSide,
} from "@/types/strat";
import { resolvedPlacedAbilityStoredPosition } from "@/lib/strat-placed-ability-position";
import type { MapPoint, ViewBoxRect } from "@/lib/map-path";
import { blueprintPointToStratMapDisplay } from "@/lib/strat-blueprint-map-point";
import { stratAnchorOverrideForBlueprint } from "@/lib/strat-blueprint-map-point";
import { agentBlueprintForSlot } from "@/lib/strat-ability-blueprint-lookup";
import { stratStagePinForDisplay } from "@/lib/strat-stage-coords";
import type { VisionLosContext } from "@/lib/vision-cone-los";

const CIRCLE_SEGMENTS = 56;
const ARC_STEPS = 36;

/** Shapes that support filled vs hollow vision obstruction modes. */
export const VISION_ENCLOSED_SHAPE_KINDS: ReadonlySet<AgentAbilityShapeKind> =
  new Set([
    "circle",
    "polygon",
    "rectangle",
    "arc",
    "cone",
    "vision_cone_narrow",
    "vision_cone_wide",
  ]);

export function shapeSupportsVisionObstructionModes(
  kind: AgentAbilityShapeKind,
): boolean {
  return VISION_ENCLOSED_SHAPE_KINDS.has(kind);
}

export type VisionBlockerSegment = { a: MapPoint; b: MapPoint };

function rotateAround(
  p: MapPoint,
  cx: number,
  cy: number,
  deg: number,
): MapPoint {
  const rad = (deg * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function rectBlueprintCorners(g: Extract<AgentAbilityGeometry, { kind: "rectangle" }>): MapPoint[] {
  const pts: MapPoint[] = [
    { x: g.x, y: g.y },
    { x: g.x + g.w, y: g.y },
    { x: g.x + g.w, y: g.y + g.h },
    { x: g.x, y: g.y + g.h },
  ];
  const rd = g.rotationDeg ?? 0;
  if (rd === 0) return pts;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  return pts.map((p) => rotateAround(p, cx, cy, rd));
}

function arcSectorPolygon(g: Extract<AgentAbilityGeometry, { kind: "arc" }>): MapPoint[] {
  const rad = (d: number) => (d * Math.PI) / 180;
  const { cx, cy, r, startDeg, sweepDeg } = g;
  const pts: MapPoint[] = [{ x: cx, y: cy }];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const ang = startDeg + (sweepDeg * i) / ARC_STEPS;
    const a = rad(ang);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function mapPt(
  p: MapPoint,
  bp: AgentAbilityBlueprint,
  mapX: number,
  mapY: number,
  effectiveVbWidth: number,
  rotationDeg: number,
): MapPoint {
  const stratOv = stratAnchorOverrideForBlueprint(bp);
  return blueprintPointToStratMapDisplay(
    p,
    bp,
    mapX,
    mapY,
    effectiveVbWidth,
    rotationDeg,
    stratOv,
  );
}

function mapRing(
  blueprint: AgentAbilityBlueprint,
  blueprintPoints: MapPoint[],
  mapX: number,
  mapY: number,
  effectiveVbWidth: number,
  rotationDeg: number,
): MapPoint[] {
  return blueprintPoints.map((p) =>
    mapPt(p, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg),
  );
}

export type AbilityVisionBlockerDelta = {
  filledPolygons: MapPoint[][];
  hollowRings: MapPoint[][];
  openSegments: VisionBlockerSegment[];
};

/**
 * Map-space vision blockers for one placed ability instance.
 */
export function abilityVisionBlockersOnMap(
  blueprint: AgentAbilityBlueprint,
  mapX: number,
  mapY: number,
  effectiveVbWidth: number,
  rotationDeg: number,
): AbilityVisionBlockerDelta {
  const filledPolygons: MapPoint[][] = [];
  const hollowRings: MapPoint[][] = [];
  const openSegments: VisionBlockerSegment[] = [];
  if (blueprint.blocksVision !== true) {
    return { filledPolygons, hollowRings, openSegments };
  }

  const enc = shapeSupportsVisionObstructionModes(blueprint.shapeKind);
  const mode = blueprint.visionObstruction === "hollow" ? "hollow" : "filled";
  const useHollow = enc && mode === "hollow";

  const g = blueprint.geometry;

  const pushClosedRing = (bpPts: MapPoint[]) => {
    if (bpPts.length < 3) return;
    const ring = mapRing(blueprint, bpPts, mapX, mapY, effectiveVbWidth, rotationDeg);
    if (ring.length >= 3) {
      if (useHollow) hollowRings.push(ring);
      else filledPolygons.push(ring);
    }
  };

  const pushOpenChain = (bpPts: MapPoint[]) => {
    for (let i = 0; i + 1 < bpPts.length; i++) {
      const a = mapPt(bpPts[i]!, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg);
      const b = mapPt(bpPts[i + 1]!, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg);
      openSegments.push({ a, b });
    }
  };

  switch (g.kind) {
    case "point":
      break;
    case "circle": {
      const bpRing: MapPoint[] = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const ang = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        bpRing.push({
          x: g.cx + g.r * Math.cos(ang),
          y: g.cy + g.r * Math.sin(ang),
        });
      }
      pushClosedRing(bpRing);
      break;
    }
    case "polygon":
      pushClosedRing(g.points);
      break;
    case "rectangle":
      pushClosedRing(rectBlueprintCorners(g));
      break;
    case "arc":
      pushClosedRing(arcSectorPolygon(g));
      break;
    case "cone":
      pushClosedRing([
        { x: g.ox, y: g.oy },
        { x: g.lx, y: g.ly },
        { x: g.rx, y: g.ry },
      ]);
      break;
    case "ray":
      openSegments.push({
        a: mapPt({ x: g.x1, y: g.y1 }, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg),
        b: mapPt({ x: g.x2, y: g.y2 }, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg),
      });
      break;
    case "polyline":
      pushOpenChain(g.points);
      break;
    case "movement":
      openSegments.push({
        a: mapPt({ x: g.ax, y: g.ay }, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg),
        b: mapPt({ x: g.bx, y: g.by }, blueprint, mapX, mapY, effectiveVbWidth, rotationDeg),
      });
      break;
    default:
      break;
  }

  return { filledPolygons, hollowRings, openSegments };
}

export function appendPlacedAbilitiesVisionBlockers(
  ctx: VisionLosContext,
  input: {
    placedAbilities: StratPlacedAbility[];
    /** Stage agent tokens (for abilities with `attachedToAgentId`). */
    stageAgents: StratPlacedAgent[];
    agentsCatalog: Agent[];
    vb: ViewBoxRect;
    side: StratSide;
    vbWidth: number;
    mapPinScale?: number;
    excludePlacedAbilityId?: string;
  },
): VisionLosContext {
  const pinS =
    input.mapPinScale != null && Number.isFinite(input.mapPinScale)
      ? input.mapPinScale
      : 1;
  const effectiveVbWidth = input.vbWidth * pinS;

  const filled = [...ctx.filledBlockerPolygons];
  const hollow = [...ctx.hollowBlockerRings];
  const open = [...ctx.openBlockerSegments];

  for (const ab of input.placedAbilities) {
    if (input.excludePlacedAbilityId && ab.id === input.excludePlacedAbilityId) {
      continue;
    }
    const bp = agentBlueprintForSlot(
      input.agentsCatalog,
      ab.agentSlug,
      ab.slot,
    );
    if (!bp || bp.blocksVision !== true) continue;

    const st = resolvedPlacedAbilityStoredPosition(ab, input.stageAgents);
    const pos = stratStagePinForDisplay(input.vb, input.side, {
      x: st.x,
      y: st.y,
    });
    const delta = abilityVisionBlockersOnMap(
      bp,
      pos.x,
      pos.y,
      effectiveVbWidth,
      ab.rotationDeg ?? 0,
    );
    filled.push(...delta.filledPolygons);
    hollow.push(...delta.hollowRings);
    open.push(...delta.openSegments);
  }

  return {
    ...ctx,
    filledBlockerPolygons: filled,
    hollowBlockerRings: hollow,
    openBlockerSegments: open,
  };
}
