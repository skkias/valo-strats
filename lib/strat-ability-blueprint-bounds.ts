import type { AgentAbilityGeometry } from "@/types/agent-ability";

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

function empty(): BBox {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function addPoint(b: BBox, x: number, y: number): BBox {
  return {
    minX: Math.min(b.minX, x),
    minY: Math.min(b.minY, y),
    maxX: Math.max(b.maxX, x),
    maxY: Math.max(b.maxY, y),
  };
}

/** Tight-ish bounds for blueprint geometry in 0–1000 canvas space (for scaling onto the strat map). */
export function blueprintGeometryBounds(g: AgentAbilityGeometry): BBox {
  switch (g.kind) {
    case "point":
      return { minX: g.x, minY: g.y, maxX: g.x, maxY: g.y };
    case "circle":
      return {
        minX: g.cx - g.r,
        minY: g.cy - g.r,
        maxX: g.cx + g.r,
        maxY: g.cy + g.r,
      };
    case "ray":
      return g.curve
        ? addPoint(
            addPoint(addPoint(empty(), g.x1, g.y1), g.x2, g.y2),
            g.curve.cx,
            g.curve.cy,
          )
        : addPoint(addPoint(empty(), g.x1, g.y1), g.x2, g.y2);
    case "movement":
      return addPoint(addPoint(empty(), g.ax, g.ay), g.bx, g.by);
    case "ricochet":
      return addPoint(addPoint(empty(), g.ax, g.ay), g.bx, g.by);
    case "cone": {
      let b = empty();
      b = addPoint(b, g.ox, g.oy);
      b = addPoint(b, g.lx, g.ly);
      b = addPoint(b, g.rx, g.ry);
      return b;
    }
    case "polyline":
    case "polygon": {
      let b = empty();
      for (const p of g.points) {
        b = addPoint(b, p.x, p.y);
      }
      return b;
    }
    case "rectangle":
      return {
        minX: g.x,
        minY: g.y,
        maxX: g.x + g.w,
        maxY: g.y + g.h,
      };
    case "arc": {
      const rad = (d: number) => (d * Math.PI) / 180;
      const { cx, cy, r, startDeg, sweepDeg } = g;
      let b = addPoint(empty(), cx, cy);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = startDeg + (sweepDeg * i) / steps;
        b = addPoint(b, cx + r * Math.cos(rad(t)), cy + r * Math.sin(rad(t)));
      }
      return b;
    }
    default:
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
}

export function blueprintBoundsCenterAndSpan(bounds: BBox): {
  cx: number;
  cy: number;
  span: number;
} {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const span = Math.max(w, h, 1e-6);
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
    span,
  };
}
