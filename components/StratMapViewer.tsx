"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import type {
  GameMap,
  MapFloorId,
  MapOverlayKind,
  MapOverlayShape,
} from "@/types/catalog";
import type { StratSide, StratStageLayerVisibility } from "@/types/strat";
import { mapLabelTextSvgProps } from "@/lib/map-label-layout";
import {
  circleToGradeClosedPoints,
  isCircleOverlay,
} from "@/lib/map-overlay-geometry";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import { outlinePathForStratDisplay } from "@/lib/map-strat-side";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import {
  mapGeometryGroupTransform,
  mapGeometryScaleFromEditorMeta,
} from "@/lib/map-geometry-scale";
import { clientToSvgPoint } from "@/lib/svg-coords";
import type { MapPoint, ViewBoxRect } from "@/lib/map-path";
import { RopeOverlaySvg } from "@/components/RopeOverlaySvg";
import { MAP_VIEW_VECTOR_STROKE_SCALE } from "@/lib/map-view-stroke-scale";
import { normalizeStratStageLayerVisibility } from "@/lib/strat-stage-layer-visibility";

/** Read-only map overlay rendering (aligned with `MapShapeEditor` colors). */
const SPAWN_ATK_FILL = "#ff3e3e";
const SPAWN_ATK_STROKE = "#ffffff";
const SPAWN_DEF_FILL = "#2563eb";
const SPAWN_DEF_STROKE = "#ffffff";

const BREAKABLE_DOORWAY_STROKE = "rgb(16, 185, 129)";
const SPAWN_BARRIER_STROKE = "rgb(244, 114, 182)";

const WALKABLE_LOWER_FILL = "rgba(120,53,18,0.22)";
const WALKABLE_LOWER_STROKE = "rgb(234,88,12)";
const WALKABLE_UPPER_FILL = "rgba(14,165,233,0.24)";
const WALKABLE_UPPER_STROKE = "rgb(56,189,248)";
const TERRITORY_OUTLINE_FILL = "rgba(167,139,250,0.12)";
const TERRITORY_OUTLINE_STROKE = "rgb(167,139,250)";

function overlayFloor(sh: MapOverlayShape): MapFloorId {
  return sh.floor === "upper" ? "upper" : "lower";
}

function walkableElevationPolygonStyle(
  floor: MapFloorId,
): { fill: string; stroke: string } {
  return floor === "upper"
    ? { fill: WALKABLE_UPPER_FILL, stroke: WALKABLE_UPPER_STROKE }
    : { fill: WALKABLE_LOWER_FILL, stroke: WALKABLE_LOWER_STROKE };
}

function isOpenPolylineOverlayKind(kind: MapOverlayKind): boolean {
  return (
    kind === "grade" ||
    kind === "breakable_doorway" ||
    kind === "toggle_door" ||
    kind === "rope" ||
    kind === "spawn_barrier"
  );
}

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

function overlayPolygonStyle(
  kind: MapOverlayKind,
  floor: MapFloorId = "lower",
  muted = false,
): { fill: string; stroke: string } | null {
  switch (kind) {
    case "obstacle":
      if (muted) {
        return { fill: TERRITORY_OUTLINE_FILL, stroke: TERRITORY_OUTLINE_STROKE };
      }
      return { fill: "rgba(251,191,36,0.14)", stroke: "rgb(251,191,36)" };
    case "elevation":
      return walkableElevationPolygonStyle(floor);
    case "wall":
      return { fill: "rgba(148,163,184,0.18)", stroke: "rgb(148,163,184)" };
    case "plant_site":
      return {
        fill: "rgba(255,62,62,0.09)",
        stroke: SPAWN_ATK_FILL,
      };
    case "grade":
      return null;
    default:
      return null;
  }
}

function GradeOverlaySvg({
  sh,
  vbWidth,
}: {
  sh: MapOverlayShape;
  vbWidth: number;
}) {
  const pts =
    isCircleOverlay(sh) && sh.circle
      ? circleToGradeClosedPoints(sh.circle)
      : sh.points;
  const sw = vbWidth * 0.0035 * MAP_VIEW_VECTOR_STROKE_SCALE;
  const side = sh.gradeHighSide ?? 1;
  const lineStroke = "rgb(34,211,238)";
  const spikeFill = "rgba(34,211,238,0.92)";
  const dotFill = "rgba(34,211,238,0.35)";
  const dotStroke = "rgb(34,211,238)";
  const spikeDepth = vbWidth * 0.01;
  const spikeHalfW = vbWidth * 0.0032;
  const spacing = vbWidth * 0.036;

  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const p = pts[0]!;
    const r = vbWidth * 0.008;
    return (
      <g pointerEvents="none">
        <circle
          cx={p.x}
          cy={p.y}
          r={r}
          fill={dotFill}
          stroke={dotStroke}
          strokeWidth={sw}
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
              strokeWidth={sw * 1.2}
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

function DoorwayOverlaySvg({
  sh,
  vbWidth,
}: {
  sh: MapOverlayShape;
  vbWidth: number;
}) {
  const pts = sh.points;
  const swBase = vbWidth * 0.0038 * MAP_VIEW_VECTOR_STROKE_SCALE;

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
    return (
      <path
        d={d}
        fill="none"
        stroke={BREAKABLE_DOORWAY_STROKE}
        strokeWidth={swBase}
        strokeDasharray="6 4 2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
    );
  }

  const open = sh.door_is_open === true;
  const stroke = open ? "rgb(129,140,248)" : "rgb(79,70,229)";
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

export type StratMapLayerVisibility = {
  /** Outer playable ring and holes (saved `path_atk` / `path_def`). */
  territoryOutline: boolean;
  labels: boolean;
  spawnAtk: boolean;
  spawnDef: boolean;
  floorLower: boolean;
  floorUpper: boolean;
  obstacle: boolean;
  elevation: boolean;
  wall: boolean;
  plant_site: boolean;
  grade: boolean;
  breakable_doorway: boolean;
  toggle_door: boolean;
  rope: boolean;
  spawn_barrier: boolean;
};

const DEFAULT_VISIBILITY: StratMapLayerVisibility = {
  territoryOutline: true,
  labels: false,
  spawnAtk: true,
  spawnDef: true,
  floorLower: true,
  floorUpper: true,
  obstacle: false,
  elevation: false,
  wall: true,
  plant_site: true,
  grade: true,
  breakable_doorway: true,
  toggle_door: true,
  rope: true,
  spawn_barrier: true,
};

const MAP_VIEWPORT_MIN_H_PX = 200;
const MAP_VIEWPORT_MAX_DVH = 85;

type PanDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startView: ViewBoxRect;
  userPerPxX: number;
  userPerPxY: number;
};

function assignSvgRef(
  r: Ref<SVGSVGElement> | undefined,
  node: SVGSVGElement | null,
) {
  if (!r) return;
  if (typeof r === "function") r(node);
  else (r as { current: SVGSVGElement | null }).current = node;
}

function overlayVisible(
  sh: MapOverlayShape,
  vis: StratMapLayerVisibility,
): boolean {
  if (sh.kind !== "obstacle" && !vis[sh.kind]) return false;
  const f = overlayFloor(sh);
  if (f === "lower" && !vis.floorLower) return false;
  if (f === "upper" && !vis.floorUpper) return false;
  return true;
}

export type StratMapViewerProps = {
  gameMap: GameMap;
  side: StratSide;
  /** Extra SVG nodes drawn above map layers (e.g. strat stage pins). */
  children?: ReactNode;
  /** When false, the checkbox strip is hidden. */
  showLayerToggles?: boolean;
  /** When false, hides the zoom hint / Map shapes link below the SVG. */
  showFooter?: boolean;
  /**
   * Stretch the map to fill a flex parent (coach strat editor). Keeps wheel zoom
   * and right-drag pan behavior.
   */
  embed?: boolean;
  /** Initial layer visibility (e.g. stage-specific saved filters). */
  initialVisibility?: Partial<StratStageLayerVisibility>;
  /** Called when a layer checkbox is toggled. */
  onVisibilityChange?: (next: StratMapLayerVisibility) => void;
  /** Change this to reset visibility from `initialVisibility` (e.g. stage id). */
  visibilityScopeKey?: string;
};

export const StratMapViewer = forwardRef<SVGSVGElement, StratMapViewerProps>(
  function StratMapViewer(
    {
      gameMap,
      side,
      children,
      showLayerToggles = true,
      showFooter = true,
      embed = false,
      initialVisibility,
      onVisibilityChange,
      visibilityScopeKey,
    },
    ref,
  ) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<ViewBoxRect>({
    minX: 0,
    minY: 0,
    width: 1,
    height: 1,
  });
  const panDragRef = useRef<PanDragState | null>(null);

  const [vis, setVis] = useState<StratMapLayerVisibility>(() =>
    normalizeStratStageLayerVisibility(initialVisibility),
  );
  const effectiveVis = vis;
  /** Zoom/pan window in SVG user units (editor-style; not persisted). */
  const [viewport, setViewport] = useState<ViewBoxRect | null>(null);
  const [rightPanning, setRightPanning] = useState(false);

  const setSvgRef = useCallback(
    (node: SVGSVGElement | null) => {
      svgRef.current = node;
      assignSvgRef(ref, node);
    },
    [ref],
  );

  const { vb, overlays, spawn_markers, location_labels } = useMemo(
    () => stratMapDisplayData(gameMap, side),
    [gameMap, side],
  );

  const mapGeoScale = mapGeometryScaleFromEditorMeta(
    normalizeEditorMeta(gameMap.editor_meta),
  );
  const geometryGroupTransform = useMemo(
    () => mapGeometryGroupTransform(vb, mapGeoScale),
    [vb, mapGeoScale],
  );

  canvasRef.current = vb;
  const displayVb = viewport ?? vb;
  const vbStr = `${displayVb.minX} ${displayVb.minY} ${displayVb.width} ${displayVb.height}`;

  const territoryPathD = useMemo(
    () => outlinePathForStratDisplay(gameMap, side),
    [gameMap, side],
  );

  useEffect(() => {
    setViewport(null);
  }, [gameMap.id, side]);

  useEffect(() => {
    setVis(normalizeStratStageLayerVisibility(initialVisibility));
  }, [initialVisibility, visibilityScopeKey]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const pt = clientToSvgPoint(el, e.clientX, e.clientY);
      const zoomIn = e.deltaY < 0;
      setViewport((prev) => {
        const cur: ViewBoxRect = prev ?? {
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

  const onSvgPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (e.button === 2) {
        e.preventDefault();
        if (!viewport) return;
        const svg = svgRef.current;
        if (!svg) return;
        const cur = viewport;
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
      }
    },
    [viewport],
  );

  const onSvgPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      const pan = panDragRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      e.preventDefault();
      const dxPx = e.clientX - pan.startClientX;
      const dyPx = e.clientY - pan.startClientY;
      const dxUser = dxPx * pan.userPerPxX;
      const dyUser = dyPx * pan.userPerPxY;
      const canvas = canvasRef.current;
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
    (e: PointerEvent<SVGSVGElement>) => {
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

  const overlaysSorted = useMemo(() => {
    return [...overlays].sort((a, b) => {
      const fa = overlayFloor(a) === "lower" ? 0 : 1;
      const fb = overlayFloor(b) === "lower" ? 0 : 1;
      return fa - fb;
    });
  }, [overlays]);

  const annMarkerR = vb.width * 0.014;
  const labelFontSize = vb.width * 0.026;
  const strokeOutBase = vb.width * 0.0022 * MAP_VIEW_VECTOR_STROKE_SCALE;

  const toggleRow = (
    id: keyof StratMapLayerVisibility,
    label: string,
  ) => (
    <label
      key={id}
      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-violet-800/40 bg-slate-950/60 px-2 py-1.5 text-xs text-violet-100/90 hover:border-violet-600/50"
    >
      <input
        type="checkbox"
        className="rounded border-violet-600/60"
        checked={vis[id]}
        onChange={(e) =>
          setVis((v) => {
            const next = { ...v, [id]: e.target.checked };
            onVisibilityChange?.(next);
            return next;
          })
        }
      />
      {label}
    </label>
  );

  return (
    <div
      className={
        embed
          ? "flex h-full min-h-0 flex-col gap-2"
          : "space-y-3"
      }
    >
      {showLayerToggles ? (
        <div className="flex flex-wrap gap-2">
          {toggleRow("territoryOutline", "Playable outline")}
          {toggleRow("labels", "Labels")}
          {toggleRow("spawnAtk", "Spawns · Attack")}
          {toggleRow("spawnDef", "Spawns · Defense")}
          {toggleRow("floorLower", "Floor · Lower")}
          {toggleRow("floorUpper", "Floor · Upper")}
          {toggleRow("obstacle", "Obstacle emphasis")}
          {toggleRow("elevation", "Walkable zones")}
          {toggleRow("wall", "Walls")}
          {toggleRow("plant_site", "Plant sites")}
          {toggleRow("grade", "Grade")}
          {toggleRow("breakable_doorway", "Breakable doors")}
          {toggleRow("toggle_door", "Toggle doors")}
          {toggleRow("rope", "Ropes / ziplines")}
          {toggleRow("spawn_barrier", "Spawn barriers")}
        </div>
      ) : null}

      <div
        className={
          embed
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-violet-500/25 bg-slate-950/80"
            : "overflow-hidden rounded-xl border border-violet-500/25 bg-slate-950/80"
        }
        style={
          embed
            ? { width: "100%", minHeight: 0 }
            : {
                width: "100%",
                maxHeight: `${MAP_VIEWPORT_MAX_DVH}dvh`,
              }
        }
      >
        <svg
          ref={setSvgRef}
          tabIndex={-1}
          viewBox={vbStr}
          className={`w-full select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
            embed ? "block h-full min-h-[min(56dvh,720px)]" : "h-auto"
          } ${rightPanning ? "cursor-grabbing" : "cursor-crosshair"}`}
          style={
            embed
              ? {
                  minHeight: MAP_VIEWPORT_MIN_H_PX,
                  maxHeight: "100%",
                }
              : {
                  minHeight: MAP_VIEWPORT_MIN_H_PX,
                  maxHeight: `${MAP_VIEWPORT_MAX_DVH}dvh`,
                }
          }
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Map preview (${side === "atk" ? "attack" : "defense"} view). Vector layers from the map editor.`}
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
          <title>
            Map layers for {gameMap.name} — {side === "atk" ? "attack" : "defense"}{" "}
            perspective
          </title>
          <rect
            x={vb.minX}
            y={vb.minY}
            width={vb.width}
            height={vb.height}
            fill="rgb(15,23,42)"
          />

          <g transform={geometryGroupTransform}>
          {effectiveVis.territoryOutline &&
            territoryPathD &&
            territoryPathD.trim().length > 0 && (
              <path
                d={territoryPathD}
                fill={TERRITORY_OUTLINE_FILL}
                fillRule="evenodd"
                stroke={TERRITORY_OUTLINE_STROKE}
                strokeWidth={vb.width * 0.004 * MAP_VIEW_VECTOR_STROKE_SCALE}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}

          <g style={{ pointerEvents: "none" }}>
            {overlaysSorted.map((sh) => {
              if (!overlayVisible(sh, effectiveVis)) return null;
              const vbW = vb.width;
              if (
                sh.kind === "breakable_doorway" ||
                sh.kind === "toggle_door"
              ) {
                return (
                  <g key={sh.id}>
                    <DoorwayOverlaySvg sh={sh} vbWidth={vbW} />
                  </g>
                );
              }
              if (sh.kind === "rope") {
                return (
                  <g key={sh.id}>
                    <RopeOverlaySvg sh={sh} vbWidth={vbW} />
                  </g>
                );
              }
              if (sh.kind === "spawn_barrier") {
                const pts = sh.points;
                if (pts.length === 0) return null;
                if (pts.length === 1) {
                  const p = pts[0]!;
                  return (
                    <circle
                      key={sh.id}
                      cx={p.x}
                      cy={p.y}
                      r={vbW * 0.006}
                      fill={SPAWN_BARRIER_STROKE}
                    />
                  );
                }
                const d = pts
                  .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                  .join(" ");
                return (
                  <path
                    key={sh.id}
                    d={d}
                    fill="none"
                    stroke={SPAWN_BARRIER_STROKE}
                    strokeWidth={vbW * 0.0042 * MAP_VIEW_VECTOR_STROKE_SCALE}
                    strokeDasharray="12 8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.9}
                  />
                );
              }
              if (sh.kind === "grade") {
                return (
                  <g key={sh.id}>
                    <GradeOverlaySvg sh={sh} vbWidth={vbW} />
                  </g>
                );
              }
              if (isCircleOverlay(sh) && sh.circle) {
                const poly = overlayPolygonStyle(sh.kind, overlayFloor(sh));
                if (!poly) return null;
                const c = sh.circle;
                return (
                  <g key={sh.id}>
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      fill={poly.fill}
                      stroke={poly.stroke}
                      strokeWidth={vbW * 0.003 * MAP_VIEW_VECTOR_STROKE_SCALE}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              }
              const d = previewOverlayStrokePath(sh.kind, sh.points);
              if (!d) return null;
              const poly = overlayPolygonStyle(
                sh.kind,
                overlayFloor(sh),
                sh.kind === "obstacle" && !effectiveVis.obstacle,
              );
              if (!poly) return null;
              return (
                <g key={sh.id}>
                  <path
                    d={d}
                    fill={poly.fill}
                    stroke={poly.stroke}
                    strokeWidth={vbW * 0.003 * MAP_VIEW_VECTOR_STROKE_SCALE}
                    strokeLinejoin="round"
                    strokeDasharray={
                      sh.kind === "plant_site" ? "9 6" : undefined
                    }
                  />
                </g>
              );
            })}
          </g>

          <g style={{ pointerEvents: "none" }}>
            {spawn_markers.map((s) => {
              if (s.side === "atk" && !effectiveVis.spawnAtk) return null;
              if (s.side === "def" && !effectiveVis.spawnDef) return null;
              const atk = s.side === "atk";
              const fill = atk ? SPAWN_ATK_FILL : SPAWN_DEF_FILL;
              const stroke = atk ? SPAWN_ATK_STROKE : SPAWN_DEF_STROKE;
              return (
                <circle
                  key={`spawn-${s.id}`}
                  cx={s.x}
                  cy={s.y}
                  r={annMarkerR}
                  fill={fill}
                  fillOpacity={0.95}
                  stroke={stroke}
                  strokeWidth={strokeOutBase * 0.85}
                />
              );
            })}
          </g>

          {effectiveVis.labels ? (
            <g style={{ pointerEvents: "none" }}>
              {location_labels.map((l) => {
                const fs = labelFontSize * l.size;
                const pinR = annMarkerR * l.size * 0.55;
                const strokeOut = fs * 0.08 * MAP_VIEW_VECTOR_STROKE_SCALE;
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
                const textRotate =
                  rot !== 0 && Number.isFinite(rot)
                    ? `translate(${tp.x},${tp.y}) rotate(${rot}) translate(${-tp.x},${-tp.y})`
                    : undefined;
                if (l.style === "text") {
                  return (
                    <text
                      key={`label-${l.id}`}
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
                      }}
                    >
                      {l.text}
                    </text>
                  );
                }
                return (
                  <g key={`label-${l.id}`}>
                    <circle
                      cx={l.x}
                      cy={l.y}
                      r={pinR}
                      fill={fill}
                      fillOpacity={0.95}
                      stroke="rgba(255,255,255,0.92)"
                      strokeWidth={strokeOutBase * 0.75 * l.size}
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
                      }}
                    >
                      {l.text}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}

          {children}
          </g>
        </svg>
      </div>
      {showFooter ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed text-violet-400/45">
            Wheel: zoom · Right-drag: pan (when zoomed). Reference art stays in the
            editor. Edit vectors on{" "}
            <a
              href={`/coach/maps/${gameMap.id}`}
              className="text-violet-300/80 underline underline-offset-2 hover:text-violet-200"
            >
              Map shapes
            </a>
            .
          </p>
          {viewport ? (
            <button
              type="button"
              onClick={() => setViewport(null)}
              className="shrink-0 rounded-md border border-violet-700/50 bg-slate-950/80 px-2 py-1 text-[11px] font-medium text-violet-200 hover:border-violet-500/50 hover:bg-violet-950/50"
            >
              Reset zoom
            </button>
          ) : null}
        </div>
      ) : viewport ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setViewport(null)}
            className="shrink-0 rounded-md border border-violet-700/50 bg-slate-950/80 px-2 py-1 text-[11px] font-medium text-violet-200 hover:border-violet-500/50 hover:bg-violet-950/50"
          >
            Reset zoom
          </button>
        </div>
      ) : null}
    </div>
  );
  },
);

StratMapViewer.displayName = "StratMapViewer";
