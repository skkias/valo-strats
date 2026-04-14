"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentAbilityBlueprint, AgentAbilityGeometry } from "@/types/agent-ability";
import {
  effectivePointMarkStyle,
  effectivePointMarkSymbolId,
} from "@/lib/point-blueprint-mark";
import { PointMarkSymbolGraphic } from "@/components/PointBlueprintMarkDraw";
import type { MapPoint } from "@/lib/map-path";
import { clientToSvgPoint } from "@/lib/svg-coords";
import {
  clampBlueprintPoint,
  clampBlueprintPointExtended,
  snapBlueprintPoint,
  snapBlueprintPointExtended,
} from "@/lib/blueprint-canvas-snap";
import {
  BLUEPRINT_CANVAS_SIZE,
  BLUEPRINT_EDITOR_COORD_MAX,
  BLUEPRINT_GEOMETRY_LENGTH_MAX,
} from "@/lib/agent-ability-blueprint-scale";

const HR = 0.018;
const MAX = BLUEPRINT_CANVAS_SIZE;
const RECT_EXTENT_MAX = BLUEPRINT_EDITOR_COORD_MAX;

function clampRadiusGeom(r: number): number {
  return Math.min(BLUEPRINT_GEOMETRY_LENGTH_MAX, Math.max(6, r));
}

type DragCtx = {
  handleId: string;
  startPointer: MapPoint;
  startGeom: AgentAbilityGeometry;
};

function normalizeSweepDeg(sweep: number): number {
  let s = sweep;
  while (s > 180) s -= 360;
  while (s < -180) s += 360;
  return s;
}

export function BlueprintShapeHandles({
  blueprint,
  vb,
  svgRef,
  snapStep,
  pointDisplayIconUrl,
  onChange,
}: {
  blueprint: AgentAbilityBlueprint;
  vb: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  snapStep: number;
  pointDisplayIconUrl?: string | null;
  onChange: (g: AgentAbilityGeometry) => void;
}) {
  const dragCtx = useRef<DragCtx | null>(null);
  const geom = blueprint.geometry;
  const [pointIconFailed, setPointIconFailed] = useState(false);
  /** Latest geometry while dragging (poly vertex drags need fresh points). */
  const liveGeomRef = useRef(geom);
  liveGeomRef.current = geom;

  useEffect(() => {
    setPointIconFailed(false);
  }, [blueprint.id, pointDisplayIconUrl]);

  const pointerToBlueprintPoint = useCallback(
    (clientX: number, clientY: number, extended: boolean): MapPoint => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const raw = clientToSvgPoint(el, clientX, clientY);
      const base = extended
        ? clampBlueprintPointExtended(raw)
        : clampBlueprintPoint(raw);
      if (snapStep <= 0) return base;
      return extended
        ? snapBlueprintPointExtended(base, snapStep)
        : snapBlueprintPoint(base, snapStep);
    },
    [svgRef, snapStep],
  );

  const pushGeom = useCallback(
    (next: AgentAbilityGeometry) => {
      onChange(next);
    },
    [onChange],
  );

  const finishDrag = useCallback(() => {
    dragCtx.current = null;
  }, []);

  useEffect(() => {
    function onUp() {
      finishDrag();
    }
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [finishDrag]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const ctx = dragCtx.current;
      if (!ctx) return;
      const extended =
        (ctx.handleId === "mov-b" &&
          (ctx.startGeom.kind === "movement" ||
            ctx.startGeom.kind === "ricochet")) ||
        (ctx.startGeom.kind === "ray" &&
          (ctx.handleId === "ray-a" ||
            ctx.handleId === "ray-b" ||
            ctx.handleId === "ray-c"));
      const p = pointerToBlueprintPoint(e.clientX, e.clientY, extended);
      const next = computeDraggedGeometry(
        ctx.handleId,
        ctx.startGeom,
        liveGeomRef.current,
        p,
        ctx.startPointer,
      );
      if (next) pushGeom(next);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [pushGeom, pointerToBlueprintPoint]);

  function beginDrag(
    e: React.PointerEvent,
    handleId: string,
    startGeom: AgentAbilityGeometry,
  ) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const extended =
      (handleId === "mov-b" &&
        (startGeom.kind === "movement" || startGeom.kind === "ricochet")) ||
      (startGeom.kind === "ray" &&
        (handleId === "ray-a" || handleId === "ray-b" || handleId === "ray-c"));
    dragCtx.current = {
      handleId,
      startPointer: pointerToBlueprintPoint(e.clientX, e.clientY, extended),
      startGeom,
    };
  }

  const stroke = blueprint.color;
  const fill = blueprint.color;
  const r = vb * HR;

  const handleEl = (
    cx: number,
    cy: number,
    handleId: string,
    startGeom: AgentAbilityGeometry,
  ) => (
    <circle
      key={handleId}
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke={stroke}
      strokeWidth={vb * 0.002}
      className="cursor-grab touch-none active:cursor-grabbing"
      style={{ pointerEvents: "auto" }}
      onPointerDown={(e) => beginDrag(e, handleId, startGeom)}
    />
  );

  switch (geom.kind) {
    case "point":
      {
        const markStyle = effectivePointMarkStyle(blueprint);
        const iconScale = Math.min(
          3,
          Math.max(0.12, blueprint.pointIconScale ?? 1),
        );
        const symScale = (vb * 0.019 * iconScale) / 12;
        const iconUrl =
          markStyle === "ability_icon" &&
          typeof pointDisplayIconUrl === "string" &&
          pointDisplayIconUrl.startsWith("http") &&
          !pointIconFailed
            ? pointDisplayIconUrl
            : null;
        const iconSize = vb * 0.05;
        const half = iconSize / 2;
        const hitR =
          markStyle === "symbol"
            ? Math.max(r * 1.35, vb * 0.028 * iconScale)
            : Math.max(r * 1.25, iconUrl ? half * 0.95 : r);
        return (
          <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
            <g
              className="cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={(e) => beginDrag(e, "point", geom)}
            >
              {iconUrl ? (
                <image
                  href={iconUrl}
                  x={geom.x - half}
                  y={geom.y - half}
                  width={iconSize}
                  height={iconSize}
                  preserveAspectRatio="xMidYMid meet"
                  onError={() => setPointIconFailed(true)}
                  style={{ pointerEvents: "none" }}
                />
              ) : markStyle === "symbol" ? (
                <g
                  transform={`translate(${geom.x},${geom.y}) scale(${symScale})`}
                  style={{ pointerEvents: "none" }}
                >
                  <PointMarkSymbolGraphic
                    symbolId={effectivePointMarkSymbolId(blueprint)}
                    stroke={stroke}
                    swMap={vb * 0.004}
                  />
                </g>
              ) : (
                <circle
                  cx={geom.x}
                  cy={geom.y}
                  r={r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={vb * 0.002}
                  style={{ pointerEvents: "none" }}
                />
              )}
              {iconUrl ? (
                <circle
                  cx={geom.x}
                  cy={geom.y}
                  r={half * 0.72}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={vb * 0.002}
                  style={{ pointerEvents: "none" }}
                />
              ) : markStyle === "dot" || (markStyle === "ability_icon" && !iconUrl) ? (
                <circle
                  cx={geom.x}
                  cy={geom.y}
                  r={r}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={vb * 0.002}
                  style={{ pointerEvents: "none" }}
                />
              ) : null}
              <circle
                cx={geom.x}
                cy={geom.y}
                r={hitR}
                fill="transparent"
              />
            </g>
          </g>
        );
      }
    case "circle": {
      const { cx, cy, r: rad } = geom;
      const rimX = cx + rad;
      const rimY = cy;
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(cx, cy, "circ-c", geom)}
          {handleEl(rimX, rimY, "circ-rim", geom)}
        </g>
      );
    }
    case "ray":
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(geom.x1, geom.y1, "ray-a", geom)}
          {handleEl(geom.x2, geom.y2, "ray-b", geom)}
          {geom.curve
            ? handleEl(geom.curve.cx, geom.curve.cy, "ray-c", geom)
            : null}
        </g>
      );
    case "movement":
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(geom.ax, geom.ay, "mov-a", geom)}
          {handleEl(geom.bx, geom.by, "mov-b", geom)}
        </g>
      );
    case "ricochet":
      return null;
    case "cone":
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(geom.ox, geom.oy, "cone-o", geom)}
          {handleEl(geom.lx, geom.ly, "cone-l", geom)}
          {handleEl(geom.rx, geom.ry, "cone-r", geom)}
        </g>
      );
    case "polyline":
    case "polygon":
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {geom.points.map((pt, i) =>
            handleEl(pt.x, pt.y, `poly-${i}`, geom),
          )}
        </g>
      );
    case "rectangle": {
      const { x, y, w, h, rotationDeg = 0 } = geom;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const brX = x + w;
      const brY = y + h;
      if (rotationDeg !== 0) {
        return (
          <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
            {handleEl(cx, cy, "rect-mv", geom)}
          </g>
        );
      }
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(cx, cy, "rect-mv", geom)}
          {handleEl(brX, brY, "rect-br", geom)}
        </g>
      );
    }
    case "arc": {
      const rad = (d: number) => (d * Math.PI) / 180;
      const { cx, cy, r: radLen, startDeg, sweepDeg } = geom;
      const sx = cx + radLen * Math.cos(rad(startDeg));
      const sy = cy + radLen * Math.sin(rad(startDeg));
      const ex = cx + radLen * Math.cos(rad(startDeg + sweepDeg));
      const ey = cy + radLen * Math.sin(rad(startDeg + sweepDeg));
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(cx, cy, "arc-c", geom)}
          {handleEl(sx, sy, "arc-s", geom)}
          {handleEl(ex, ey, "arc-e", geom)}
        </g>
      );
    }
    default:
      return null;
  }
}

function computeDraggedGeometry(
  handleId: string,
  startGeom: AgentAbilityGeometry,
  liveGeom: AgentAbilityGeometry,
  p: MapPoint,
  startPointer: MapPoint,
): AgentAbilityGeometry | null {
  const g = startGeom;
  switch (g.kind) {
    case "point":
      return { kind: "point", x: p.x, y: p.y };
    case "circle": {
      if (handleId === "circ-c") {
        return { kind: "circle", cx: p.x, cy: p.y, r: g.r };
      }
      if (handleId === "circ-rim") {
        const nr = clampRadiusGeom(Math.hypot(p.x - g.cx, p.y - g.cy));
        return { kind: "circle", cx: g.cx, cy: g.cy, r: nr };
      }
      return null;
    }
    case "ray": {
      if (handleId === "ray-a")
        return { ...g, x1: p.x, y1: p.y };
      if (handleId === "ray-b")
        return { ...g, x2: p.x, y2: p.y };
      if (handleId === "ray-c" && g.curve)
        return { ...g, curve: { cx: p.x, cy: p.y } };
      return null;
    }
    case "movement": {
      const src =
        liveGeom.kind === "movement" || liveGeom.kind === "ricochet"
          ? liveGeom
          : g;
      if (handleId === "mov-a")
        return {
          kind: g.kind,
          ax: p.x,
          ay: p.y,
          bx: src.bx,
          by: src.by,
        };
      if (handleId === "mov-b")
        return {
          kind: g.kind,
          ax: src.ax,
          ay: src.ay,
          bx: p.x,
          by: p.y,
        };
      return null;
    }
    case "ricochet": {
      const src =
        liveGeom.kind === "movement" || liveGeom.kind === "ricochet"
          ? liveGeom
          : g;
      if (handleId === "mov-a")
        return {
          kind: g.kind,
          ax: p.x,
          ay: p.y,
          bx: src.bx,
          by: src.by,
        };
      if (handleId === "mov-b")
        return {
          kind: g.kind,
          ax: src.ax,
          ay: src.ay,
          bx: p.x,
          by: p.y,
        };
      return null;
    }
    case "cone": {
      if (handleId === "cone-o")
        return { kind: "cone", ox: p.x, oy: p.y, lx: g.lx, ly: g.ly, rx: g.rx, ry: g.ry };
      if (handleId === "cone-l")
        return { kind: "cone", ox: g.ox, oy: g.oy, lx: p.x, ly: p.y, rx: g.rx, ry: g.ry };
      if (handleId === "cone-r")
        return { kind: "cone", ox: g.ox, oy: g.oy, lx: g.lx, ly: g.ly, rx: p.x, ry: p.y };
      return null;
    }
    case "polyline":
    case "polygon": {
      if (liveGeom.kind !== "polyline" && liveGeom.kind !== "polygon") return null;
      const m = /^poly-(\d+)$/.exec(handleId);
      if (!m) return null;
      const i = Number.parseInt(m[1]!, 10);
      const pts = liveGeom.points;
      if (i < 0 || i >= pts.length) return null;
      const next = pts.map((q, j) => (j === i ? p : q));
      return { kind: liveGeom.kind, points: next };
    }
    case "rectangle": {
      const { x, y, w, h, rotationDeg = 0 } = g;
      const dx = p.x - startPointer.x;
      const dy = p.y - startPointer.y;
      if (handleId === "rect-mv") {
        let nx = x + dx;
        let ny = y + dy;
        nx = Math.max(0, Math.min(RECT_EXTENT_MAX - w, nx));
        ny = Math.max(0, Math.min(RECT_EXTENT_MAX - h, ny));
        return {
          kind: "rectangle",
          x: nx,
          y: ny,
          w,
          h,
          rotationDeg: rotationDeg || 0,
        };
      }
      if (rotationDeg === 0 && handleId === "rect-br") {
        const br0x = x + w;
        const br0y = y + h;
        let brX = br0x + dx;
        let brY = br0y + dy;
        brX = Math.max(x + 1, Math.min(RECT_EXTENT_MAX, brX));
        brY = Math.max(y + 1, Math.min(RECT_EXTENT_MAX, brY));
        return {
          kind: "rectangle",
          x,
          y,
          w: brX - x,
          h: brY - y,
          rotationDeg: 0,
        };
      }
      return null;
    }
    case "arc": {
      const deg = (px: number, py: number, cx: number, cy: number) =>
        (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
      if (handleId === "arc-c") {
        return {
          kind: "arc",
          cx: p.x,
          cy: p.y,
          r: g.r,
          startDeg: g.startDeg,
          sweepDeg: g.sweepDeg,
        };
      }
      if (handleId === "arc-s") {
        const nr = clampRadiusGeom(Math.hypot(p.x - g.cx, p.y - g.cy));
        const ns = deg(p.x, p.y, g.cx, g.cy);
        return {
          kind: "arc",
          cx: g.cx,
          cy: g.cy,
          r: nr,
          startDeg: ns,
          sweepDeg: g.sweepDeg,
        };
      }
      if (handleId === "arc-e") {
        const end = deg(p.x, p.y, g.cx, g.cy);
        const sweep = normalizeSweepDeg(end - g.startDeg);
        return {
          kind: "arc",
          cx: g.cx,
          cy: g.cy,
          r: g.r,
          startDeg: g.startDeg,
          sweepDeg: sweep,
        };
      }
      return null;
    }
    default:
      return null;
  }
}
