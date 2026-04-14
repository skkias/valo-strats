import type {
  AgentAbilityBlueprint,
  AgentAbilityGeometry,
  AgentAbilityShapeKind,
  AgentAbilitySlot,
  StratPlacementMode,
} from "@/types/agent-ability";
import {
  normalizePointMarkStyle,
  normalizePointMarkSymbolId,
} from "@/lib/point-blueprint-mark";
import type { MapPoint } from "@/lib/map-path";
import { normalizeAbilityTextureId } from "@/lib/ability-textures";
import { shapeSupportsVisionObstructionModes } from "@/lib/ability-vision-blockers";
import { blueprintSupportsStratAttachToAgent } from "@/lib/strat-blueprint-anchor";
import {
  BLUEPRINT_EDITOR_COORD_MAX,
  BLUEPRINT_GEOMETRY_LENGTH_MAX,
} from "@/lib/agent-ability-blueprint-scale";

const SLOTS: AgentAbilitySlot[] = ["q", "e", "c", "x", "custom"];

const SHAPE_KINDS: AgentAbilityShapeKind[] = [
  "point",
  "circle",
  "ray",
  "cone",
  "vision_cone_narrow",
  "vision_cone_wide",
  "polyline",
  "polygon",
  "rectangle",
  "arc",
  "movement",
  "ricochet",
];

const STRAT_PLACEMENT: ("center" | "origin_direction")[] = [
  "center",
  "origin_direction",
];

const CANVAS = 1000;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(CANVAS, Math.max(0, n));
}

function clampExtendedCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(BLUEPRINT_EDITOR_COORD_MAX, Math.max(0, n));
}

function clampPoint(p: MapPoint): MapPoint {
  return { x: clamp(p.x), y: clamp(p.y) };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSlot(raw: unknown): AgentAbilitySlot {
  return typeof raw === "string" && SLOTS.includes(raw as AgentAbilitySlot)
    ? (raw as AgentAbilitySlot)
    : "q";
}

function normalizeShapeKind(raw: unknown): AgentAbilityShapeKind {
  return typeof raw === "string" &&
    SHAPE_KINDS.includes(raw as AgentAbilityShapeKind)
    ? (raw as AgentAbilityShapeKind)
    : "point";
}

function normalizeColor(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "#a78bfa";
}

function normalizePoints(raw: unknown): MapPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const o = p as Record<string, unknown>;
      const x = typeof o.x === "number" ? clamp(o.x) : Number(o.x);
      const y = typeof o.y === "number" ? clamp(o.y) : Number(o.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return clampPoint({ x, y });
    })
    .filter((p): p is MapPoint => p != null);
}

function normalizeGeometry(
  shapeKind: AgentAbilityShapeKind,
  raw: unknown,
): AgentAbilityGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const k = o.kind;

  if (k === "point" && shapeKind === "point") {
    const x = clamp(Number(o.x));
    const y = clamp(Number(o.y));
    return { kind: "point", x, y };
  }
  if (k === "circle" && shapeKind === "circle") {
    return {
      kind: "circle",
      cx: clamp(Number(o.cx)),
      cy: clamp(Number(o.cy)),
      r: Math.min(
        BLUEPRINT_GEOMETRY_LENGTH_MAX,
        Math.max(1, Number(o.r) || 1),
      ),
    };
  }
  if (k === "ray" && shapeKind === "ray") {
    const cRaw = o.curve;
    const curve =
      cRaw && typeof cRaw === "object"
        ? {
            cx: clampExtendedCoord(
              Number((cRaw as Record<string, unknown>).cx),
            ),
            cy: clampExtendedCoord(
              Number((cRaw as Record<string, unknown>).cy),
            ),
          }
        : undefined;
    const toggleable =
      o.toggleable === true ||
      o.wallState === "down" ||
      o.wallState === "up";
    const mulRaw = o.strokeWidthMul ?? o.stroke_width_mul;
    const strokeWidthMul =
      typeof mulRaw === "number" &&
      Number.isFinite(mulRaw) &&
      mulRaw > 0
        ? Math.min(8, Math.max(0.2, mulRaw))
        : undefined;
    return {
      kind: "ray",
      x1: clampExtendedCoord(Number(o.x1)),
      y1: clampExtendedCoord(Number(o.y1)),
      x2: clampExtendedCoord(Number(o.x2)),
      y2: clampExtendedCoord(Number(o.y2)),
      ...(curve ? { curve } : {}),
      ...(toggleable ? { toggleable: true } : {}),
      ...(strokeWidthMul !== undefined ? { strokeWidthMul } : {}),
    };
  }
  if (
    k === "cone" &&
    (shapeKind === "cone" ||
      shapeKind === "vision_cone_narrow" ||
      shapeKind === "vision_cone_wide")
  ) {
    return {
      kind: "cone",
      ox: clamp(Number(o.ox)),
      oy: clamp(Number(o.oy)),
      lx: clamp(Number(o.lx)),
      ly: clamp(Number(o.ly)),
      rx: clamp(Number(o.rx)),
      ry: clamp(Number(o.ry)),
    };
  }
  if (k === "polyline" && shapeKind === "polyline") {
    const pts = normalizePoints(o.points);
    if (pts.length < 2) return null;
    return { kind: "polyline", points: pts };
  }
  if (k === "polygon" && shapeKind === "polygon") {
    const pts = normalizePoints(o.points);
    if (pts.length < 3) return null;
    return { kind: "polygon", points: pts };
  }
  if (k === "rectangle" && shapeKind === "rectangle") {
    const x = clamp(Number(o.x));
    const y = clamp(Number(o.y));
    const w = Math.min(
      BLUEPRINT_GEOMETRY_LENGTH_MAX,
      Math.max(0, Number(o.w) || 0),
    );
    const h = Math.min(
      BLUEPRINT_GEOMETRY_LENGTH_MAX,
      Math.max(0, Number(o.h) || 0),
    );
    const rotationDeg =
      typeof o.rotationDeg === "number" && Number.isFinite(o.rotationDeg)
        ? o.rotationDeg
        : undefined;
    return { kind: "rectangle", x, y, w, h, rotationDeg };
  }
  if (k === "arc" && shapeKind === "arc") {
    return {
      kind: "arc",
      cx: clamp(Number(o.cx)),
      cy: clamp(Number(o.cy)),
      r: Math.min(
        BLUEPRINT_GEOMETRY_LENGTH_MAX,
        Math.max(1, Number(o.r) || 1),
      ),
      startDeg: Number.isFinite(Number(o.startDeg)) ? Number(o.startDeg) : 0,
      sweepDeg: Number.isFinite(Number(o.sweepDeg)) ? Number(o.sweepDeg) : 90,
    };
  }
  if (k === "movement" && shapeKind === "movement") {
    return {
      kind: "movement",
      ax: clamp(Number(o.ax)),
      ay: clamp(Number(o.ay)),
      bx: clampExtendedCoord(Number(o.bx)),
      by: clampExtendedCoord(Number(o.by)),
    };
  }
  if (k === "ricochet" && shapeKind === "ricochet") {
    const ax = 500;
    const ay = 500;
    const rawAx = Number(o.ax);
    const rawAy = Number(o.ay);
    const rawBx = Number(o.bx);
    const rawBy = Number(o.by);
    const dist = Math.max(
      24,
      Math.min(
        BLUEPRINT_GEOMETRY_LENGTH_MAX,
        Math.hypot(
          Number.isFinite(rawBx) ? rawBx - (Number.isFinite(rawAx) ? rawAx : ax) : 200,
          Number.isFinite(rawBy) ? rawBy - (Number.isFinite(rawAy) ? rawAy : ay) : 0,
        ),
      ),
    );
    return {
      kind: "ricochet",
      ax,
      ay,
      bx: clampExtendedCoord(ax + dist),
      by: ay,
    };
  }
  return null;
}

function defaultGeometry(kind: AgentAbilityShapeKind): AgentAbilityGeometry {
  switch (kind) {
    case "point":
      return { kind: "point", x: 500, y: 500 };
    case "circle":
      return { kind: "circle", cx: 500, cy: 500, r: 80 };
    case "ray":
      return { kind: "ray", x1: 400, y1: 500, x2: 600, y2: 500 };
    case "cone":
      return { kind: "cone", ox: 500, oy: 600, lx: 400, ly: 400, rx: 600, ry: 400 };
    case "vision_cone_narrow":
      return { kind: "cone", ox: 500, oy: 620, lx: 450, ly: 420, rx: 550, ry: 420 };
    case "vision_cone_wide":
      return { kind: "cone", ox: 500, oy: 620, lx: 320, ly: 420, rx: 680, ry: 420 };
    case "polyline":
      return {
        kind: "polyline",
        points: [
          { x: 400, y: 500 },
          { x: 600, y: 500 },
        ],
      };
    case "polygon":
      return {
        kind: "polygon",
        points: [
          { x: 500, y: 400 },
          { x: 400, y: 600 },
          { x: 600, y: 600 },
        ],
      };
    case "rectangle":
      return { kind: "rectangle", x: 420, y: 420, w: 160, h: 120, rotationDeg: 0 };
    case "arc":
      return {
        kind: "arc",
        cx: 500,
        cy: 500,
        r: 120,
        startDeg: -60,
        sweepDeg: 120,
      };
    case "movement":
      return {
        kind: "movement",
        ax: 420,
        ay: 500,
        bx: 580,
        by: 500,
      };
    case "ricochet":
      return {
        kind: "ricochet",
        ax: 500,
        ay: 500,
        bx: 700,
        by: 500,
      };
    default:
      return { kind: "point", x: 500, y: 500 };
  }
}

function normalizeOrigin(
  raw: unknown,
): { x: number; y: number } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const x = clamp(Number(o.x));
  const y = clamp(Number(o.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

function normalizeStratPlacementMode(raw: unknown): StratPlacementMode | undefined {
  return typeof raw === "string" &&
    STRAT_PLACEMENT.includes(raw as StratPlacementMode)
    ? (raw as StratPlacementMode)
    : undefined;
}

function normalizePointIconShow(raw: unknown): boolean | undefined {
  if (raw === false) return false;
  return undefined;
}

function normalizeTextureRadialFromOrigin(raw: unknown): boolean | undefined {
  if (raw === true) return true;
  return undefined;
}

function normalizeBlocksVision(raw: unknown): true | undefined {
  if (raw === true) return true;
  return undefined;
}

function normalizeVisionObstruction(
  raw: unknown,
): "filled" | "hollow" | undefined {
  if (raw === "hollow") return "hollow";
  if (raw === "filled") return "filled";
  return undefined;
}

function normalizePointIconScale(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(3, Math.max(0.12, n));
}

export function normalizeAgentAbilityBlueprint(raw: unknown): AgentAbilityBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  const slot = normalizeSlot(o.slot);
  const name =
    typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Ability";
  const shapeKind = normalizeShapeKind(o.shapeKind ?? o.shape_kind);
  const color = normalizeColor(o.color);
  let geometry = normalizeGeometry(shapeKind, o.geometry);
  if (!geometry) {
    geometry = defaultGeometry(shapeKind);
  }
  const origin = normalizeOrigin(o.origin);
  const stratPlacementMode = normalizeStratPlacementMode(
    o.stratPlacementMode ?? o.strat_placement_mode,
  );
  const pointIconShow = normalizePointIconShow(
    o.pointIconShow ?? o.point_icon_show,
  );
  const pointMarkStyle = normalizePointMarkStyle(
    o.pointMarkStyle ?? o.point_mark_style,
  );
  const pointMarkSymbolId = normalizePointMarkSymbolId(
    o.pointMarkSymbolId ?? o.point_mark_symbol_id,
  );
  const pointIconScale = normalizePointIconScale(
    o.pointIconScale ?? o.point_icon_scale,
  );
  const textureId = normalizeAbilityTextureId(o.textureId ?? o.texture_id);
  const textureRadialFromOrigin = normalizeTextureRadialFromOrigin(
    o.textureRadialFromOrigin ?? o.texture_radial_from_origin,
  );
  const blocksVision = normalizeBlocksVision(
    o.blocksVision ?? o.blocks_vision,
  );
  const visionObstructionIn = normalizeVisionObstruction(
    o.visionObstruction ?? o.vision_obstruction,
  );
  const stratAttachRaw = o.stratAttachToAgent ?? o.strat_attach_to_agent;
  const stratAttachToAgent =
    stratAttachRaw === true &&
    blueprintSupportsStratAttachToAgent(shapeKind)
      ? true
      : undefined;
  const base: AgentAbilityBlueprint = {
    id,
    slot,
    name,
    shapeKind,
    color,
    geometry,
  };
  if (origin) base.origin = origin;
  else if (geometry.kind === "cone") {
    base.origin = { x: geometry.ox, y: geometry.oy };
  }
  if (stratPlacementMode) base.stratPlacementMode = stratPlacementMode;
  if (pointIconShow === false) base.pointIconShow = false;
  if (pointMarkStyle) base.pointMarkStyle = pointMarkStyle;
  if (pointMarkSymbolId) base.pointMarkSymbolId = pointMarkSymbolId;
  if (pointIconScale !== undefined) base.pointIconScale = pointIconScale;
  if (textureId) base.textureId = textureId;
  if (textureRadialFromOrigin === true) {
    base.textureRadialFromOrigin = true;
  }
  if (blocksVision === true) {
    base.blocksVision = true;
    if (
      shapeSupportsVisionObstructionModes(shapeKind) &&
      visionObstructionIn === "hollow"
    ) {
      base.visionObstruction = "hollow";
    }
  }
  if (stratAttachToAgent === true) base.stratAttachToAgent = true;
  return base;
}

export function normalizeAgentAbilitiesBlueprint(raw: unknown): AgentAbilityBlueprint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeAgentAbilityBlueprint)
    .filter((x): x is AgentAbilityBlueprint => x != null);
}
