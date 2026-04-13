"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AgentAbilityBlueprint, AgentAbilityGeometry } from "@/types/agent-ability";
import type { MapPoint } from "@/lib/map-path";
import { clientToSvgPoint } from "@/lib/svg-coords";
import {
  clampBlueprintPoint,
  snapBlueprintPoint,
} from "@/lib/blueprint-canvas-snap";
import { BLUEPRINT_CANVAS_SIZE } from "@/lib/agent-ability-blueprint-scale";

const HR = 0.018;
const MAX = BLUEPRINT_CANVAS_SIZE;

function clampRadiusGeom(r: number): number {
  return Math.min(500, Math.max(6, r));
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
  onChange,
}: {
  blueprint: AgentAbilityBlueprint;
  vb: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
  snapStep: number;
  onChange: (g: AgentAbilityGeometry) => void;
}) {
  const dragCtx = useRef<DragCtx | null>(null);
  const geom = blueprint.geometry;
  /** Latest geometry while dragging (poly vertex drags need fresh points). */
  const liveGeomRef = useRef(geom);
  liveGeomRef.current = geom;

  const toBp = useCallback(
    (clientX: number, clientY: number): MapPoint => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const raw = clientToSvgPoint(el, clientX, clientY);
      const p = clampBlueprintPoint(raw);
      return snapStep > 0 ? snapBlueprintPoint(p, snapStep) : p;
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
      const p = toBp(e.clientX, e.clientY);
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
  }, [pushGeom, toBp]);

  function beginDrag(
    e: React.PointerEvent,
    handleId: string,
    startGeom: AgentAbilityGeometry,
  ) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragCtx.current = {
      handleId,
      startPointer: toBp(e.clientX, e.clientY),
      startGeom,
    };
  }

  const stroke = "#fafafa";
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
      return (
        <g style={{ pointerEvents: "auto" }} data-blueprint-handles>
          {handleEl(geom.x, geom.y, "point", geom)}
        </g>
      );
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
        </g>
      );
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
        return { kind: "ray", x1: p.x, y1: p.y, x2: g.x2, y2: g.y2 };
      if (handleId === "ray-b")
        return { kind: "ray", x1: g.x1, y1: g.y1, x2: p.x, y2: p.y };
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
        nx = Math.max(0, Math.min(MAX - w, nx));
        ny = Math.max(0, Math.min(MAX - h, ny));
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
        brX = Math.max(x + 1, Math.min(MAX, brX));
        brY = Math.max(y + 1, Math.min(MAX, brY));
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
