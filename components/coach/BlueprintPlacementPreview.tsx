"use client";

import type { MapPoint } from "@/lib/map-path";
import type { AgentAbilityShapeKind } from "@/types/agent-ability";

function arcPreviewD(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  let sweepDeg = endDeg - startDeg;
  while (sweepDeg > 180) sweepDeg -= 360;
  while (sweepDeg < -180) sweepDeg += 360;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(startDeg + sweepDeg));
  const y2 = cy + r * Math.sin(rad(startDeg + sweepDeg));
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = sweepDeg >= 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

type Placement = {
  shapeKind: AgentAbilityShapeKind;
  points: MapPoint[];
};

/**
 * Rubber-band preview while placing (follows cursor). Matches commit geometry in AgentAbilityEditor.
 */
export function BlueprintPlacementPreview({
  placement,
  cursorBp,
  vb,
  /** Valorant API icon while hovering a point placement. */
  pointPreviewIconUrl,
}: {
  placement: Placement | null;
  cursorBp: MapPoint | null;
  vb: number;
  pointPreviewIconUrl?: string | null;
}) {
  if (!placement || !cursorBp) return null;
  const { shapeKind: kind, points: pts } = placement;
  const c = cursorBp;
  const sw = vb * 0.0035;
  const dash = "14 10";

  if (kind === "point") {
    const icon =
      typeof pointPreviewIconUrl === "string" &&
      pointPreviewIconUrl.startsWith("http")
        ? pointPreviewIconUrl
        : null;
    const sz = vb * 0.038;
    const half = sz / 2;
    return (
      <g pointerEvents="none" opacity={0.88}>
        {icon ? (
          <image
            href={icon}
            x={c.x - half}
            y={c.y - half}
            width={sz}
            height={sz}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.92}
          />
        ) : null}
        <circle
          cx={c.x}
          cy={c.y}
          r={vb * 0.022}
          fill="none"
          stroke="rgb(192, 132, 252)"
          strokeWidth={sw * 1.2}
          strokeDasharray={dash}
        />
        <line
          x1={c.x - vb * 0.03}
          y1={c.y}
          x2={c.x + vb * 0.03}
          y2={c.y}
          stroke="rgba(192,132,252,0.5)"
          strokeWidth={sw * 0.8}
        />
        <line
          x1={c.x}
          y1={c.y - vb * 0.03}
          x2={c.x}
          y2={c.y + vb * 0.03}
          stroke="rgba(192,132,252,0.5)"
          strokeWidth={sw * 0.8}
        />
      </g>
    );
  }

  if (kind === "circle" && pts.length === 1) {
    const p0 = pts[0]!;
    const r = Math.hypot(c.x - p0.x, c.y - p0.y);
    const rr = Math.max(6, Math.min(500, r));
    return (
      <g pointerEvents="none" opacity={0.75}>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={c.x}
          y2={c.y}
          stroke="rgba(192,132,252,0.65)"
          strokeWidth={sw}
          strokeDasharray="8 6"
        />
        <circle
          cx={p0.x}
          cy={p0.y}
          r={rr}
          fill="rgba(167,139,250,0.08)"
          stroke="rgb(192, 132, 252)"
          strokeWidth={sw}
          strokeDasharray={dash}
        />
      </g>
    );
  }

  if (kind === "ray" && pts.length === 1) {
    const p0 = pts[0]!;
    return (
      <g pointerEvents="none" opacity={0.8}>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={c.x}
          y2={c.y}
          stroke="rgb(192, 132, 252)"
          strokeWidth={sw * 2}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </g>
    );
  }

  if (kind === "movement" && pts.length === 1) {
    const p0 = pts[0]!;
    return (
      <g pointerEvents="none" opacity={0.8}>
        <line
          x1={p0.x}
          y1={p0.y}
          x2={c.x}
          y2={c.y}
          stroke="rgb(192, 132, 252)"
          strokeWidth={sw * 2}
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </g>
    );
  }

  if (kind === "cone") {
    if (pts.length === 1) {
      const o = pts[0]!;
      return (
        <g pointerEvents="none" opacity={0.65}>
          <line
            x1={o.x}
            y1={o.y}
            x2={c.x}
            y2={c.y}
            stroke="rgba(192,132,252,0.55)"
            strokeWidth={sw}
            strokeDasharray="6 5"
          />
        </g>
      );
    }
    if (pts.length === 2) {
      const o = pts[0]!;
      const l = pts[1]!;
      return (
        <g pointerEvents="none" opacity={0.55}>
          <polygon
            points={`${o.x},${o.y} ${l.x},${l.y} ${c.x},${c.y}`}
            fill="rgba(167,139,250,0.15)"
            stroke="rgb(192, 132, 252)"
            strokeWidth={sw}
            strokeDasharray={dash}
            strokeLinejoin="round"
          />
        </g>
      );
    }
  }

  if (kind === "rectangle" && pts.length === 1) {
    const a = pts[0]!;
    const x = Math.min(a.x, c.x);
    const y = Math.min(a.y, c.y);
    const w = Math.abs(c.x - a.x);
    const h = Math.abs(c.y - a.y);
    return (
      <g pointerEvents="none" opacity={0.55}>
        <rect
          x={x}
          y={y}
          width={Math.max(1, w)}
          height={Math.max(1, h)}
          fill="rgba(167,139,250,0.1)"
          stroke="rgb(192, 132, 252)"
          strokeWidth={sw}
          strokeDasharray={dash}
        />
      </g>
    );
  }

  if (kind === "arc") {
    if (pts.length === 1) {
      const p0 = pts[0]!;
      const r = Math.hypot(c.x - p0.x, c.y - p0.y);
      const rr = Math.max(6, Math.min(500, r));
      return (
        <g pointerEvents="none" opacity={0.7}>
          <line
            x1={p0.x}
            y1={p0.y}
            x2={c.x}
            y2={c.y}
            stroke="rgba(192,132,252,0.5)"
            strokeWidth={sw * 0.9}
            strokeDasharray="6 5"
          />
          <circle
            cx={p0.x}
            cy={p0.y}
            r={rr}
            fill="none"
            stroke="rgba(167,139,250,0.35)"
            strokeWidth={sw * 0.6}
            strokeDasharray="4 6"
          />
        </g>
      );
    }
    if (pts.length === 2) {
      const center = pts[0]!;
      const p1 = pts[1]!;
      const r = Math.hypot(p1.x - center.x, p1.y - center.y);
      const rr = Math.max(6, Math.min(500, r));
      const startDeg = (Math.atan2(p1.y - center.y, p1.x - center.x) * 180) / Math.PI;
      const endDeg = (Math.atan2(c.y - center.y, c.x - center.x) * 180) / Math.PI;
      return (
        <g pointerEvents="none" opacity={0.85}>
          <path
            d={arcPreviewD(center.x, center.y, rr, startDeg, endDeg)}
            fill="none"
            stroke="rgb(192, 132, 252)"
            strokeWidth={sw * 1.8}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </g>
      );
    }
  }

  return null;
}
