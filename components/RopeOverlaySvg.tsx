"use client";

import type { MapOverlayShape } from "@/types/catalog";
import { ropePolylinePoints } from "@/lib/map-extra-paths";
import { MAP_VIEW_VECTOR_STROKE_SCALE } from "@/lib/map-view-stroke-scale";

const ROPE_STROKE = "rgb(245, 158, 11)";
const ROPE_STROKE_HI = "rgb(253, 224, 71)";
const ENTER_FILL = "rgb(45, 212, 191)";
const EXIT_FILL = "rgb(251, 146, 60)";

/** Rope / zipline: polyline with enter (first) and exit (last) markers. */
export function RopeOverlaySvg({
  sh,
  vbWidth,
  highlight,
}: {
  sh: MapOverlayShape;
  vbWidth: number;
  highlight?: boolean;
}) {
  if (sh.kind !== "rope") return null;
  const pts = ropePolylinePoints(sh);
  const sw =
    vbWidth * 0.0036 * (highlight ? 1.15 : 1) * MAP_VIEW_VECTOR_STROKE_SCALE;
  const stroke = highlight ? ROPE_STROKE_HI : ROPE_STROKE;
  const rEnd = vbWidth * 0.007;

  if (pts.length === 0) return null;
  if (pts.length === 1) {
    const p = pts[0]!;
    return (
      <g pointerEvents="none">
        <circle
          cx={p.x}
          cy={p.y}
          r={rEnd}
          fill={ENTER_FILL}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={sw * 0.5}
        />
      </g>
    );
  }

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const pEnter = pts[0]!;
  const pExit = pts[pts.length - 1]!;

  return (
    <g pointerEvents="none">
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="10 5 3 5"
      />
      <circle
        cx={pEnter.x}
        cy={pEnter.y}
        r={rEnd}
        fill={ENTER_FILL}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={sw * 0.45}
      />
      <circle
        cx={pExit.x}
        cy={pExit.y}
        r={rEnd}
        fill={EXIT_FILL}
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={sw * 0.45}
      />
    </g>
  );
}
