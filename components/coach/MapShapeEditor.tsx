"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type {
  GameMap,
  MapEditorMeta,
  MapFloorId,
  MapImageTransform,
  MapLabelTextAnchor,
  MapLocationLabel,
  MapLocationLabelStyle,
  MapOverlayCircle,
  MapOverlayKind,
  MapOverlayShape,
} from "@/types/catalog";
import { defaultMapTransform } from "@/lib/map-transform";
import { parseViewBox } from "@/lib/view-box";
import {
  alignPointsHorizontal,
  alignPointsVertical,
  closedDefenseHoleRingsFromAttack,
  defenseRingsFromAttack,
  flipPointsThroughViewBoxCenter,
  ringsToPathD,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import {
  mapLabelTextSvgProps,
  transformLocationLabelForViewBoxCenterFlip,
} from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  circleToPolygon,
  clampCircleInPlayableRegion,
  isCircleOverlay,
  OVERLAY_CIRCLE_SEGMENTS,
  sanitizeOverlayForSave,
} from "@/lib/map-overlay-geometry";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import { normalizeExtraPaths } from "@/lib/map-extra-paths";
import {
  clampPointsToOutline,
  clampSegmentToOutlineRegion,
  pointInOutlineWithHoles,
} from "@/lib/polygon-contains";
import {
  closestEdgeWithinDistance,
  insertPointOnEdge,
} from "@/lib/point-segment";
import { uploadMapReferenceImageAction } from "@/app/coach/map-actions";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpFromLine,
  ArrowDownUp,
  BoxSelect,
  BrickWall,
  CheckCircle2,
  ChevronRight,
  Circle as CircleIcon,
  CircleSlash2,
  DoorClosed,
  DoorOpen,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Hammer,
  ImagePlus,
  Layers,
  Loader2,
  MapPin,
  Mountain,
  Move,
  Octagon,
  Pencil,
  Plus,
  Save,
  Shield,
  Swords,
  Target,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";

const LABEL_ANCHOR_OPTIONS: ReadonlyArray<{
  value: MapLabelTextAnchor;
  title: string;
  Icon: typeof ArrowUp;
}> = [
  { value: "top", title: "Text above point", Icon: ArrowUp },
  { value: "right", title: "Text to the right", Icon: ArrowRight },
  { value: "bottom", title: "Text below point", Icon: ArrowDown },
  { value: "left", title: "Text to the left", Icon: ArrowLeft },
];

/** SVG `rotate(deg)` clockwise; ±90° for vertical hallways. */
const LABEL_ROTATION_PRESETS: ReadonlyArray<{ deg: number; short: string }> = [
  { deg: 0, short: "0°" },
  { deg: 90, short: "90°" },
  { deg: -90, short: "−90°" },
  { deg: 180, short: "180°" },
];

function overlayFloor(sh: MapOverlayShape): MapFloorId {
  return sh.floor === "upper" ? "upper" : "lower";
}

type Tool = "draw" | "edit";

type EditorSidebarTab = "map-shape" | "objects" | "annotation";

type ActiveLayer =
  | { kind: "outline"; holeIndex: number | null }
  | { kind: "overlay"; id: string };

type Selection =
  | { kind: "outline"; holeIndex: number | null; indices: number[] }
  | { kind: "overlay"; shapeId: string; indices: number[] }
  | null;

type DragState = {
  pointerId: number;
  startSvg: MapPoint;
  snapshot: MapPoint[];
  layer: ActiveLayer;
  indices: number[];
  /** Overlay circle edit (center vs rim handle). */
  overlayCircleSnapshot?: MapOverlayCircle;
};

/** Visible window into canvas space (does not change saved coordinates). */
type ViewRect = { minX: number; minY: number; width: number; height: number };

type PanDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startView: ViewRect;
  /** Canvas user-units per CSS pixel, captured once at pointer down (avoids viewBox / CTM drift while panning). */
  userPerPxX: number;
  userPerPxY: number;
};

type AnnotationDragState = {
  pointerId: number;
  kind: "spawn" | "label";
  id: string;
  startSvg: MapPoint;
  startX: number;
  startY: number;
};

type PlaceAnnotationMode = "none" | "spawn-atk" | "spawn-def" | "label";

/** Polygon vertex-by-vertex vs two-click circle (outline rings + overlays). */
type DrawShapeMode = "polygon" | "circle";

/** Map canvas panel: grow with layout but cap on huge viewports (e.g. 4K @ 150%). */
const MAP_VIEWPORT_MIN_W_PX = 280;
const MAP_VIEWPORT_MIN_H_PX = 200;
const MAP_VIEWPORT_MAX_W_PX = 2400;
const MAP_VIEWPORT_MAX_H_PX = 1680;
const MAP_VIEWPORT_MAX_DVH = 90;

/** Target on-screen size (px) for vertex handles; scales in user units when viewBox zooms. */
const VERTEX_HANDLE_SCREEN_PX = 8;
const VERTEX_STROKE_SCREEN_PX = 1.35;
const PASSIVE_VERTEX_SCREEN_PX = 4.5;
const PASSIVE_STROKE_SCREEN_PX = 1;

/** Attacker (red) vs defender (saturated blue) — symmetric white stroke for contrast on the map. */
const SPAWN_ATK_FILL = "#ff3e3e";
const SPAWN_ATK_STROKE = "#ffffff";
const SPAWN_DEF_FILL = "#2563eb";
const SPAWN_DEF_STROKE = "#ffffff";

/** Breakable doorway polylines — emerald (vs orange lower walkable, red site, cyan grade, indigo toggle). */
const BREAKABLE_DOORWAY_STROKE = "rgb(16, 185, 129)";
const BREAKABLE_DOORWAY_STROKE_HI = "rgb(167, 243, 208)";
const BREAKABLE_DOORWAY_VERTEX = "rgb(52, 211, 153)";

/**
 * Elevation walkable polygons: lower ≈ ground (“hell”), upper ≈ raised (“heaven”).
 * Warm ember/stone vs cool sky reads clearly when both stack on one minimap.
 */
const WALKABLE_LOWER_FILL = "rgba(120,53,18,0.22)";
const WALKABLE_LOWER_STROKE = "rgb(234,88,12)";
const WALKABLE_LOWER_HOVER_FILL = "rgba(251,146,60,0.44)";
const WALKABLE_LOWER_HOVER_STROKE = "rgb(254,215,170)";
const WALKABLE_LOWER_PASSIVE = "rgba(234,88,12,0.52)";
const WALKABLE_LOWER_PASSIVE_HOVER = "rgba(254,215,170,0.96)";
const WALKABLE_LOWER_VERTEX = "rgb(251,146,60)";

const WALKABLE_UPPER_FILL = "rgba(14,165,233,0.24)";
const WALKABLE_UPPER_STROKE = "rgb(56,189,248)";
const WALKABLE_UPPER_HOVER_FILL = "rgba(125,211,252,0.48)";
const WALKABLE_UPPER_HOVER_STROKE = "rgb(224,242,254)";
const WALKABLE_UPPER_PASSIVE = "rgba(56,189,248,0.52)";
const WALKABLE_UPPER_PASSIVE_HOVER = "rgba(186,230,253,0.97)";
const WALKABLE_UPPER_VERTEX = "rgb(125,211,252)";

function walkableElevationPolygonStyle(
  floor: MapFloorId,
): { fill: string; stroke: string } {
  return floor === "upper"
    ? { fill: WALKABLE_UPPER_FILL, stroke: WALKABLE_UPPER_STROKE }
    : { fill: WALKABLE_LOWER_FILL, stroke: WALKABLE_LOWER_STROKE };
}

function walkableElevationPolygonHoverStyle(
  floor: MapFloorId,
): { fill: string; stroke: string } {
  return floor === "upper"
    ? {
        fill: WALKABLE_UPPER_HOVER_FILL,
        stroke: WALKABLE_UPPER_HOVER_STROKE,
      }
    : {
        fill: WALKABLE_LOWER_HOVER_FILL,
        stroke: WALKABLE_LOWER_HOVER_STROKE,
      };
}

function previewOpenOrClosed(points: MapPoint[]): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  const [p0, ...rest] = points;
  const parts = [`M ${p0.x} ${p0.y}`];
  for (const p of rest) parts.push(`L ${p.x} ${p.y}`);
  if (points.length >= 3) parts.push("Z");
  return parts.join(" ");
}

function isOpenPolylineOverlayKind(kind: MapOverlayKind): boolean {
  return (
    kind === "grade" ||
    kind === "breakable_doorway" ||
    kind === "toggle_door"
  );
}

/** Path for overlay fill/stroke; open polylines never auto-close with Z. */
function previewOverlayStrokePath(
  kind: MapOverlayKind,
  points: MapPoint[],
): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  const [p0, ...rest] = points;
  const parts = [`M ${p0.x} ${p0.y}`];
  for (const p of rest) parts.push(`L ${p.x} ${p.y}`);
  if (!isOpenPolylineOverlayKind(kind) && points.length >= 3) parts.push("Z");
  return parts.join(" ");
}

/** Sidebar layer list order (grouping). */
const OVERLAY_KIND_ORDER: MapOverlayKind[] = [
  "obstacle",
  "elevation",
  "wall",
  "plant_site",
  "grade",
  "breakable_doorway",
  "toggle_door",
];

function overlayPolygonStyle(
  kind: MapOverlayKind,
  floor: MapFloorId = "lower",
): {
  fill: string;
  stroke: string;
} | null {
  switch (kind) {
    case "obstacle":
      return { fill: "rgba(251,191,36,0.14)", stroke: "rgb(251,191,36)" };
    case "elevation":
      return walkableElevationPolygonStyle(floor);
    case "wall":
      return { fill: "rgba(148,163,184,0.18)", stroke: "rgb(148,163,184)" };
    case "plant_site":
      return {
        fill: "rgba(255,62,62,0.16)",
        stroke: SPAWN_ATK_FILL,
      };
    case "grade":
      return null;
    default:
      return null;
  }
}

function overlayPolygonStyleHover(
  kind: MapOverlayKind,
  highlight: boolean,
  floor: MapFloorId = "lower",
): { fill: string; stroke: string } | null {
  const base = overlayPolygonStyle(kind, floor);
  if (!base) return null;
  if (!highlight) return base;
  switch (kind) {
    case "obstacle":
      return { fill: "rgba(251,191,36,0.42)", stroke: "rgb(254,249,195)" };
    case "elevation":
      return walkableElevationPolygonHoverStyle(floor);
    case "wall":
      return { fill: "rgba(186,198,216,0.48)", stroke: "rgb(241,245,249)" };
    case "plant_site":
      return {
        fill: "rgba(255,62,62,0.38)",
        stroke: SPAWN_ATK_STROKE,
      };
    default:
      return base;
  }
}

function overlayPassiveFill(
  kind: MapOverlayKind,
  floor: MapFloorId = "lower",
): string {
  switch (kind) {
    case "obstacle":
      return "rgba(251,191,36,0.45)";
    case "elevation":
      return floor === "upper" ? WALKABLE_UPPER_PASSIVE : WALKABLE_LOWER_PASSIVE;
    case "wall":
      return "rgba(148,163,184,0.5)";
    case "plant_site":
      return "rgba(255,62,62,0.5)";
    case "grade":
      return "rgba(34,211,238,0.5)";
    case "breakable_doorway":
      return "rgba(16, 185, 129, 0.5)";
    case "toggle_door":
      return "rgba(99,102,241,0.5)";
    default:
      return "rgba(253,224,71,0.45)";
  }
}

function overlayPassiveFillHover(
  kind: MapOverlayKind,
  sidebarHover: boolean,
  floor: MapFloorId = "lower",
): string {
  if (!sidebarHover) return overlayPassiveFill(kind, floor);
  switch (kind) {
    case "obstacle":
      return "rgba(254,243,199,0.95)";
    case "elevation":
      return floor === "upper"
        ? WALKABLE_UPPER_PASSIVE_HOVER
        : WALKABLE_LOWER_PASSIVE_HOVER;
    case "wall":
      return "rgba(241,245,249,0.95)";
    case "plant_site":
      return "rgba(254,202,202,0.95)";
    case "grade":
      return "rgba(165,243,252,0.98)";
    case "breakable_doorway":
      return "rgba(52, 211, 153, 0.55)";
    case "toggle_door":
      return "rgba(129,140,248,0.55)";
    default:
      return overlayPassiveFill(kind, floor);
  }
}

function overlayActiveVertexFill(
  kind: MapOverlayKind,
  selected: boolean,
  floor: MapFloorId = "lower",
): string {
  if (selected) return "rgb(250,250,250)";
  switch (kind) {
    case "obstacle":
      return "rgb(253,224,71)";
    case "elevation":
      return floor === "upper" ? WALKABLE_UPPER_VERTEX : WALKABLE_LOWER_VERTEX;
    case "wall":
      return "rgb(203,213,225)";
    case "plant_site":
      return "rgb(248,113,113)";
    case "grade":
      return "rgb(103,232,249)";
    case "breakable_doorway":
      return BREAKABLE_DOORWAY_VERTEX;
    case "toggle_door":
      return "rgb(165,180,252)";
    default:
      return "rgb(253,224,71)";
  }
}

/** Grade polyline: spikes on each segment; +1 = higher ground to the left of p[i]→p[i+1]. */
function GradeOverlaySvg({
  sh,
  vbWidth,
  highlight,
}: {
  sh: MapOverlayShape;
  vbWidth: number;
  /** Sidebar row hover → brighter stroke/fill on canvas */
  highlight?: boolean;
}) {
  const pts =
    isCircleOverlay(sh) && sh.circle
      ? circleToGradeClosedPoints(sh.circle)
      : sh.points;
  const sw = vbWidth * 0.0035 * (highlight ? 1.35 : 1);
  const side = sh.gradeHighSide ?? 1;
  const lineStroke = highlight
    ? "rgb(207,250,254)"
    : "rgb(34,211,238)";
  const spikeFill = highlight
    ? "rgba(207,250,254,0.98)"
    : "rgba(34,211,238,0.92)";
  const dotFill = highlight
    ? "rgba(207,250,254,0.55)"
    : "rgba(34,211,238,0.35)";
  const dotStroke = highlight
    ? "rgb(236,254,255)"
    : "rgb(34,211,238)";
  const spikeDepth = vbWidth * (highlight ? 0.012 : 0.01);
  const spikeHalfW = vbWidth * 0.0032;
  const spacing = vbWidth * 0.036;

  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const p = pts[0]!;
    const r = vbWidth * (highlight ? 0.01 : 0.008);
    return (
      <g pointerEvents="none">
        <circle
          cx={p.x}
          cy={p.y}
          r={r}
          fill={dotFill}
          stroke={dotStroke}
          strokeWidth={sw * (highlight ? 1.4 : 1)}
        />
      </g>
    );
  }

  return (
    <g pointerEvents="none">
      {Array.from({ length: pts.length - 1 }, (_, seg) => {
        const p0 = pts[seg]!;
        const p1 = pts[seg + 1]!;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const tx = dx / len;
        const ty = dy / len;
        const nx = -dy / len;
        const ny = dx / len;
        const hx = nx * side;
        const hy = ny * side;
        const spikeCount = Math.max(2, Math.min(18, Math.floor(len / spacing)));
        return (
          <g key={seg}>
            <line
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke={lineStroke}
              strokeWidth={sw * (highlight ? 1.65 : 1.2)}
              strokeLinecap="round"
            />
            {Array.from({ length: spikeCount }, (__, i) => {
              const t = (i + 1) / (spikeCount + 1);
              const cx = p0.x + t * dx;
              const cy = p0.y + t * dy;
              const ax = cx + hx * spikeDepth;
              const ay = cy + hy * spikeDepth;
              const b1x = cx - tx * spikeHalfW;
              const b1y = cy - ty * spikeHalfW;
              const b2x = cx + tx * spikeHalfW;
              const b2y = cy + ty * spikeHalfW;
              return (
                <polygon
                  key={i}
                  points={`${ax},${ay} ${b1x},${b1y} ${b2x},${b2y}`}
                  fill={spikeFill}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Breakable doorway or toggle door: open polylines (no fill). */
function DoorwayOverlaySvg({
  sh,
  vbWidth,
  highlight,
}: {
  sh: MapOverlayShape;
  vbWidth: number;
  highlight: boolean;
}) {
  const pts = sh.points;
  const swBase = vbWidth * 0.0038 * (highlight ? 1.2 : 1);

  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const p = pts[0]!;
    const r = vbWidth * 0.007;
    if (sh.kind === "breakable_doorway") {
      return (
        <circle
          cx={p.x}
          cy={p.y}
          r={r}
          fill={BREAKABLE_DOORWAY_STROKE}
          pointerEvents="none"
        />
      );
    }
    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={r}
        fill="rgb(99,102,241)"
        pointerEvents="none"
      />
    );
  }

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  if (sh.kind === "breakable_doorway") {
    const stroke = highlight
      ? BREAKABLE_DOORWAY_STROKE_HI
      : BREAKABLE_DOORWAY_STROKE;
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={swBase}
        strokeDasharray="6 4 2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  }

  const open = sh.door_is_open === true;
  const stroke = open
    ? highlight
      ? "rgb(199,210,254)"
      : "rgb(129,140,248)"
    : highlight
      ? "rgb(199,210,254)"
      : "rgb(79,70,229)";
  const dash = open ? "10 6" : undefined;
  const wmul = open ? 0.88 : 1.12;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={swBase * wmul}
      strokeDasharray={dash}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
      opacity={open ? 0.9 : 1}
    />
  );
}

function newShapeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `#rrggbb` for `<input type="color">` when possible. */
function colorInputHex(css: string): string {
  const s = css.trim();
  if (/^#[\dA-Fa-f]{6}$/.test(s)) return s;
  if (/^#[\dA-Fa-f]{3}$/.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#e9d5ff";
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): MapPoint {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function isEditableContextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
    ),
  );
}

function adjustSelectionAfterVertexRemove(
  selection: Selection,
  layer: ActiveLayer,
  removedIndex: number,
): Selection {
  if (!selection) return null;
  if (selection.kind === "outline" && layer.kind === "outline") {
    if (selection.holeIndex !== layer.holeIndex) return selection;
    const next = selection.indices
      .filter((i) => i !== removedIndex)
      .map((i) => (i > removedIndex ? i - 1 : i));
    if (next.length === 0) return null;
    return { ...selection, indices: next };
  }
  if (
    selection.kind === "overlay" &&
    layer.kind === "overlay" &&
    selection.shapeId === layer.id
  ) {
    const next = selection.indices
      .filter((i) => i !== removedIndex)
      .map((i) => (i > removedIndex ? i - 1 : i));
    if (next.length === 0) return null;
    return { ...selection, indices: next };
  }
  return selection;
}

export function MapShapeEditor({
  mapId,
  initial,
  initialOutlineRings,
}: {
  mapId: string;
  initial: GameMap;
  /** Serialized from the server so initial state matches SSR after RSC payload round-trip. */
  initialOutlineRings: { outer: MapPoint[]; holes: MapPoint[][] };
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const panDragRef = useRef<PanDragState | null>(null);

  const [refUrl, setRefUrl] = useState<string | null>(
    initial.reference_image_url,
  );
  const [transform, setTransform] = useState<MapImageTransform>(
    initial.image_transform ?? defaultMapTransform(),
  );
  const [viewBox, setViewBox] = useState(initial.view_box);
  const [outlineOuter, setOutlineOuter] = useState<MapPoint[]>(
    () => initialOutlineRings.outer,
  );
  const [outlineHoles, setOutlineHoles] = useState<MapPoint[][]>(
    () => initialOutlineRings.holes,
  );
  const [overlays, setOverlays] = useState<MapOverlayShape[]>(() =>
    normalizeExtraPaths(initial.extra_paths),
  );
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>({
    kind: "outline",
    holeIndex: null,
  });
  const [tool, setTool] = useState<Tool>("draw");
  const [selection, setSelection] = useState<Selection>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Transient save feedback (toast); other messages still use `banner`. */
  const [saveToast, setSaveToast] = useState<{
    msg: string;
    kind: "ok" | "err";
  } | null>(null);
  /** null = show full canvas; otherwise zoom/pan window (editor-only, not saved). */
  const [viewport, setViewport] = useState<ViewRect | null>(null);
  const [rightPanning, setRightPanning] = useState(false);
  const [svgClientPx, setSvgClientPx] = useState({ w: 0, h: 0 });
  /** Sidebar list row hover → highlight matching overlay on the canvas */
  const [sidebarHoverOverlayId, setSidebarHoverOverlayId] = useState<
    string | null
  >(null);
  /** Sidebar hole row hover → highlight that hole ring on the canvas */
  const [sidebarHoverHoleIndex, setSidebarHoverHoleIndex] = useState<
    number | null
  >(null);
  const [editorMeta, setEditorMeta] = useState<MapEditorMeta>(() =>
    normalizeEditorMeta(initial.editor_meta),
  );
  /** Click map to place spawns/labels; not persisted. */
  const [placeMode, setPlaceMode] = useState<PlaceAnnotationMode>("none");
  const [sidebarTab, setSidebarTab] = useState<EditorSidebarTab>("map-shape");
  /** Label selected for editing in Annotation tab (also set by clicking a label on the map). */
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [drawShapeMode, setDrawShapeMode] = useState<DrawShapeMode>("polygon");
  /** First click of a two-click circle (outline ring or overlay). */
  const [pendingCircle, setPendingCircle] = useState<
    | {
        kind: "outline";
        holeIndex: number | null;
        center: MapPoint;
      }
    | {
        kind: "overlay";
        overlayId: string;
        center: MapPoint;
      }
    | null
  >(null);
  /** Style/color/size for the next label placed on the map (each label stores its own). */
  const [labelPlaceDefaults, setLabelPlaceDefaults] = useState<{
    style: MapLocationLabelStyle;
    color: string;
    size: number;
    text_anchor: MapLabelTextAnchor;
    text_rotation_deg: number;
  }>({
    style: "pin",
    color: "#e9d5ff",
    size: 1,
    text_anchor: "right",
    text_rotation_deg: 0,
  });
  const annotationDragRef = useRef<AnnotationDragState | null>(null);

  /**
   * "Place on map" (spawn/label placement) should turn off when the user switches
   * draw vs edit, polygon vs circle, sidebar tab, active layer, or geometry selection.
   */
  useEffect(() => {
    setPlaceMode("none");
  }, [tool, drawShapeMode, sidebarTab, selection, activeLayer]);

  const clipId = useId().replace(/:/g, "");
  const outlineRingsRef = useRef({ outer: outlineOuter, holes: outlineHoles });
  const vbRef = useRef(parseViewBox(initial.view_box));

  const vb = useMemo(() => parseViewBox(viewBox), [viewBox]);
  vbRef.current = vb;

  const displayVb = viewport ?? vb;
  const outlineReady = outlineOuter.length >= 3;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const apply = () =>
      setSvgClientPx({ w: el.clientWidth, h: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** SVG user-units per screen pixel (current zoom + panel size). */
  const svgUserPerPx = useMemo(() => {
    const measured = svgClientPx.w > 0 ? svgClientPx.w : 480;
    const wPx = Math.max(1, measured);
    return displayVb.width / wPx;
  }, [displayVb.width, svgClientPx.w]);

  const hitRadius = VERTEX_HANDLE_SCREEN_PX * svgUserPerPx;
  const passiveVertexRadius = PASSIVE_VERTEX_SCREEN_PX * svgUserPerPx;
  const vertexStrokeW = VERTEX_STROKE_SCREEN_PX * svgUserPerPx;
  const passiveVertexStrokeW = PASSIVE_STROKE_SCREEN_PX * svgUserPerPx;

  const annMarkerR = useMemo(() => vb.width * 0.014, [vb.width]);
  const labelFontSize = useMemo(() => vb.width * 0.026, [vb.width]);

  const vbRect = useMemo(
    (): ViewBoxRect => ({
      minX: vb.minX,
      minY: vb.minY,
      width: vb.width,
      height: vb.height,
    }),
    [vb.minX, vb.minY, vb.width, vb.height],
  );

  const { defOuter, defHoles } = useMemo(() => {
    const d = defenseRingsFromAttack(vbRect, outlineOuter, outlineHoles);
    return { defOuter: d.outer, defHoles: d.holes };
  }, [vbRect, outlineOuter, outlineHoles]);

  const overlaysSortedByFloor = useMemo(() => {
    return [...overlays].sort((a, b) => {
      const fa = overlayFloor(a) === "lower" ? 0 : 1;
      const fb = overlayFloor(b) === "lower" ? 0 : 1;
      return fa - fb;
    });
  }, [overlays]);

  const emphasizeOverlayId =
    activeLayer.kind === "overlay"
      ? activeLayer.id
      : sidebarHoverOverlayId;

  const overlayFloorOpacity = useCallback(
    (sh: MapOverlayShape) => {
      const f = overlayFloor(sh);
      const af = editorMeta.active_floor ?? "lower";
      const ghost = editorMeta.ghost_other_floor !== false;
      if (f === af) return 1;
      if (!ghost) return 0;
      /** Upper (sky/cool) reads brighter than lower (warm); ghost it harder when inactive. */
      const upperGhosted = f === "upper" && af === "lower";
      if (emphasizeOverlayId === sh.id) {
        if (upperGhosted && sh.kind === "elevation") return 0.68;
        return upperGhosted ? 0.76 : 0.88;
      }
      if (upperGhosted && sh.kind === "elevation") return 0.16;
      if (upperGhosted) return 0.22;
      return 0.38;
    },
    [
      editorMeta.active_floor,
      editorMeta.ghost_other_floor,
      emphasizeOverlayId,
    ],
  );

  const outlineAtkD = useMemo(() => {
    const closedHoles = outlineHoles.filter((h) => h.length >= 3);
    if (outlineOuter.length >= 3) {
      return ringsToPathD(outlineOuter, closedHoles);
    }
    return previewOpenOrClosed(outlineOuter);
  }, [outlineOuter, outlineHoles]);

  useEffect(() => {
    if (!refUrl) {
      queueMicrotask(() => setImgDims(null));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImgDims({ w: 1000, h: 1000 });
    img.src = refUrl;
  }, [refUrl]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it?.type.startsWith("image/")) {
          e.preventDefault();
          const f = it.getAsFile();
          if (!f) continue;
          const fd = new FormData();
          fd.set("file", f);
          void (async () => {
            setBanner(null);
            const res = await uploadMapReferenceImageAction(mapId, fd);
            if (res.error) setBanner(res.error);
            else if (res.url) setRefUrl(res.url);
          })();
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [mapId]);

  useEffect(() => {
    outlineRingsRef.current = { outer: outlineOuter, holes: outlineHoles };
  }, [outlineOuter, outlineHoles]);

  useEffect(() => {
    setViewport(null);
  }, [viewBox]);

  useEffect(() => {
    if (!saveToast) return;
    const id = window.setTimeout(() => setSaveToast(null), 4200);
    return () => clearTimeout(id);
  }, [saveToast]);

  useEffect(() => {
    if (
      selectedLabelId &&
      !editorMeta.location_labels.some((l) => l.id === selectedLabelId)
    ) {
      setSelectedLabelId(null);
    }
  }, [editorMeta.location_labels, selectedLabelId]);

  const selectedLocationLabel = useMemo((): MapLocationLabel | null => {
    if (!selectedLabelId) return null;
    return (
      editorMeta.location_labels.find((l) => l.id === selectedLabelId) ?? null
    );
  }, [editorMeta.location_labels, selectedLabelId]);

  useEffect(() => {
    if (tool !== "draw" || drawShapeMode !== "circle") {
      setPendingCircle(null);
    }
  }, [tool, drawShapeMode]);

  useEffect(() => {
    const onDocumentContextMenu = (e: MouseEvent) => {
      if (isEditableContextTarget(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onDocumentContextMenu, true);
    return () =>
      document.removeEventListener("contextmenu", onDocumentContextMenu, true);
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = vbRef.current;
      const pt = clientToSvg(el, e.clientX, e.clientY);
      const zoomIn = e.deltaY < 0;
      setViewport((prev) => {
        const cur: ViewRect = prev ?? {
          minX: canvas.minX,
          minY: canvas.minY,
          width: canvas.width,
          height: canvas.height,
        };
        const scale = zoomIn ? 1 / 1.12 : 1.12;
        let newW = cur.width * scale;
        let newH = cur.height * scale;
        newW = Math.min(
          canvas.width,
          Math.max(canvas.width * 0.02, newW),
        );
        newH = Math.min(
          canvas.height,
          Math.max(canvas.height * 0.02, newH),
        );
        let nx = pt.x - (pt.x - cur.minX) * (newW / cur.width);
        let ny = pt.y - (pt.y - cur.minY) * (newH / cur.height);
        nx = Math.max(
          canvas.minX,
          Math.min(canvas.minX + canvas.width - newW, nx),
        );
        ny = Math.max(
          canvas.minY,
          Math.min(canvas.minY + canvas.height - newH, ny),
        );
        return { minX: nx, minY: ny, width: newW, height: newH };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (outlineOuter.length < 3) return;
    queueMicrotask(() => {
      setOverlays((prev) =>
        prev.map((s) =>
          isCircleOverlay(s)
            ? sanitizeOverlayForSave(s, outlineOuter, outlineHoles)
            : {
                ...s,
                points: clampPointsToOutline(
                  s.points,
                  outlineOuter,
                  outlineHoles,
                ),
              },
        ),
      );
    });
  }, [outlineOuter, outlineHoles]);

  const imageLayout = useMemo(() => {
    const nw = imgDims?.w ?? vb.width;
    const nh = imgDims?.h ?? vb.height;
    const fit = Math.min(vb.width / nw, vb.height / nh);
    const s = fit * transform.scale;
    const drawW = nw * s;
    const drawH = nh * s;
    const x = (vb.width - drawW) / 2 + transform.tx;
    const y = (vb.height - drawH) / 2 + transform.ty;
    return { x, y, w: drawW, h: drawH };
  }, [imgDims, transform, vb]);

  const getActivePoints = useCallback((): MapPoint[] => {
    if (activeLayer.kind === "outline") {
      if (activeLayer.holeIndex === null) return outlineOuter;
      return outlineHoles[activeLayer.holeIndex] ?? [];
    }
    const sh = overlays.find((o) => o.id === activeLayer.id);
    return sh?.points ?? [];
  }, [activeLayer, outlineOuter, outlineHoles, overlays]);

  const setActivePoints = useCallback(
    (updater: (prev: MapPoint[]) => MapPoint[]) => {
      if (activeLayer.kind === "outline") {
        if (activeLayer.holeIndex === null) {
          setOutlineOuter(updater);
          return;
        }
        const hi = activeLayer.holeIndex;
        setOutlineHoles((holes) =>
          holes.map((ring, j) => (j === hi ? updater(ring) : ring)),
        );
        return;
      }
      const id = activeLayer.id;
      setOverlays((list) =>
        list.map((s) => (s.id === id ? { ...s, points: updater(s.points) } : s)),
      );
    },
    [activeLayer],
  );

  const addPoint = useCallback(
    (p: MapPoint) => {
      if (activeLayer.kind !== "outline") {
        if (!outlineReady) {
          setBanner(
            "Draw the map outline first (at least three points) before placing overlays.",
          );
          return;
        }
        if (!pointInOutlineWithHoles(p, outlineOuter, outlineHoles)) {
          setBanner(
            "Overlays must sit inside the purple map outline (not in cutouts).",
          );
          return;
        }
        const id = activeLayer.id;
        const sh = overlays.find((o) => o.id === id);
        if (sh?.circle) {
          setBanner(null);
          setOverlays((list) =>
            list.map((s) =>
              s.id === id
                ? { ...s, points: [...s.points, p], circle: undefined }
                : s,
            ),
          );
          return;
        }
      }
      setBanner(null);
      setActivePoints((prev) => [...prev, p]);
    },
    [
      activeLayer,
      outlineReady,
      outlineOuter,
      outlineHoles,
      setActivePoints,
      overlays,
    ],
  );

  const removeVertexAt = useCallback((layer: ActiveLayer, index: number) => {
    setBanner(null);
    setSelection((sel) => adjustSelectionAfterVertexRemove(sel, layer, index));
    if (layer.kind === "outline") {
      if (layer.holeIndex === null) {
        setOutlineOuter((pts) => pts.filter((_, i) => i !== index));
      } else {
        const hi = layer.holeIndex;
        setOutlineHoles((holes) =>
          holes.map((ring, j) =>
            j === hi ? ring.filter((_, i) => i !== index) : ring,
          ),
        );
      }
      return;
    }
    const id = layer.id;
    setOverlays((list) =>
      list.map((s) =>
        s.id === id
          ? { ...s, points: s.points.filter((_, i) => i !== index) }
          : s,
      ),
    );
  }, []);

  const tryInsertPointOnEdge = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (tool !== "edit") return false;
      const svg = svgRef.current;
      if (!svg) return false;
      const p = clientToSvg(svg, clientX, clientY);
      const maxDist = 14 * svgUserPerPx;

      let points: MapPoint[];
      let closed: boolean;
      const al = activeLayer;

      if (al.kind === "outline") {
        if (al.holeIndex === null) {
          points = outlineOuter;
          closed = outlineOuter.length >= 3;
        } else {
          points = outlineHoles[al.holeIndex] ?? [];
          closed = points.length >= 3;
        }
      } else {
        const sh = overlays.find((o) => o.id === al.id);
        if (!sh) return false;
        if (isCircleOverlay(sh)) return false;
        points = sh.points;
        closed = isOpenPolylineOverlayKind(sh.kind)
          ? false
          : points.length >= 3;
      }

      if (points.length < 2) return false;

      const hit = closestEdgeWithinDistance(points, p, closed, maxDist);
      if (!hit) return false;

      const next = insertPointOnEdge(
        points,
        hit.edgeIndex,
        hit.closest,
        closed,
      );

      if (al.kind === "outline") {
        if (al.holeIndex === null) {
          setOutlineOuter(next);
        } else {
          const hi = al.holeIndex;
          setOutlineHoles((holes) =>
            holes.map((ring, j) => (j === hi ? next : ring)),
          );
        }
      } else {
        const id = al.id;
        setOverlays((list) =>
          list.map((s) => (s.id === id ? { ...s, points: next } : s)),
        );
      }
      setSelection(null);
      setBanner(null);
      return true;
    },
    [tool, activeLayer, outlineOuter, outlineHoles, overlays, svgUserPerPx],
  );

  const onSpawnMarkerPointerDown = useCallback(
    (
      e: React.PointerEvent,
      id: string,
      pos: { x: number; y: number },
    ) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        setPlaceMode("none");
        setEditorMeta((m) => ({
          ...m,
          spawn_markers: m.spawn_markers.filter((s) => s.id !== id),
        }));
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      setPlaceMode("none");
      const svg = svgRef.current;
      if (!svg) return;
      const startSvg = clientToSvg(svg, e.clientX, e.clientY);
      annotationDragRef.current = {
        pointerId: e.pointerId,
        kind: "spawn",
        id,
        startSvg,
        startX: pos.x,
        startY: pos.y,
      };
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onLabelMarkerPointerDown = useCallback(
    (
      e: React.PointerEvent,
      id: string,
      pos: { x: number; y: number },
    ) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        setPlaceMode("none");
        setEditorMeta((m) => ({
          ...m,
          location_labels: m.location_labels.filter((l) => l.id !== id),
        }));
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      setPlaceMode("none");
      setSelectedLabelId(id);
      setSidebarTab("annotation");
      const svg = svgRef.current;
      if (!svg) return;
      const startSvg = clientToSvg(svg, e.clientX, e.clientY);
      annotationDragRef.current = {
        pointerId: e.pointerId,
        kind: "label",
        id,
        startSvg,
        startX: pos.x,
        startY: pos.y,
      };
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onAnnotationPointerMove = useCallback((e: React.PointerEvent) => {
    const ad = annotationDragRef.current;
    if (!ad || e.pointerId !== ad.pointerId) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const cur = clientToSvg(svg, e.clientX, e.clientY);
    const dx = cur.x - ad.startSvg.x;
    const dy = cur.y - ad.startSvg.y;
    const nx = ad.startX + dx;
    const ny = ad.startY + dy;
    if (ad.kind === "spawn") {
      setEditorMeta((m) => ({
        ...m,
        spawn_markers: m.spawn_markers.map((s) =>
          s.id === ad.id ? { ...s, x: nx, y: ny } : s,
        ),
      }));
    } else {
      setEditorMeta((m) => ({
        ...m,
        location_labels: m.location_labels.map((l) =>
          l.id === ad.id ? { ...l, x: nx, y: ny } : l,
        ),
      }));
    }
  }, []);

  const onAnnotationPointerUp = useCallback((e: React.PointerEvent) => {
    const ad = annotationDragRef.current;
    if (!ad || e.pointerId !== ad.pointerId) return;
    annotationDragRef.current = null;
    try {
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const onSvgPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 2) {
        e.preventDefault();
        if (!viewport) return;
        const t = e.target as Element;
        if (t.tagName === "circle" && !t.getAttribute("data-map-ann")) return;
        const svg = svgRef.current;
        if (!svg) return;
        const canvas = vbRef.current;
        const cur: ViewRect = {
          minX: viewport.minX,
          minY: viewport.minY,
          width: viewport.width,
          height: viewport.height,
        };
        const br = svg.getBoundingClientRect();
        const bw = Math.max(1, br.width);
        const bh = Math.max(1, br.height);
        panDragRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startView: cur,
          userPerPxX: cur.width / bw,
          userPerPxY: cur.height / bh,
        };
        setRightPanning(true);
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      const t = e.target as Element;
      if (placeMode !== "none") {
        if (t.closest?.("[data-map-ann]")) return;
        if (t.tagName === "circle" && !t.getAttribute("data-map-ann")) return;
        const svg = svgRef.current;
        if (!svg) return;
        const p = clientToSvg(svg, e.clientX, e.clientY);
        if (placeMode === "spawn-atk") {
          setEditorMeta((m) => ({
            ...m,
            spawn_markers: [
              ...m.spawn_markers,
              { id: newShapeId(), side: "atk", x: p.x, y: p.y },
            ],
          }));
          setBanner(null);
          return;
        }
        if (placeMode === "spawn-def") {
          setEditorMeta((m) => ({
            ...m,
            spawn_markers: [
              ...m.spawn_markers,
              { id: newShapeId(), side: "def", x: p.x, y: p.y },
            ],
          }));
          setBanner(null);
          return;
        }
        if (placeMode === "label") {
          const d = labelPlaceDefaults;
          const nid = newShapeId();
          setEditorMeta((m) => ({
            ...m,
            location_labels: [
              ...m.location_labels,
              {
                id: nid,
                x: p.x,
                y: p.y,
                text: "Label",
                style: d.style,
                color: d.color,
                size: d.size,
                text_anchor: d.text_anchor,
                text_rotation_deg: d.text_rotation_deg,
              },
            ],
          }));
          setSelectedLabelId(nid);
          setSidebarTab("annotation");
          setBanner(null);
          return;
        }
      }
      if (t.tagName === "circle" && !t.getAttribute("data-map-ann")) return;
      if (tool === "edit") {
        if (tryInsertPointOnEdge(e.clientX, e.clientY)) return;
        setSelection(null);
        return;
      }
      if (tool !== "draw") return;
      const svg = svgRef.current;
      if (!svg) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);

      if (drawShapeMode === "circle" && placeMode === "none") {
        if (activeLayer.kind === "outline") {
          if (!outlineReady) {
            setBanner("Close the outer outline (≥3 points) before circle shapes.");
            return;
          }
          if (!pointInOutlineWithHoles(p, outlineOuter, outlineHoles)) {
            setBanner(
              "Circle must start inside the purple playable area (not in holes).",
            );
            return;
          }
          const hi = activeLayer.holeIndex;
          const pending = pendingCircle;
          if (
            !pending ||
            pending.kind !== "outline" ||
            pending.holeIndex !== hi
          ) {
            setPendingCircle({ kind: "outline", holeIndex: hi, center: p });
            setBanner("Click again to set the circle radius.");
            return;
          }
          const minR = vbRef.current.width * 0.001;
          const r = Math.hypot(p.x - pending.center.x, p.y - pending.center.y);
          if (r < minR) {
            setBanner("Radius too small — click farther from the center.");
            return;
          }
          const c = clampCircleInPlayableRegion(
            { cx: pending.center.x, cy: pending.center.y, r },
            outlineOuter,
            outlineHoles,
          );
          const ring = circleToPolygon(c, OVERLAY_CIRCLE_SEGMENTS);
          if (hi === null) {
            setOutlineOuter(ring);
          } else {
            setOutlineHoles((holes) =>
              holes.map((h, j) => (j === hi ? ring : h)),
            );
          }
          setPendingCircle(null);
          setBanner(null);
          return;
        }
        if (activeLayer.kind === "overlay") {
          if (!outlineReady) {
            setBanner(
              "Draw the map outline first before placing overlay circles.",
            );
            return;
          }
          if (!pointInOutlineWithHoles(p, outlineOuter, outlineHoles)) {
            setBanner(
              "Circles must sit inside the purple map outline (not in cutouts).",
            );
            return;
          }
          const oid = activeLayer.id;
          const pending = pendingCircle;
          if (
            !pending ||
            pending.kind !== "overlay" ||
            pending.overlayId !== oid
          ) {
            setPendingCircle({ kind: "overlay", overlayId: oid, center: p });
            setBanner("Click again to set the circle radius.");
            return;
          }
          const minR = vbRef.current.width * 0.001;
          const r = Math.hypot(p.x - pending.center.x, p.y - pending.center.y);
          if (r < minR) {
            setBanner("Radius too small — click farther from the center.");
            return;
          }
          const c = clampCircleInPlayableRegion(
            { cx: pending.center.x, cy: pending.center.y, r },
            outlineOuter,
            outlineHoles,
          );
          setOverlays((list) =>
            list.map((s) => {
              if (s.id !== oid) return s;
              if (s.kind === "grade") {
                return {
                  ...s,
                  circle: c,
                  points: circleToGradeClosedPoints(c),
                };
              }
              return { ...s, circle: c, points: [] };
            }),
          );
          setPendingCircle(null);
          setBanner(null);
          return;
        }
      }

      addPoint(p);
    },
    [
      tool,
      addPoint,
      viewport,
      tryInsertPointOnEdge,
      placeMode,
      labelPlaceDefaults,
      drawShapeMode,
      pendingCircle,
      activeLayer,
      outlineReady,
      outlineOuter,
      outlineHoles,
    ],
  );

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pan = panDragRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      e.preventDefault();
      const dxPx = e.clientX - pan.startClientX;
      const dyPx = e.clientY - pan.startClientY;
      const dxUser = dxPx * pan.userPerPxX;
      const dyUser = dyPx * pan.userPerPxY;
      const canvas = vbRef.current;
      let nx = pan.startView.minX - dxUser;
      let ny = pan.startView.minY - dyUser;
      nx = Math.max(
        canvas.minX,
        Math.min(canvas.minX + canvas.width - pan.startView.width, nx),
      );
      ny = Math.max(
        canvas.minY,
        Math.min(canvas.minY + canvas.height - pan.startView.height, ny),
      );
      setViewport({
        minX: nx,
        minY: ny,
        width: pan.startView.width,
        height: pan.startView.height,
      });
    },
    [],
  );

  const endRightPan = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pan = panDragRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      panDragRef.current = null;
      setRightPanning(false);
      try {
        (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onVertexPointerDown = useCallback(
    (
      e: React.PointerEvent,
      layer: ActiveLayer,
      pointIndex: number,
    ) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        if (tool !== "edit") return;
        removeVertexAt(layer, pointIndex);
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      if (tool !== "edit") return;
      if (layer.kind === "outline") setSidebarTab("map-shape");
      else setSidebarTab("objects");
      const svg = svgRef.current;
      if (!svg) return;
      const startSvg = clientToSvg(svg, e.clientX, e.clientY);
      let indices: number[];
      const sameLayer =
        selection &&
        ((layer.kind === "outline" &&
          selection.kind === "outline" &&
          layer.holeIndex === selection.holeIndex) ||
          (layer.kind === "overlay" &&
            selection.kind === "overlay" &&
            selection.shapeId === layer.id));
      if (e.shiftKey && sameLayer && selection) {
        const has = selection.indices.includes(pointIndex);
        indices = has
          ? selection.indices.filter((i) => i !== pointIndex)
          : [...selection.indices, pointIndex];
      } else {
        indices = [pointIndex];
      }

      if (layer.kind === "outline") {
        setSelection({ kind: "outline", holeIndex: layer.holeIndex, indices });
        const ring =
          layer.holeIndex === null
            ? outlineOuter
            : outlineHoles[layer.holeIndex] ?? [];
        dragRef.current = {
          pointerId: e.pointerId,
          startSvg,
          snapshot: [...ring],
          layer,
          indices,
        };
      } else {
        const sh = overlays.find((o) => o.id === layer.id);
        if (!sh) return;
        setEditorMeta((m) => ({
          ...m,
          active_floor: overlayFloor(sh),
        }));
        setSelection({ kind: "overlay", shapeId: layer.id, indices });
        dragRef.current = {
          pointerId: e.pointerId,
          startSvg,
          snapshot: [...sh.points],
          layer,
          indices,
          overlayCircleSnapshot:
            isCircleOverlay(sh) && sh.circle ? { ...sh.circle } : undefined,
        };
      }
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [
      tool,
      selection,
      outlineOuter,
      outlineHoles,
      overlays,
      removeVertexAt,
      setSidebarTab,
    ],
  );

  const onVertexPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const svg = svgRef.current;
      if (!svg) return;
      const cur = clientToSvg(svg, e.clientX, e.clientY);
      const dx = cur.x - d.startSvg.x;
      const dy = cur.y - d.startSvg.y;
      if (d.layer.kind === "outline") {
        const hi = d.layer.holeIndex;
        if (hi === null) {
          setOutlineOuter(() => {
            const next = [...d.snapshot];
            for (const i of d.indices) {
              const base = d.snapshot[i];
              if (base) next[i] = { x: base.x + dx, y: base.y + dy };
            }
            return next;
          });
        } else {
          setOutlineHoles((holes) =>
            holes.map((ring, j) => {
              if (j !== hi) return ring;
              const next = [...d.snapshot];
              for (const i of d.indices) {
                const base = d.snapshot[i];
                if (base) next[i] = { x: base.x + dx, y: base.y + dy };
              }
              return next;
            }),
          );
        }
      } else {
        const id = d.layer.id;
        const { outer, holes } = outlineRingsRef.current;
        if (d.overlayCircleSnapshot && d.layer.kind === "overlay") {
          const start = d.overlayCircleSnapshot;
          const minR = Math.max(1e-9, vbRef.current.width * 0.0008);
          setOverlays((list) =>
            list.map((s) => {
              if (s.id !== id) return s;
              let nextCircle: MapOverlayCircle;
              if (d.indices.includes(0)) {
                nextCircle = {
                  cx: start.cx + dx,
                  cy: start.cy + dy,
                  r: start.r,
                };
              } else {
                nextCircle = {
                  cx: start.cx,
                  cy: start.cy,
                  r: Math.max(
                    minR,
                    Math.hypot(cur.x - start.cx, cur.y - start.cy),
                  ),
                };
              }
              nextCircle = clampCircleInPlayableRegion(
                nextCircle,
                outer,
                holes,
              );
              if (s.kind === "grade") {
                return {
                  ...s,
                  circle: nextCircle,
                  points: circleToGradeClosedPoints(nextCircle),
                };
              }
              return { ...s, circle: nextCircle, points: [] };
            }),
          );
          return;
        }
        setOverlays((list) =>
          list.map((s) => {
            if (s.id !== id) return s;
            const next = [...d.snapshot];
            for (const i of d.indices) {
              const base = d.snapshot[i];
              if (!base) continue;
              const raw = { x: base.x + dx, y: base.y + dy };
              next[i] =
                outer.length >= 3
                  ? clampSegmentToOutlineRegion(base, raw, outer, holes)
                  : raw;
            }
            return { ...s, points: next };
          }),
        );
      }
    },
    [],
  );

  const onVertexPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
      endDrag();
    },
    [endDrag],
  );

  function activateOverlayVertexDrag(
    e: React.PointerEvent,
    sh: MapOverlayShape,
    i: number,
  ) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (tool !== "edit") return;
    const svg = svgRef.current;
    if (!svg) return;
    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    const layer: ActiveLayer = { kind: "overlay", id: sh.id };
    let indices: number[];
    const sameLayer =
      selection &&
      selection.kind === "overlay" &&
      selection.shapeId === sh.id;
    if (e.shiftKey && sameLayer && selection) {
      const has = selection.indices.includes(i);
      indices = has
        ? selection.indices.filter((idx) => idx !== i)
        : [...selection.indices, i];
    } else {
      indices = [i];
    }
    setEditorMeta((m) => ({
      ...m,
      active_floor: overlayFloor(sh),
    }));
    setSidebarTab("objects");
    setActiveLayer(layer);
    setSelection({ kind: "overlay", shapeId: sh.id, indices });
    dragRef.current = {
      pointerId: e.pointerId,
      startSvg,
      snapshot: [...sh.points],
      layer,
      indices,
      overlayCircleSnapshot:
        isCircleOverlay(sh) && sh.circle ? { ...sh.circle } : undefined,
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function undoPoint() {
    setActivePoints((p) => p.slice(0, -1));
  }

  function clearActiveShape() {
    if (activeLayer.kind === "overlay") {
      const id = activeLayer.id;
      setOverlays((list) =>
        list.map((s) =>
          s.id === id ? { ...s, points: [], circle: undefined } : s,
        ),
      );
    } else {
      setActivePoints(() => []);
    }
    setSelection(null);
  }

  function alignVertical() {
    if (!selection || selection.indices.length < 2) return;
    if (selection.kind === "outline") {
      const hi = selection.holeIndex;
      if (hi === null) {
        setOutlineOuter((pts) =>
          alignPointsVertical(pts, selection.indices),
        );
      } else {
        setOutlineHoles((holes) =>
          holes.map((ring, j) =>
            j === hi
              ? alignPointsVertical(ring, selection.indices)
              : ring,
          ),
        );
      }
    } else {
      const sid = selection.shapeId;
      const idx = selection.indices;
      setOverlays((list) =>
        list.map((s) => {
          if (s.id !== sid || isCircleOverlay(s)) return s;
          return {
            ...s,
            points: clampPointsToOutline(
              alignPointsVertical(s.points, idx),
              outlineOuter,
              outlineHoles,
            ),
          };
        }),
      );
    }
  }

  function alignHorizontal() {
    if (!selection || selection.indices.length < 2) return;
    if (selection.kind === "outline") {
      const hi = selection.holeIndex;
      if (hi === null) {
        setOutlineOuter((pts) =>
          alignPointsHorizontal(pts, selection.indices),
        );
      } else {
        setOutlineHoles((holes) =>
          holes.map((ring, j) =>
            j === hi
              ? alignPointsHorizontal(ring, selection.indices)
              : ring,
          ),
        );
      }
    } else {
      const sid = selection.shapeId;
      const idx = selection.indices;
      setOverlays((list) =>
        list.map((s) => {
          if (s.id !== sid || isCircleOverlay(s)) return s;
          return {
            ...s,
            points: clampPointsToOutline(
              alignPointsHorizontal(s.points, idx),
              outlineOuter,
              outlineHoles,
            ),
          };
        }),
      );
    }
  }

  const alignVerticalKeyRef = useRef(alignVertical);
  const alignHorizontalKeyRef = useRef(alignHorizontal);
  alignVerticalKeyRef.current = alignVertical;
  alignHorizontalKeyRef.current = alignHorizontal;

  function addOverlay(kind: MapOverlayKind) {
    if (!outlineReady) {
      setBanner(
        "Finish the map outline (three or more points) before adding overlays.",
      );
      return;
    }
    const id = newShapeId();
    const floor: MapFloorId = editorMeta.active_floor ?? "lower";
    setOverlays((list) => [
      ...list,
      kind === "grade"
        ? {
            id,
            kind,
            floor,
            points: [],
            gradeHighSide: 1 as const,
            circle: undefined,
          }
        : kind === "toggle_door"
          ? {
              id,
              kind,
              floor,
              points: [],
              circle: undefined,
              door_is_open: false,
            }
          : { id, kind, floor, points: [], circle: undefined },
    ]);
    setSidebarTab("objects");
    setActiveLayer({ kind: "overlay", id });
    setTool("draw");
    setSelection(null);
  }

  function flipGradeHighSide() {
    if (activeLayer.kind !== "overlay") return;
    const id = activeLayer.id;
    setOverlays((list) =>
      list.map((s) =>
        s.id === id && s.kind === "grade"
          ? { ...s, gradeHighSide: (s.gradeHighSide ?? 1) === 1 ? -1 : 1 }
          : s,
      ),
    );
  }

  function toggleDoorOpen() {
    if (activeLayer.kind !== "overlay") return;
    const id = activeLayer.id;
    setOverlays((list) =>
      list.map((s) =>
        s.id === id && s.kind === "toggle_door"
          ? { ...s, door_is_open: !(s.door_is_open === true) }
          : s,
      ),
    );
  }

  function moveActiveOverlayToOtherFloor() {
    if (activeLayer.kind !== "overlay") return;
    const id = activeLayer.id;
    const sh = overlays.find((o) => o.id === id);
    if (!sh) return;
    const nextFloor: MapFloorId =
      overlayFloor(sh) === "lower" ? "upper" : "lower";
    setOverlays((list) =>
      list.map((s) => (s.id === id ? { ...s, floor: nextFloor } : s)),
    );
    setEditorMeta((m) => ({ ...m, active_floor: nextFloor }));
  }

  function removeOverlay(id: string) {
    setOverlays((list) => list.filter((s) => s.id !== id));
    if (activeLayer.kind === "overlay" && activeLayer.id === id) {
      setActiveLayer({ kind: "outline", holeIndex: null });
    }
    setSelection(null);
  }

  function swapAttackDefenseSides() {
    setBanner(null);
    const p = parseViewBox(viewBox);
    const rect: ViewBoxRect = {
      minX: p.minX,
      minY: p.minY,
      width: p.width,
      height: p.height,
    };
    const { outer, holes } = outlineRingsRef.current;
    const nextOuter = flipPointsThroughViewBoxCenter(rect, outer);
    const nextHoles = holes.map((h) =>
      flipPointsThroughViewBoxCenter(rect, h),
    );
    setOutlineOuter(nextOuter);
    setOutlineHoles(nextHoles);
    setOverlays((list) =>
      list.map((s) => {
        const gradeSide =
          s.kind === "grade"
            ? ((s.gradeHighSide ?? 1) === 1 ? (-1 as const) : (1 as const))
            : undefined;
        if (s.circle && s.circle.r > 0) {
          const q = flipPointsThroughViewBoxCenter(rect, [
            { x: s.circle.cx, y: s.circle.cy },
          ])[0]!;
          let nc = { cx: q.x, cy: q.y, r: s.circle.r };
          nc = clampCircleInPlayableRegion(nc, nextOuter, nextHoles);
          if (s.kind === "grade") {
            return {
              ...s,
              circle: nc,
              points: circleToGradeClosedPoints(nc),
              gradeHighSide: gradeSide,
            };
          }
          return { ...s, circle: nc, points: [] };
        }
        return {
          ...s,
          points: clampPointsToOutline(
            flipPointsThroughViewBoxCenter(rect, s.points),
            nextOuter,
            nextHoles,
          ),
          ...(s.kind === "grade" && gradeSide !== undefined
            ? { gradeHighSide: gradeSide }
            : {}),
        };
      }),
    );
    setEditorMeta((em) => {
      const flip = (p: MapPoint) =>
        flipPointsThroughViewBoxCenter(rect, [p])[0] ?? p;
      return {
        ...em,
        spawn_markers: em.spawn_markers.map((s) => {
          const q = flip({ x: s.x, y: s.y });
          return { ...s, x: q.x, y: q.y };
        }),
        location_labels: em.location_labels.map((l) => ({
          ...l,
          ...transformLocationLabelForViewBoxCenterFlip(rect, rect.width, l),
        })),
      };
    });
  }

  function addOutlineHole() {
    if (!outlineReady) {
      setBanner("Close the outer outline (≥3 points) before adding a hole.");
      return;
    }
    setBanner(null);
    const newIndex = outlineHoles.length;
    setOutlineHoles((h) => [...h, []]);
    setSidebarTab("map-shape");
    setActiveLayer({ kind: "outline", holeIndex: newIndex });
    setTool("draw");
    setSelection(null);
  }

  function removeOutlineHole(index: number) {
    setOutlineHoles((h) => h.filter((_, j) => j !== index));
    setActiveLayer((prev) => {
      if (prev.kind !== "outline") return prev;
      if (prev.holeIndex === index) {
        return { kind: "outline", holeIndex: null };
      }
      if (prev.holeIndex !== null && prev.holeIndex > index) {
        return { kind: "outline", holeIndex: prev.holeIndex - 1 };
      }
      return prev;
    });
    setSelection(null);
  }

  async function handleSave() {
    setSaving(true);
    setBanner(null);
    const closedHoles = outlineHoles.filter((h) => h.length >= 3);
    const pathAtk = ringsToPathD(outlineOuter, closedHoles);
    const pathDef = ringsToPathD(
      defOuter,
      closedDefenseHoleRingsFromAttack(outlineHoles, defHoles),
    );
    const sanitizedOverlays =
      outlineReady
        ? overlays.map((s) => sanitizeOverlayForSave(s, outlineOuter, outlineHoles))
        : overlays;
    const payload = {
      reference_image_url: refUrl,
      image_transform: transform,
      view_box: viewBox,
      path_atk: pathAtk,
      path_def: pathDef,
      extra_paths: sanitizedOverlays,
      editor_meta: editorMeta,
    };
    try {
      const res = await fetch(
        `/coach/api/maps/${encodeURIComponent(mapId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) {
        setSaveToast({
          msg: json.error ?? `Save failed (HTTP ${res.status}).`,
          kind: "err",
        });
      } else {
        setSaveToast({ msg: "Map shape saved.", kind: "ok" });
      }
    } catch {
      setSaveToast({ msg: "Save failed (network error).", kind: "err" });
    } finally {
      setSaving(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBanner(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadMapReferenceImageAction(mapId, fd);
    if (res.error) setBanner(res.error);
    else if (res.url) setRefUrl(res.url);
  }

  const canAlign =
    selection &&
    selection.indices.length >= 2 &&
    ((selection.kind === "outline" &&
      activeLayer.kind === "outline" &&
      selection.holeIndex === activeLayer.holeIndex) ||
      (selection.kind === "overlay" &&
        activeLayer.kind === "overlay" &&
        selection.shapeId === activeLayer.id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "v" || k === "h") {
          if (isEditableContextTarget(e.target)) return;
          if (tool === "edit" && canAlign) {
            e.preventDefault();
            if (k === "v") alignVerticalKeyRef.current();
            else alignHorizontalKeyRef.current();
          }
          return;
        }
      }

      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isEditableContextTarget(e.target)) return;
      e.preventDefault();
      if (!selection || selection.indices.length === 0) return;
      const sorted = [...selection.indices].sort((a, b) => b - a);
      if (selection.kind === "outline") {
        const hi = selection.holeIndex;
        if (hi === null) {
          setOutlineOuter((pts) => {
            const next = [...pts];
            for (const i of sorted) next.splice(i, 1);
            return next;
          });
        } else {
          setOutlineHoles((holes) =>
            holes.map((ring, j) => {
              if (j !== hi) return ring;
              const next = [...ring];
              for (const i of sorted) next.splice(i, 1);
              return next;
            }),
          );
        }
      } else {
        const sid = selection.shapeId;
        setOverlays((list) =>
          list.map((s) => {
            if (s.id !== sid) return s;
            const next = [...s.points];
            for (const i of sorted) next.splice(i, 1);
            return { ...s, points: next };
          }),
        );
      }
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, tool, canAlign]);

  const activeCount = getActivePoints().length;

  const mapPanelVars = useMemo(
    () =>
      ({
        "--map-vp-min-w": `${MAP_VIEWPORT_MIN_W_PX}px`,
        "--map-vp-min-h": `${MAP_VIEWPORT_MIN_H_PX}px`,
        "--map-vp-max-w": `${MAP_VIEWPORT_MAX_W_PX}px`,
        "--map-vp-max-h": `${MAP_VIEWPORT_MAX_H_PX}px`,
        "--map-vp-max-dvh": `${MAP_VIEWPORT_MAX_DVH}dvh`,
      }) as CSSProperties,
    [],
  );

  const sideLabelsInverted = editorMeta.side_meaning_inverted === true;

  const activeOverlayKindLabel =
    activeLayer.kind === "overlay"
      ? (() => {
          const k = overlays.find((o) => o.id === activeLayer.id)?.kind;
          if (!k) return "Overlay";
          switch (k) {
            case "obstacle":
              return "obstacle";
            case "elevation":
              return "walkable space";
            case "wall":
              return "wall";
            case "grade":
              return "grade";
            case "breakable_doorway":
              return "breakable doorway";
            case "toggle_door":
              return "toggle door";
            case "plant_site":
              return "plant site";
            default:
              return k;
          }
        })()
      : "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <details
          className="min-w-0 flex-1 overflow-hidden rounded-lg border border-violet-800/35 bg-slate-950/40 [&[open]>summary_.chevron-map-h]:rotate-90"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden">
            <ChevronRight className="chevron-map-h h-4 w-4 shrink-0 text-violet-400 transition-transform" />
            <h2 className="text-xl font-semibold text-white">{initial.name}</h2>
          </summary>
          <p className="border-t border-violet-800/25 px-3 py-3 text-sm text-violet-200/60">
            The purple outline saves as{" "}
            <code className="text-violet-300/90">path_atk</code>; the mirrored defense ring
            is stored as{" "}
            <code className="text-violet-300/90">path_def</code>. Use{" "}
            <strong className="font-medium text-violet-200/80">Swap sides</strong> to flip
            geometry when you need to trace or edit from the other perspective. Add holes
            to cut out areas inside the outline.
            Overlays sit in the playable ring (not in holes); they stay clipped as you
            edit. Use <strong className="font-medium text-violet-200/80">
              Invert atk/def meaning
            </strong>{" "}
            if your reference image has attack/defense reversed. Use Edit to drag
            vertices, Shift+click to multi-select, and click passive overlay vertices
            on the canvas to select their layer. Use{" "}
            <strong className="font-medium text-violet-200/80">Lower</strong> /{" "}
            <strong className="font-medium text-violet-200/80">Upper</strong>{" "}
            to stack two overlapping plan levels (same x/y; upper draws on top).
            Uncheck <strong className="font-medium text-violet-200/80">Dim other floor</strong>{" "}
            to hide the inactive floor while editing.{" "}
            <strong className="font-medium text-violet-200/80">Walkable space</strong>{" "}
            (elevation) uses warm ground tones on lower and cool sky tones on upper
            (heaven vs ground-level callouts).
          </p>
        </details>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn-primary hidden shrink-0 items-center gap-2 lg:inline-flex"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save map
        </button>
      </div>

      {banner && (
        <p
          className="shrink-0 rounded-lg border border-violet-800/40 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
          role="status"
        >
          {banner}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,min(50dvh,32rem))] gap-6 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-1 lg:items-stretch">
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
          <div
            className="mx-auto flex min-h-0 w-full min-w-0 max-w-[min(100%,var(--map-vp-max-w))] flex-1 flex-col gap-3"
            style={mapPanelVars}
          >
            <div className="min-w-0 shrink-0 overflow-x-auto rounded-lg border border-violet-500/20 bg-slate-950/60 px-2 py-2 shadow-sm">
              <div className="flex w-max min-w-full flex-nowrap items-center gap-x-3 gap-y-1 text-xs text-violet-300/55">
                <label className="btn-secondary inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                  <ImagePlus className="h-4 w-4" />
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onFile(e)}
                  />
                </label>
                <span className="shrink-0 text-xs text-violet-300/45">
                  Or paste (Ctrl+V) anywhere on this page
                </span>
                {sideLabelsInverted ? (
                  <>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-violet-800/40 px-2 py-0.5">
                      <Shield className="h-3.5 w-3.5 text-violet-300" />
                      Defense (editable)
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-800/40 px-2 py-0.5">
                      <Swords className="h-3.5 w-3.5 text-sky-300" />
                      Attack (auto mirror)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-violet-800/40 px-2 py-0.5">
                      <Swords className="h-3.5 w-3.5 text-violet-300" />
                      Attack (editable)
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-800/40 px-2 py-0.5">
                      <Shield className="h-3.5 w-3.5 text-sky-300" />
                      Defense (auto mirror)
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={swapAttackDefenseSides}
                  disabled={outlineOuter.length < 1}
                  className="btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 disabled:opacity-40"
                  title="Flip stored attack outline and overlays through the map center (mirror horizontally and vertically)"
                >
                  <span className="inline-flex items-center gap-px">
                    <FlipHorizontal2 className="h-3 w-3" />
                    <FlipVertical2 className="h-3 w-3" />
                  </span>
                  Swap sides
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditorMeta((m) => ({
                      ...m,
                      side_meaning_inverted: !m.side_meaning_inverted,
                    }))
                  }
                  className={`btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 ${
                    sideLabelsInverted
                      ? "border-amber-600/50 bg-amber-950/30 text-amber-100"
                      : ""
                  }`}
                  title="Swap which outline means attack vs defense for strats (purple still saves as path_atk; no geometry change)"
                >
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  Invert atk/def meaning
                </button>
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 text-violet-300/50"
                  title="Stacked 2D levels (e.g. site vs heaven)"
                >
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditorMeta((m) => ({ ...m, active_floor: "lower" }))
                  }
                  className={`btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 ${
                    (editorMeta.active_floor ?? "lower") === "lower"
                      ? "border-amber-600/45 bg-amber-950/30 text-amber-100"
                      : ""
                  }`}
                  title="Lower floor: new overlays go here; drawn below upper in this view"
                >
                  Lower
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditorMeta((m) => ({ ...m, active_floor: "upper" }))
                  }
                  className={`btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 ${
                    (editorMeta.active_floor ?? "lower") === "upper"
                      ? "border-sky-500/45 bg-sky-950/30 text-sky-100"
                      : ""
                  }`}
                  title="Upper floor: new overlays here; drawn above lower when both are visible"
                >
                  Upper
                </button>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-violet-300/70">
                  <input
                    type="checkbox"
                    className="rounded border-violet-700 bg-slate-900"
                    checked={editorMeta.ghost_other_floor !== false}
                    onChange={(e) =>
                      setEditorMeta((m) => ({
                        ...m,
                        ghost_other_floor: e.target.checked,
                      }))
                    }
                  />
                  Dim other floor
                </label>
                {viewport && (
                  <button
                    type="button"
                    onClick={() => setViewport(null)}
                    className="shrink-0 rounded border border-violet-700/50 px-2 py-0.5 text-violet-200/80 hover:bg-violet-950/50 hover:text-white"
                  >
                    Reset zoom
                  </button>
                )}
                <button
                  type="button"
                  disabled={!refUrl}
                  onClick={() =>
                    setEditorMeta((m) => ({
                      ...m,
                      show_reference_image: !m.show_reference_image,
                    }))
                  }
                  className="btn-secondary inline-flex shrink-0 items-center gap-1 px-2 py-1 disabled:opacity-40"
                  title={
                    !refUrl
                      ? "Upload a reference image first"
                      : editorMeta.show_reference_image
                        ? "Hide reference image (vectors stay visible)"
                        : "Show reference image"
                  }
                >
                  {editorMeta.show_reference_image ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  Reference art
                </button>
              </div>
            </div>

          {placeMode !== "none" && (
            <p
              className="shrink-0 rounded-lg border border-amber-700/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100/90"
              role="status"
            >
              {placeMode === "spawn-atk" &&
                "Click the map to place an attacker spawn marker. Drag a marker to move it; right-click to remove."}
              {placeMode === "spawn-def" &&
                "Click the map to place a defender spawn marker. Drag to move; right-click to remove."}
              {placeMode === "label" &&
                "Click the map to add a label (uses style/size/color below). Pin: drag the dot; text-only: drag the text. Right-click to remove."}
            </p>
          )}

          <div
            className="box-border flex min-h-0 w-full min-w-[var(--map-vp-min-w)] flex-1 select-none overflow-auto rounded-xl border border-violet-500/25 bg-black/40 max-h-[min(100%,min(var(--map-vp-max-dvh),var(--map-vp-max-h)))]"
            style={{ ...mapPanelVars, resize: "both" }}
            onKeyDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label="Map reference and trace canvas"
              viewBox={`${displayVb.minX} ${displayVb.minY} ${displayVb.width} ${displayVb.height}`}
              className={`block h-full min-h-[var(--map-vp-min-h)] w-full min-w-[var(--map-vp-min-w)] touch-none select-none bg-zinc-950 ${
                rightPanning ? "cursor-grabbing" : "cursor-crosshair"
              }`}
              style={{ userSelect: "none" }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={endRightPan}
              onPointerCancel={endRightPan}
              onLostPointerCapture={() => {
                panDragRef.current = null;
                setRightPanning(false);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {refUrl && editorMeta.show_reference_image ? (
                <image
                  href={refUrl}
                  x={imageLayout.x}
                  y={imageLayout.y}
                  width={imageLayout.w}
                  height={imageLayout.h}
                  preserveAspectRatio="none"
                />
              ) : !refUrl ? (
                <text
                  x={vb.width / 2}
                  y={vb.height / 2}
                  textAnchor="middle"
                  className="fill-violet-300/50 text-lg"
                >
                  Paste or upload a map image
                </text>
              ) : null}

              {outlineAtkD && (
                <path
                  d={outlineAtkD}
                  fill="rgba(167,139,250,0.12)"
                  fillRule={outlineOuter.length >= 3 ? "evenodd" : undefined}
                  stroke="rgb(167,139,250)"
                  strokeWidth={vb.width * 0.004}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}
              {outlineHoles.map((h, hi) => {
                if (h.length >= 3 || h.length === 0) return null;
                const d = previewOpenOrClosed(h);
                if (!d) return null;
                const hl = sidebarHoverHoleIndex === hi;
                return (
                  <path
                    key={`hole-inprogress-atk-${hi}`}
                    d={d}
                    fill="none"
                    stroke={hl ? "rgb(251,207,232)" : "rgb(244,114,182)"}
                    strokeWidth={vb.width * (hl ? 0.0048 : 0.003)}
                    strokeDasharray="6 4"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                );
              })}
              {sidebarHoverHoleIndex !== null &&
                (() => {
                  const h = outlineHoles[sidebarHoverHoleIndex];
                  if (!h || h.length < 3) return null;
                  const d = previewOpenOrClosed(h);
                  if (!d) return null;
                  return (
                    <path
                      key={`hole-hover-atk-${sidebarHoverHoleIndex}`}
                      d={d}
                      fill="rgba(244,114,182,0.2)"
                      fillRule={h.length >= 3 ? "evenodd" : undefined}
                      stroke="rgb(251,207,232)"
                      strokeWidth={vb.width * 0.0045}
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                  );
                })()}

              <defs>
                {outlineAtkD && outlineReady && (
                  <clipPath id={clipId}>
                    <path d={outlineAtkD} fillRule="evenodd" />
                  </clipPath>
                )}
              </defs>

              <g
                clipPath={
                  outlineAtkD && outlineReady ? `url(#${clipId})` : undefined
                }
              >
                {overlaysSortedByFloor.map((sh) => {
                  const op = overlayFloorOpacity(sh);
                  if (op < 0.02) return null;
                  const hl = sidebarHoverOverlayId === sh.id;
                  if (
                    sh.kind === "breakable_doorway" ||
                    sh.kind === "toggle_door"
                  ) {
                    return (
                      <g key={sh.id} style={{ opacity: op }} pointerEvents="none">
                        <DoorwayOverlaySvg
                          sh={sh}
                          vbWidth={vb.width}
                          highlight={hl}
                        />
                      </g>
                    );
                  }
                  if (sh.kind === "grade") {
                    return (
                      <g key={sh.id} style={{ opacity: op }} pointerEvents="none">
                        <GradeOverlaySvg
                          sh={sh}
                          vbWidth={vb.width}
                          highlight={hl}
                        />
                      </g>
                    );
                  }
                  if (isCircleOverlay(sh) && sh.circle) {
                    const poly = overlayPolygonStyleHover(
                      sh.kind,
                      hl,
                      overlayFloor(sh),
                    );
                    if (!poly) return null;
                    const c = sh.circle;
                    return (
                      <g key={sh.id} style={{ opacity: op }} pointerEvents="none">
                        <circle
                          cx={c.cx}
                          cy={c.cy}
                          r={c.r}
                          fill={poly.fill}
                          stroke={poly.stroke}
                          strokeWidth={vb.width * 0.003 * (hl ? 2.2 : 1)}
                          pointerEvents="none"
                        />
                      </g>
                    );
                  }
                  const d = previewOverlayStrokePath(sh.kind, sh.points);
                  if (!d) return null;
                  const poly = overlayPolygonStyleHover(
                    sh.kind,
                    hl,
                    overlayFloor(sh),
                  );
                  if (!poly) return null;
                  return (
                    <g key={sh.id} style={{ opacity: op }} pointerEvents="none">
                      <path
                        d={d}
                        fill={poly.fill}
                        stroke={poly.stroke}
                        strokeWidth={vb.width * 0.003 * (hl ? 2.2 : 1)}
                        strokeLinejoin="round"
                        strokeDasharray={
                          sh.kind === "plant_site" ? "9 6" : undefined
                        }
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
              </g>

              {tool === "edit" &&
                outlineReady &&
                overlaysSortedByFloor
                  .filter((sh) => overlayFloorOpacity(sh) > 0)
                  .flatMap((sh) =>
                  (isCircleOverlay(sh) ? [] : sh.points).flatMap((p, i) => {
                    if (
                      activeLayer.kind === "overlay" &&
                      activeLayer.id === sh.id
                    ) {
                      return [];
                    }
                    return [
                      <circle
                        key={`ov-passive-${sh.id}-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={passiveVertexRadius}
                        fill={overlayPassiveFillHover(
                          sh.kind,
                          sidebarHoverOverlayId === sh.id,
                          overlayFloor(sh),
                        )}
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth={passiveVertexStrokeW}
                        style={{ cursor: "pointer" }}
                        onPointerDown={(e) => {
                          if (e.button === 2) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (tool !== "edit") return;
                            removeVertexAt({ kind: "overlay", id: sh.id }, i);
                            return;
                          }
                          activateOverlayVertexDrag(e, sh, i);
                        }}
                      />,
                    ];
                  }),
                )}

              {activeLayer.kind === "outline" &&
                activeLayer.holeIndex === null &&
                outlineOuter.map((p, i) => {
                  const sel =
                    selection?.kind === "outline" &&
                    selection.holeIndex === null &&
                    selection.indices.includes(i);
                  return (
                    <circle
                      key={`o-outer-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={hitRadius}
                      fill={
                        sel ? "rgb(250,250,250)" : "rgb(196,181,253)"
                      }
                      fillOpacity={tool === "draw" ? 0.35 : 0.95}
                      stroke="white"
                      strokeWidth={vertexStrokeW}
                      style={{
                        cursor:
                          tool === "edit" ? "grab" : "crosshair",
                        pointerEvents: tool === "draw" ? "none" : "auto",
                      }}
                      onPointerDown={(e) =>
                        onVertexPointerDown(e, {
                          kind: "outline",
                          holeIndex: null,
                        }, i)
                      }
                      onPointerMove={onVertexPointerMove}
                      onPointerUp={onVertexPointerUp}
                      onPointerCancel={onVertexPointerUp}
                    />
                  );
                })}

              {activeLayer.kind === "outline" &&
                activeLayer.holeIndex !== null &&
                (outlineHoles[activeLayer.holeIndex] ?? []).map((p, i) => {
                  const hi = activeLayer.holeIndex;
                  const sel =
                    selection?.kind === "outline" &&
                    selection.holeIndex === hi &&
                    selection.indices.includes(i);
                  return (
                    <circle
                      key={`o-hole-${hi}-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={hitRadius}
                      fill={
                        sel ? "rgb(250,250,250)" : "rgb(244,114,182)"
                      }
                      fillOpacity={tool === "draw" ? 0.35 : 0.95}
                      stroke="white"
                      strokeWidth={vertexStrokeW}
                      style={{
                        cursor:
                          tool === "edit" ? "grab" : "crosshair",
                        pointerEvents: tool === "draw" ? "none" : "auto",
                      }}
                      onPointerDown={(e) =>
                        onVertexPointerDown(e, {
                          kind: "outline",
                          holeIndex: hi,
                        }, i)
                      }
                      onPointerMove={onVertexPointerMove}
                      onPointerUp={onVertexPointerUp}
                      onPointerCancel={onVertexPointerUp}
                    />
                  );
                })}

              {activeLayer.kind === "overlay" &&
                (() => {
                  const activeOv = overlays.find((s) => s.id === activeLayer.id);
                  if (!activeOv) return null;
                  if (isCircleOverlay(activeOv) && activeOv.circle) {
                    const c = activeOv.circle;
                    const rim = { x: c.cx + c.r, y: c.cy };
                    const handles: { p: MapPoint; i: number }[] = [
                      { p: { x: c.cx, y: c.cy }, i: 0 },
                      { p: rim, i: 1 },
                    ];
                    return handles.map(({ p, i }) => {
                      const sel =
                        selection?.kind === "overlay" &&
                        selection.shapeId === activeLayer.id &&
                        selection.indices.includes(i);
                      return (
                        <circle
                          key={`ov-${activeLayer.id}-c${i}`}
                          cx={p.x}
                          cy={p.y}
                          r={hitRadius}
                          fill={overlayActiveVertexFill(
                            activeOv.kind,
                            sel,
                            overlayFloor(activeOv),
                          )}
                          fillOpacity={tool === "draw" ? 0.35 : 0.95}
                          stroke="white"
                          strokeWidth={vertexStrokeW}
                          style={{
                            cursor:
                              tool === "edit" ? "grab" : "crosshair",
                            pointerEvents: tool === "draw" ? "none" : "auto",
                          }}
                          onPointerDown={(e) =>
                            onVertexPointerDown(
                              e,
                              { kind: "overlay", id: activeLayer.id },
                              i,
                            )
                          }
                          onPointerMove={onVertexPointerMove}
                          onPointerUp={onVertexPointerUp}
                          onPointerCancel={onVertexPointerUp}
                        />
                      );
                    });
                  }
                  return activeOv.points.map((p, i) => {
                    const sel =
                      selection?.kind === "overlay" &&
                      selection.shapeId === activeLayer.id &&
                      selection.indices.includes(i);
                    return (
                      <circle
                        key={`ov-${activeLayer.id}-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={hitRadius}
                        fill={overlayActiveVertexFill(
                          activeOv.kind,
                          sel,
                          overlayFloor(activeOv),
                        )}
                        fillOpacity={tool === "draw" ? 0.35 : 0.95}
                        stroke="white"
                        strokeWidth={vertexStrokeW}
                        style={{
                          cursor:
                            tool === "edit" ? "grab" : "crosshair",
                          pointerEvents: tool === "draw" ? "none" : "auto",
                        }}
                        onPointerDown={(e) =>
                          onVertexPointerDown(
                            e,
                            { kind: "overlay", id: activeLayer.id },
                            i,
                          )
                        }
                        onPointerMove={onVertexPointerMove}
                        onPointerUp={onVertexPointerUp}
                        onPointerCancel={onVertexPointerUp}
                      />
                    );
                  });
                })()}

              <g style={{ pointerEvents: "auto" }}>
                {editorMeta.spawn_markers.map((s) => {
                  const atk = s.side === "atk";
                  const fill = atk ? SPAWN_ATK_FILL : SPAWN_DEF_FILL;
                  const stroke = atk ? SPAWN_ATK_STROKE : SPAWN_DEF_STROKE;
                  return (
                    <circle
                      key={`spawn-${s.id}`}
                      data-map-ann="spawn"
                      cx={s.x}
                      cy={s.y}
                      r={annMarkerR}
                      fill={fill}
                      fillOpacity={0.95}
                      stroke={stroke}
                      strokeWidth={vertexStrokeW * 0.85}
                      style={{ cursor: "grab" }}
                      onPointerDown={(e) =>
                        onSpawnMarkerPointerDown(e, s.id, { x: s.x, y: s.y })
                      }
                      onPointerMove={onAnnotationPointerMove}
                      onPointerUp={onAnnotationPointerUp}
                      onPointerCancel={onAnnotationPointerUp}
                      onLostPointerCapture={() => {
                        annotationDragRef.current = null;
                      }}
                    />
                  );
                })}
                {editorMeta.location_labels.map((l) => {
                  const labelSelected = selectedLabelId === l.id;
                  const fs = labelFontSize * l.size;
                  const pinR = annMarkerR * l.size * 0.55;
                  const strokeOut = fs * 0.08;
                  const fill = l.color;
                  const textOnlyGap = Math.max(
                    fs * 0.35,
                    annMarkerR * l.size * 0.45,
                  );
                  const tp = mapLabelTextSvgProps(l.text_anchor, {
                    px: l.x,
                    py: l.y,
                    pinR,
                    fs,
                    isPin: l.style === "pin",
                    textOnlyGap,
                  });
                  const rot = l.text_rotation_deg ?? 0;
                  /** Explicit translate/rotate chain matches SVG `rotate(a,cx,cy)` and avoids browser quirks with shorthand on `<text>`. */
                  const textRotate =
                    rot !== 0 && Number.isFinite(rot)
                      ? `translate(${tp.x},${tp.y}) rotate(${rot}) translate(${-tp.x},${-tp.y})`
                      : undefined;
                  if (l.style === "text") {
                    return (
                      <text
                        key={`label-${l.id}`}
                        data-map-ann="label"
                        transform={textRotate}
                        x={tp.x}
                        y={tp.y}
                        textAnchor={tp.textAnchor}
                        dominantBaseline={tp.dominantBaseline}
                        fill={fill}
                        stroke={
                          labelSelected
                            ? "rgb(244,114,182)"
                            : "rgba(12,12,18,0.88)"
                        }
                        strokeWidth={labelSelected ? strokeOut * 2 : strokeOut}
                        paintOrder="stroke fill"
                        style={{
                          fontSize: fs,
                          fontFamily: "system-ui, sans-serif",
                          fontWeight: 600,
                          cursor: "grab",
                        }}
                        onPointerDown={(e) =>
                          onLabelMarkerPointerDown(e, l.id, { x: l.x, y: l.y })
                        }
                        onPointerMove={onAnnotationPointerMove}
                        onPointerUp={onAnnotationPointerUp}
                        onPointerCancel={onAnnotationPointerUp}
                        onLostPointerCapture={() => {
                          annotationDragRef.current = null;
                        }}
                      >
                        {l.text}
                      </text>
                    );
                  }
                  return (
                    <g key={`label-${l.id}`}>
                      <circle
                        data-map-ann="label"
                        cx={l.x}
                        cy={l.y}
                        r={pinR}
                        fill={fill}
                        fillOpacity={0.95}
                        stroke={
                          labelSelected
                            ? "rgb(244,114,182)"
                            : "rgba(255,255,255,0.92)"
                        }
                        strokeWidth={
                          vertexStrokeW *
                          0.75 *
                          l.size *
                          (labelSelected ? 2.1 : 1)
                        }
                        style={{ cursor: "grab" }}
                        onPointerDown={(e) =>
                          onLabelMarkerPointerDown(e, l.id, { x: l.x, y: l.y })
                        }
                        onPointerMove={onAnnotationPointerMove}
                        onPointerUp={onAnnotationPointerUp}
                        onPointerCancel={onAnnotationPointerUp}
                        onLostPointerCapture={() => {
                          annotationDragRef.current = null;
                        }}
                      />
                      <text
                        transform={textRotate}
                        x={tp.x}
                        y={tp.y}
                        textAnchor={tp.textAnchor}
                        dominantBaseline={tp.dominantBaseline}
                        fill={fill}
                        stroke="rgba(12,12,18,0.88)"
                        strokeWidth={strokeOut}
                        paintOrder="stroke fill"
                        style={{
                          fontSize: fs,
                          fontFamily: "system-ui, sans-serif",
                          fontWeight: 600,
                          pointerEvents: "none",
                        }}
                      >
                        {l.text}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          </div>
        </div>

        <aside
          className="flex min-h-0 flex-col space-y-4 overflow-y-auto overscroll-y-contain rounded-xl border border-violet-500/20 bg-slate-950/50 p-4 [scrollbar-gutter:stable] lg:h-full lg:max-h-full lg:min-h-0"
        >
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="btn-primary inline-flex w-full items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save map
            </button>
          </div>

          <div className="flex shrink-0 flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-violet-400/85">
              Panel
            </span>
            <div className="flex gap-1 rounded-lg border border-violet-800/45 bg-slate-950/60 p-0.5">
              <button
                type="button"
                onClick={() => setSidebarTab("map-shape")}
                className={`min-w-0 flex-1 rounded-md px-2 py-2 text-center text-[11px] font-medium leading-tight sm:text-xs ${
                  sidebarTab === "map-shape"
                    ? "bg-violet-600 text-white"
                    : "text-violet-200/75 hover:bg-violet-950/40 hover:text-white"
                }`}
                title="Outline, holes, image & view box"
              >
                Map shape
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("objects")}
                className={`min-w-0 flex-1 rounded-md px-2 py-2 text-center text-[11px] font-medium leading-tight sm:text-xs ${
                  sidebarTab === "objects"
                    ? "bg-violet-600 text-white"
                    : "text-violet-200/75 hover:bg-violet-950/40 hover:text-white"
                }`}
                title="Overlays: walkable areas, walls, doors, etc."
              >
                Objects
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab("annotation")}
                className={`min-w-0 flex-1 rounded-md px-2 py-2 text-center text-[11px] font-medium leading-tight sm:text-xs ${
                  sidebarTab === "annotation"
                    ? "bg-violet-600 text-white"
                    : "text-violet-200/75 hover:bg-violet-950/40 hover:text-white"
                }`}
                title="Reference image, spawns, labels"
              >
                Annotation
              </button>
            </div>
          </div>

          {(sidebarTab === "map-shape" || sidebarTab === "objects") && (
            <div>
              <span className="label">Tool</span>
              <div className="mt-2 flex rounded-lg border border-violet-800/50 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTool("draw");
                    setSelection(null);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium ${
                    tool === "draw"
                      ? "bg-violet-600 text-white"
                      : "text-violet-200/70 hover:text-white"
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setTool("edit")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium ${
                    tool === "edit"
                      ? "bg-slate-600 text-white"
                      : "text-violet-200/70 hover:text-white"
                  }`}
                >
                  <Move className="h-4 w-4" />
                  Edit
                </button>
              </div>
              {tool === "draw" && (
                <div className="mt-2">
                  <span className="text-[11px] text-violet-300/55">
                    Draw shape
                  </span>
                  <div className="mt-1 flex rounded-lg border border-violet-800/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setDrawShapeMode("polygon");
                        setPendingCircle(null);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                        drawShapeMode === "polygon"
                          ? "bg-violet-600 text-white"
                          : "text-violet-200/70 hover:text-white"
                      }`}
                    >
                      Polygon
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrawShapeMode("circle");
                        setPendingCircle(null);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                        drawShapeMode === "circle"
                          ? "bg-violet-600 text-white"
                          : "text-violet-200/70 hover:text-white"
                      }`}
                    >
                      <CircleIcon className="h-3.5 w-3.5" />
                      Circle
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-violet-300/45">
                    {drawShapeMode === "circle"
                      ? "First click: center. Second click: radius (distance from center)."
                      : "Each click adds a vertex; shapes close automatically when complete."}
                  </p>
                </div>
              )}
            </div>
          )}

          {sidebarTab === "annotation" && (
          <div className="rounded-lg border border-teal-800/35 bg-slate-900/40 p-3">
            <span className="label">Map annotations</span>
            <p className="mt-1 text-xs text-violet-300/55">
              Spawns and callouts are saved with the map. Collapse sections you
              don&apos;t need; hide reference art while tracing if it gets in the
              way.
            </p>
            <div className="mt-3 space-y-2">
              <details
                className="overflow-hidden rounded-lg border border-teal-800/40 bg-slate-950/30 [&[open]>summary_.chevron-ann]:rotate-90"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-teal-100/95 hover:bg-teal-950/35 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="chevron-ann h-4 w-4 shrink-0 text-teal-400 transition-transform" />
                  <Eye className="h-4 w-4 shrink-0 text-teal-300" />
                  <span className="min-w-0 flex-1">Reference image</span>
                </summary>
                <div className="space-y-2 border-t border-teal-800/30 px-2 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-violet-200/90">
                    <input
                      type="checkbox"
                      className="rounded border-violet-600"
                      checked={editorMeta.show_reference_image}
                      disabled={!refUrl}
                      onChange={(e) =>
                        setEditorMeta((m) => ({
                          ...m,
                          show_reference_image: e.target.checked,
                        }))
                      }
                    />
                    Show reference image
                  </label>
                  {!refUrl && (
                    <p className="text-xs text-violet-400/70">
                      Upload a reference image first to toggle visibility.
                    </p>
                  )}
                </div>
              </details>

              <details
                className="overflow-hidden rounded-lg border border-fuchsia-900/35 bg-slate-950/30 [&[open]>summary_.chevron-ann]:rotate-90"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-fuchsia-100/95 hover:bg-fuchsia-950/25 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="chevron-ann h-4 w-4 shrink-0 text-fuchsia-400 transition-transform" />
                  <Type className="h-4 w-4 shrink-0 text-fuchsia-300" />
                  <span className="min-w-0 flex-1">Next label (when placing)</span>
                </summary>
                <div className="space-y-2 border-t border-fuchsia-900/25 px-2 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setLabelPlaceDefaults((d) => ({ ...d, style: "pin" }))
                      }
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        labelPlaceDefaults.style === "pin"
                          ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      Pin + text
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLabelPlaceDefaults((d) => ({ ...d, style: "text" }))
                      }
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        labelPlaceDefaults.style === "text"
                          ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      Text only
                    </button>
                  </div>
                  <div>
                    <p className="text-xs text-violet-300/60">Text from point</p>
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      {LABEL_ANCHOR_OPTIONS.map(({ value, title, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          title={title}
                          onClick={() =>
                            setLabelPlaceDefaults((d) => ({
                              ...d,
                              text_anchor: value,
                            }))
                          }
                          className={`inline-flex items-center justify-center rounded border p-1.5 ${
                            labelPlaceDefaults.text_anchor === value
                              ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                              : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">{title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-violet-300/60">
                      Text rotation (e.g. ±90° for vertical halls)
                    </p>
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      {LABEL_ROTATION_PRESETS.map(({ deg, short }) => (
                        <button
                          key={deg}
                          type="button"
                          title={`Rotate label text ${short} (SVG clockwise)`}
                          onClick={() =>
                            setLabelPlaceDefaults((d) => ({
                              ...d,
                              text_rotation_deg: deg,
                            }))
                          }
                          className={`rounded border px-1 py-1 text-center text-[11px] font-medium tabular-nums ${
                            labelPlaceDefaults.text_rotation_deg === deg
                              ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                              : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                          }`}
                        >
                          {short}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-violet-300/60">
                      Size ({labelPlaceDefaults.size.toFixed(2)}×)
                    </label>
                    <input
                      type="range"
                      min={0.35}
                      max={3}
                      step={0.05}
                      value={labelPlaceDefaults.size}
                      onChange={(e) =>
                        setLabelPlaceDefaults((d) => ({
                          ...d,
                          size: Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full accent-fuchsia-500"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      aria-label="Label color"
                      value={colorInputHex(labelPlaceDefaults.color)}
                      onChange={(e) =>
                        setLabelPlaceDefaults((d) => ({
                          ...d,
                          color: e.target.value,
                        }))
                      }
                      className="h-8 w-10 shrink-0 cursor-pointer rounded border border-violet-700/50 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={labelPlaceDefaults.color}
                      onChange={(e) =>
                        setLabelPlaceDefaults((d) => ({
                          ...d,
                          color: e.target.value,
                        }))
                      }
                      className="input-field min-w-0 flex-1 py-1 font-mono text-xs"
                      placeholder="#e9d5ff"
                    />
                  </div>
                </div>
              </details>

              <details
                className="overflow-hidden rounded-lg border border-violet-800/40 bg-slate-950/30 [&[open]>summary_.chevron-ann]:rotate-90"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-violet-100/95 hover:bg-violet-950/35 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="chevron-ann h-4 w-4 shrink-0 text-violet-400 transition-transform" />
                  <Plus className="h-4 w-4 shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1">Place on map</span>
                </summary>
                <div className="space-y-2 border-t border-violet-800/30 px-2 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlaceMode("none")}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium ${
                        placeMode === "none"
                          ? "border-teal-500/60 bg-teal-950/50 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPlaceMode((m) =>
                          m === "spawn-atk" ? "none" : "spawn-atk",
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                        placeMode === "spawn-atk"
                          ? "border-red-500/65 bg-red-950/45 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      <Swords className="h-3.5 w-3.5 text-red-400" />
                      Atk spawn
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPlaceMode((m) =>
                          m === "spawn-def" ? "none" : "spawn-def",
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                        placeMode === "spawn-def"
                          ? "border-blue-600/60 bg-blue-950/45 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      <Shield className="h-3.5 w-3.5 text-blue-400" />
                      Def spawn
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPlaceMode((m) => (m === "label" ? "none" : "label"))
                      }
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium ${
                        placeMode === "label"
                          ? "border-fuchsia-500/50 bg-fuchsia-950/35 text-white"
                          : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                      }`}
                    >
                      <Type className="h-3.5 w-3.5" />
                      Label
                    </button>
                  </div>
                </div>
              </details>

              <details
                className="overflow-hidden rounded-lg border border-violet-800/40 bg-slate-950/30 [&[open]>summary_.chevron-ann]:rotate-90"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-violet-100/95 hover:bg-violet-950/35 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="chevron-ann h-4 w-4 shrink-0 text-violet-400 transition-transform" />
                  <Swords className="h-4 w-4 shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1">Spawn markers</span>
                  <span className="font-mono text-xs font-normal text-violet-500">
                    {editorMeta.spawn_markers.length}
                  </span>
                </summary>
                <div className="border-t border-violet-800/30 px-2 py-2">
                  {editorMeta.spawn_markers.length === 0 ? (
                    <p className="text-xs text-violet-400/70">
                      None yet — use Place on map → Atk or Def spawn.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs text-violet-200/85">
                      {editorMeta.spawn_markers.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded border border-violet-800/30 px-2 py-1"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {s.side === "atk" ? (
                              <Swords className="h-3.5 w-3.5 text-red-400" />
                            ) : (
                              <Shield className="h-3.5 w-3.5 text-blue-400" />
                            )}
                            {s.side === "atk" ? "Attack" : "Defend"}
                          </span>
                          <button
                            type="button"
                            title="Remove spawn"
                            onClick={() =>
                              setEditorMeta((m) => ({
                                ...m,
                                spawn_markers: m.spawn_markers.filter(
                                  (x) => x.id !== s.id,
                                ),
                              }))
                            }
                            className="shrink-0 rounded p-1 text-fuchsia-300 hover:bg-fuchsia-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>

              <div className="overflow-hidden rounded-lg border border-fuchsia-900/35 bg-slate-950/30">
                <div className="flex items-center gap-2 border-b border-fuchsia-900/25 px-2 py-2">
                  <MapPin className="h-4 w-4 shrink-0 text-fuchsia-300" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-fuchsia-100/95">
                    Label (selection)
                  </span>
                  <span className="font-mono text-xs text-violet-500">
                    {editorMeta.location_labels.length}
                  </span>
                </div>
                <div className="space-y-2 px-2 py-2">
                  <p className="text-xs text-violet-300/55">
                    Click a label on the map to select it, or pick one below.
                    Only the current selection is edited here.
                  </p>
                  {editorMeta.location_labels.length > 0 && (
                    <label className="block text-xs text-violet-300/60">
                      Jump to label
                      <select
                        className="input-field mt-1 w-full py-1.5 text-xs"
                        value={selectedLabelId ?? ""}
                        onChange={(e) => {
                          setPlaceMode("none");
                          setSelectedLabelId(e.target.value || null);
                        }}
                      >
                        <option value="">— Choose —</option>
                        {editorMeta.location_labels.map((lb) => (
                          <option key={lb.id} value={lb.id}>
                            {(lb.text || "Label").slice(0, 56)}
                            {(lb.text || "").length > 56 ? "…" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {editorMeta.location_labels.length === 0 ? (
                    <p className="text-xs text-violet-400/70">
                      None yet — use Place on map → Label.
                    </p>
                  ) : !selectedLocationLabel ? (
                    <p className="text-xs text-violet-400/70">
                      Select a label on the map or from the list.
                    </p>
                  ) : (
                    <div
                      key={selectedLocationLabel.id}
                      className="flex flex-col gap-2 rounded border border-fuchsia-900/35 bg-slate-950/40 p-2"
                    >
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/90" />
                        <input
                          type="text"
                          value={selectedLocationLabel.text}
                          onChange={(e) =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                          className="input-field min-w-0 flex-1 py-1 text-xs"
                          aria-label="Label text"
                        />
                        <button
                          type="button"
                          title="Remove label"
                          onClick={() => {
                            const rid = selectedLocationLabel.id;
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.filter(
                                (x) => x.id !== rid,
                              ),
                            }));
                            setSelectedLabelId(null);
                          }}
                          className="shrink-0 rounded p-1 text-fuchsia-300 hover:bg-fuchsia-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, style: "pin" }
                                  : x,
                              ),
                            }))
                          }
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            selectedLocationLabel.style === "pin"
                              ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                              : "border-violet-800/45 text-violet-200/75"
                          }`}
                        >
                          Pin
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, style: "text" }
                                  : x,
                              ),
                            }))
                          }
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            selectedLocationLabel.style === "text"
                              ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                              : "border-violet-800/45 text-violet-200/75"
                          }`}
                        >
                          Text
                        </button>
                      </div>
                      <div>
                        <p className="text-[11px] text-violet-300/60">
                          Text from point
                        </p>
                        <div className="mt-1 grid grid-cols-4 gap-1">
                          {LABEL_ANCHOR_OPTIONS.map(({ value, title, Icon }) => (
                            <button
                              key={`${selectedLocationLabel.id}-${value}`}
                              type="button"
                              title={title}
                              onClick={() =>
                                setEditorMeta((m) => ({
                                  ...m,
                                  location_labels: m.location_labels.map(
                                    (x) =>
                                      x.id === selectedLocationLabel.id
                                        ? { ...x, text_anchor: value }
                                        : x,
                                  ),
                                }))
                              }
                              className={`inline-flex items-center justify-center rounded border p-1 ${
                                selectedLocationLabel.text_anchor === value
                                  ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                                  : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                              }`}
                            >
                              <Icon className="h-3 w-3" aria-hidden />
                              <span className="sr-only">{title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] text-violet-300/60">
                          Text rotation
                        </p>
                        <div className="mt-1 grid grid-cols-4 gap-1">
                          {LABEL_ROTATION_PRESETS.map(({ deg, short }) => (
                            <button
                              key={`${selectedLocationLabel.id}-rot-${deg}`}
                              type="button"
                              title={`Rotate label ${short}`}
                              onClick={() =>
                                setEditorMeta((m) => ({
                                  ...m,
                                  location_labels: m.location_labels.map(
                                    (x) =>
                                      x.id === selectedLocationLabel.id
                                        ? { ...x, text_rotation_deg: deg }
                                        : x,
                                  ),
                                }))
                              }
                              className={`rounded border px-0.5 py-0.5 text-center text-[10px] font-medium tabular-nums ${
                                selectedLocationLabel.text_rotation_deg === deg
                                  ? "border-fuchsia-500/55 bg-fuchsia-950/40 text-white"
                                  : "border-violet-800/45 text-violet-200/75 hover:bg-violet-950/35"
                              }`}
                            >
                              {short}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-violet-300/60">
                          Size ({selectedLocationLabel.size.toFixed(2)}×)
                        </label>
                        <input
                          type="range"
                          min={0.35}
                          max={3}
                          step={0.05}
                          value={selectedLocationLabel.size}
                          onChange={(e) =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, size: Number(e.target.value) }
                                  : x,
                              ),
                            }))
                          }
                          className="mt-0.5 w-full accent-fuchsia-500"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          aria-label="Label color"
                          value={colorInputHex(selectedLocationLabel.color)}
                          onChange={(e) =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, color: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                          className="h-7 w-9 shrink-0 cursor-pointer rounded border border-violet-700/50 bg-transparent p-0"
                        />
                        <input
                          type="text"
                          value={selectedLocationLabel.color}
                          onChange={(e) =>
                            setEditorMeta((m) => ({
                              ...m,
                              location_labels: m.location_labels.map((x) =>
                                x.id === selectedLocationLabel.id
                                  ? { ...x, color: e.target.value }
                                  : x,
                              ),
                            }))
                          }
                          className="input-field min-w-0 flex-1 py-1 font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {sidebarTab === "map-shape" && (
          <div>
            <span className="label">Map outline</span>
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setSidebarTab("map-shape");
                  setActiveLayer({ kind: "outline", holeIndex: null });
                  setSelection(null);
                }}
                onMouseEnter={() => setSidebarHoverHoleIndex(null)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  activeLayer.kind === "outline" &&
                  activeLayer.holeIndex === null
                    ? "border-violet-500/60 bg-violet-950/50 text-white"
                    : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                }`}
              >
                <Swords className="h-4 w-4 shrink-0" />
                Outer boundary (attack)
              </button>
              <details
                className="overflow-hidden rounded-lg border border-pink-800/35 bg-pink-950/15 [&[open]>summary_.chevron-ov]:rotate-90"
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-pink-100/95 hover:bg-pink-950/35 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="chevron-ov h-4 w-4 shrink-0 text-pink-400 transition-transform" />
                  <CircleSlash2 className="h-4 w-4 shrink-0 text-pink-300" />
                  <span className="min-w-0 flex-1">Holes</span>
                  <span className="font-mono text-xs font-normal text-violet-500">
                    {outlineHoles.length}
                  </span>
                </summary>
                <div
                  className="space-y-1 border-t border-pink-800/25 px-1 py-2"
                  onMouseLeave={() => setSidebarHoverHoleIndex(null)}
                >
                  {outlineHoles.map((hole, hi) => (
                    <div
                      key={`hole-layer-${hi}`}
                      onMouseEnter={() => {
                        setSidebarHoverOverlayId(null);
                        setSidebarHoverHoleIndex(hi);
                      }}
                      className={`flex items-center gap-1 rounded-lg transition-colors ${
                        activeLayer.kind === "outline" &&
                        activeLayer.holeIndex === hi
                          ? "border border-pink-500/35 bg-pink-950/20 p-1"
                          : "border border-transparent p-1 hover:bg-pink-950/35"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarTab("map-shape");
                          setActiveLayer({ kind: "outline", holeIndex: hi });
                          setSelection(null);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                          activeLayer.kind === "outline" &&
                          activeLayer.holeIndex === hi
                            ? "border-transparent bg-transparent text-white"
                            : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                        }`}
                      >
                        <span className="truncate tabular-nums text-pink-200/90">
                          #{hi + 1}
                        </span>
                        <span className="font-mono text-xs text-violet-500">
                          {hole.length} pts
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Remove hole"
                        onClick={() => removeOutlineHole(hi)}
                        className="shrink-0 rounded p-2 text-fuchsia-300 hover:bg-fuchsia-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addOutlineHole}
                    onMouseEnter={() => setSidebarHoverHoleIndex(null)}
                    disabled={!outlineReady}
                    title={
                      outlineReady
                        ? "Add a closed polygon that cuts out from the outline"
                        : "Define the outer outline first (≥3 points)"
                    }
                    className="btn-secondary inline-flex w-full items-center justify-center gap-1.5 text-xs disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add hole
                  </button>
                </div>
              </details>
            </div>
          </div>
          )}

          {sidebarTab === "objects" && (
          <div>
            <span className="label">Overlay layers</span>
            <div className="mt-2 space-y-1">
              <div
                className="space-y-2"
                onMouseLeave={() => {
                  setSidebarHoverOverlayId(null);
                  setSidebarHoverHoleIndex(null);
                }}
              >
                {OVERLAY_KIND_ORDER.map((kind) => {
                  const items = overlays
                    .filter((o) => o.kind === kind)
                    .sort((a, b) => {
                      const fa = overlayFloor(a) === "lower" ? 0 : 1;
                      const fb = overlayFloor(b) === "lower" ? 0 : 1;
                      return fa - fb;
                    });
                  if (items.length === 0) return null;
                  const sectionIcon =
                    kind === "obstacle" ? (
                      <Octagon className="h-4 w-4 shrink-0 text-amber-300" />
                    ) : kind === "elevation" ? (
                      <Mountain className="h-4 w-4 shrink-0 text-sky-300" />
                    ) : kind === "wall" ? (
                      <BrickWall className="h-4 w-4 shrink-0 text-slate-300" />
                    ) : kind === "plant_site" ? (
                      <Target className="h-4 w-4 shrink-0 text-red-400" />
                    ) : kind === "grade" ? (
                      <ArrowUpFromLine className="h-4 w-4 shrink-0 text-cyan-300" />
                    ) : kind === "breakable_doorway" ? (
                      <Hammer className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <DoorClosed className="h-4 w-4 shrink-0 text-indigo-300" />
                    );
                  const sectionTitle =
                    kind === "obstacle"
                      ? "Obstacles"
                      : kind === "elevation"
                        ? "Walkable space"
                        : kind === "wall"
                          ? "Walls"
                          : kind === "plant_site"
                            ? "Plant sites"
                            : kind === "grade"
                              ? "Grade lines"
                              : kind === "breakable_doorway"
                                ? "Breakable doorways"
                                : "Toggle doors";
                  return (
                    <details
                      key={kind}
                      className="overflow-hidden rounded-lg border border-violet-800/35 bg-slate-900/40 [&[open]>summary_.chevron-ov]:rotate-90"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-2 text-sm font-medium text-violet-100 hover:bg-violet-950/35 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="chevron-ov h-4 w-4 shrink-0 text-violet-400 transition-transform" />
                        {sectionIcon}
                        <span className="min-w-0 flex-1">{sectionTitle}</span>
                        <span className="font-mono text-xs font-normal text-violet-500">
                          {items.length}
                        </span>
                      </summary>
                      <div className="space-y-1 border-t border-violet-800/25 px-1 py-2">
                        {items.map((sh, idx) => {
                          const activeOv =
                            activeLayer.kind === "overlay" &&
                            activeLayer.id === sh.id;
                          const activeRing =
                            activeOv && sh.kind === "grade"
                              ? "rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-1"
                              : activeOv && sh.kind === "wall"
                                ? "rounded-lg border border-slate-500/40 bg-slate-900/25 p-1"
                                : activeOv && sh.kind === "plant_site"
                                  ? "rounded-lg border border-red-500/40 bg-red-950/25 p-1"
                                  : activeOv && sh.kind === "elevation"
                                    ? overlayFloor(sh) === "upper"
                                      ? "rounded-lg border border-sky-500/45 bg-sky-950/30 p-1"
                                      : "rounded-lg border border-amber-600/45 bg-amber-950/30 p-1"
                                    : activeOv &&
                                        sh.kind === "breakable_doorway"
                                    ? "rounded-lg border border-emerald-500/40 bg-emerald-950/25 p-1"
                                    : activeOv && sh.kind === "toggle_door"
                                      ? "rounded-lg border border-indigo-500/40 bg-indigo-950/25 p-1"
                                      : activeOv
                                        ? "rounded-lg border border-amber-500/40 bg-amber-950/20 p-1"
                                        : "";
                          return (
                            <div
                              key={sh.id}
                              className={`flex items-center gap-1 ${activeRing}`}
                              onMouseEnter={() => {
                                setSidebarHoverHoleIndex(null);
                                setSidebarHoverOverlayId(sh.id);
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setSidebarTab("objects");
                                  setEditorMeta((m) => ({
                                    ...m,
                                    active_floor: overlayFloor(sh),
                                  }));
                                  setActiveLayer({ kind: "overlay", id: sh.id });
                                  setSelection(null);
                                }}
                                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                                  activeLayer.kind === "overlay" &&
                                  activeLayer.id === sh.id
                                    ? "border-transparent bg-transparent text-white"
                                    : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                                }`}
                              >
                                <span className="truncate tabular-nums text-violet-300/90">
                                  #{idx + 1}
                                </span>
                                <span
                                  className={
                                    sh.kind === "elevation"
                                      ? overlayFloor(sh) === "upper"
                                        ? "shrink-0 rounded border border-sky-500/50 px-1 font-mono text-[10px] uppercase text-sky-200/90"
                                        : "shrink-0 rounded border border-amber-600/50 px-1 font-mono text-[10px] uppercase text-amber-200/90"
                                      : "shrink-0 rounded border border-violet-600/45 px-1 font-mono text-[10px] uppercase text-violet-300/85"
                                  }
                                  title={
                                    overlayFloor(sh) === "upper"
                                      ? sh.kind === "elevation"
                                        ? "Upper walkable (heaven) — cool sky tones on map"
                                        : "Upper floor (drawn above lower in this view)"
                                      : sh.kind === "elevation"
                                        ? "Lower walkable (ground) — warm tones on map"
                                        : "Lower floor"
                                  }
                                >
                                  {overlayFloor(sh) === "upper" ? "U" : "L"}
                                </span>
                                <span className="font-mono text-xs text-violet-500">
                                  {isCircleOverlay(sh)
                                    ? "circle"
                                    : `${sh.points.length} pts`}
                                </span>
                              </button>
                              <button
                                type="button"
                                title="Remove layer"
                                onClick={() => removeOverlay(sh.id)}
                                className="shrink-0 rounded p-2 text-fuchsia-300 hover:bg-fuchsia-950/40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addOverlay("obstacle")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Add an obstacle polygon"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Octagon className="h-3.5 w-3.5" />
                Obstacle
              </button>
              <button
                type="button"
                onClick={() => addOverlay("elevation")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Walkable footprint on the active floor: lower = warm ground, upper = cool sky (heaven/hell style). Uses Lower/Upper toggles."
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Mountain className="h-3.5 w-3.5" />
                Elevation
              </button>
              <button
                type="button"
                onClick={() => addOverlay("wall")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Add a wall or solid barrier polygon"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <BrickWall className="h-3.5 w-3.5" />
                Wall
              </button>
              <button
                type="button"
                onClick={() => addOverlay("plant_site")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Closed polygon: plantable site / spike zone border (dashed, attacker color)"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Target className="h-3.5 w-3.5" />
                Plant site
              </button>
              <button
                type="button"
                onClick={() => addOverlay("grade")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Step-edge polyline: higher vs lower ground along each segment"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <ArrowUpFromLine className="h-3.5 w-3.5" />
                Grade
              </button>
              <button
                type="button"
                onClick={() => addOverlay("breakable_doorway")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Breakable doorway: open polyline along the opening (does not auto-close)"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Hammer className="h-3.5 w-3.5" />
                Breakable doorway
              </button>
              <button
                type="button"
                onClick={() => addOverlay("toggle_door")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Toggle door: polyline for door width; use sidebar to flip open vs closed"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <DoorClosed className="h-3.5 w-3.5" />
                Toggle door
              </button>
            </div>
            {activeLayer.kind === "overlay" &&
              overlays.find((o) => o.id === activeLayer.id)?.kind ===
                "grade" && (
                <button
                  type="button"
                  onClick={flipGradeHighSide}
                  className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs"
                  title="Swap which side of the segment is higher ground (left vs right of the line direction)"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Flip higher side
                </button>
              )}
            {activeLayer.kind === "overlay" &&
              overlays.find((o) => o.id === activeLayer.id)?.kind ===
                "toggle_door" && (
                <button
                  type="button"
                  onClick={toggleDoorOpen}
                  className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs"
                  title="Switch between closed (solid) and open (dashed) door visualization"
                >
                  {overlays.find((o) => o.id === activeLayer.id)
                    ?.door_is_open === true ? (
                    <>
                      <DoorOpen className="h-3.5 w-3.5" />
                      Mark door closed
                    </>
                  ) : (
                    <>
                      <DoorClosed className="h-3.5 w-3.5" />
                      Mark door open
                    </>
                  )}
                </button>
              )}
            {activeLayer.kind === "overlay" &&
              (() => {
                const ao = overlays.find((o) => o.id === activeLayer.id);
                if (!ao) return null;
                const dest =
                  overlayFloor(ao) === "lower" ? "upper" : "lower";
                return (
                  <button
                    type="button"
                    onClick={moveActiveOverlayToOtherFloor}
                    className="btn-secondary mt-2 inline-flex w-full items-center justify-center gap-1.5 text-xs"
                    title="Move this overlay to the other vertical level (same geometry, different floor tag)"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Move to {dest} floor
                  </button>
                );
              })()}
            {!outlineReady && (
              <p className="mt-2 text-xs text-amber-200/70">
                Close the purple outline (≥3 points) before adding overlays.
              </p>
            )}
          </div>
          )}

          {tool === "edit" &&
            (sidebarTab === "map-shape" || sidebarTab === "objects") && (
            <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-950/60 p-3">
              <span className="label flex items-center gap-1">
                <BoxSelect className="h-3.5 w-3.5" />
                Selection
              </span>
              <p className="text-xs text-violet-300/55">
                Click near an edge to add a vertex on that segment (including
                grade polylines). Right-click a vertex to remove it. Shift+click
                vertices to multi-select. Two or more: align axes (buttons or{" "}
                <kbd className="rounded border border-violet-700/50 bg-violet-950/60 px-1">
                  Ctrl
                </kbd>
                +
                <kbd className="rounded border border-violet-700/50 bg-violet-950/60 px-1">
                  Shift
                </kbd>
                +
                <kbd className="rounded border border-violet-700/50 bg-violet-950/60 px-1">
                  V
                </kbd>
                /
                <kbd className="rounded border border-violet-700/50 bg-violet-950/60 px-1">
                  H
                </kbd>
                ). For grade layers, use Flip higher side in the sidebar. Delete /
                Backspace removes selected vertices.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canAlign}
                  onClick={alignVertical}
                  className="btn-secondary text-xs disabled:opacity-40"
                  title="Same x (vertical line through points). Shortcut: Ctrl+Shift+V"
                >
                  Vertical sync
                </button>
                <button
                  type="button"
                  disabled={!canAlign}
                  onClick={alignHorizontal}
                  className="btn-secondary text-xs disabled:opacity-40"
                  title="Same y (horizontal line through points). Shortcut: Ctrl+Shift+H"
                >
                  Horizontal sync
                </button>
              </div>
            </div>
          )}

          {(sidebarTab === "map-shape" || sidebarTab === "objects") && (
            <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={undoPoint}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              <Undo2 className="h-4 w-4" />
              Undo point
            </button>
            <button
              type="button"
              onClick={clearActiveShape}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Clear layer
            </button>
          </div>

          <p className="text-xs text-violet-300/45">
            Active layer:{" "}
            <strong className="text-violet-200">
              {activeLayer.kind === "outline"
                ? activeLayer.holeIndex === null
                  ? "Outer"
                  : `Hole ${activeLayer.holeIndex + 1}`
                : activeOverlayKindLabel}
            </strong>{" "}
            · {activeCount} pts
          </p>
            </>
          )}

          {sidebarTab === "map-shape" && (
          <>
          <div className="border-t border-violet-800/40 pt-4">
            <span className="label">Image transform</span>
            <label className="mt-2 block text-xs text-violet-300/55">
              Scale ({transform.scale.toFixed(2)}x)
            </label>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={transform.scale}
              onChange={(e) =>
                setTransform((t) => ({
                  ...t,
                  scale: Number(e.target.value),
                }))
              }
              className="mt-1 w-full accent-violet-500"
            />
            <label className="mt-3 block text-xs text-violet-300/55">
              Pan X
            </label>
            <input
              type="range"
              min={-500}
              max={500}
              step={1}
              value={transform.tx}
              onChange={(e) =>
                setTransform((t) => ({ ...t, tx: Number(e.target.value) }))
              }
              className="mt-1 w-full accent-violet-500"
            />
            <label className="mt-3 block text-xs text-violet-300/55">
              Pan Y
            </label>
            <input
              type="range"
              min={-500}
              max={500}
              step={1}
              value={transform.ty}
              onChange={(e) =>
                setTransform((t) => ({ ...t, ty: Number(e.target.value) }))
              }
              className="mt-1 w-full accent-violet-500"
            />
          </div>

          <div>
            <label className="label" htmlFor="viewbox">
              View box (advanced)
            </label>
            <input
              id="viewbox"
              value={viewBox}
              onChange={(e) => setViewBox(e.target.value)}
              className="input-field mt-1 font-mono text-xs"
              placeholder="0 0 1000 1000"
            />
          </div>
          </>
          )}
        </aside>
      </div>

      {saveToast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[100] flex max-w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            saveToast.kind === "ok"
              ? "border-emerald-600/50 bg-emerald-950/95 text-emerald-50"
              : "border-red-600/50 bg-red-950/95 text-red-50"
          }`}
        >
          {saveToast.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          )}
          <span>{saveToast.msg}</span>
        </div>
      )}
    </div>
  );
}
