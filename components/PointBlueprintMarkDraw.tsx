"use client";

import type { CSSProperties } from "react";
import type { PointMarkSymbolId } from "@/types/agent-ability";

/**
 * Vector preset drawn in a centered 24×24 logical space (scale applied by parent).
 */
export function PointMarkSymbolGraphic({
  symbolId,
  stroke,
  selected,
  swMap,
}: {
  symbolId: PointMarkSymbolId;
  stroke: string;
  selected?: boolean;
  /** Non-scaling stroke width (strat map / editor). */
  swMap: number;
}) {
  const pen = selected ? "#faf5ff" : stroke;
  const sw = Math.max(swMap * 0.75, 0.9);
  const dim = selected ? "#e9d5ff" : stroke;
  const ve = "non-scaling-stroke" as const;
  const pe: CSSProperties = { pointerEvents: "none" };

  switch (symbolId) {
    case "crosshair":
      return (
        <g style={pe}>
          <circle
            cx={0}
            cy={0}
            r={9}
            fill="none"
            stroke={pen}
            strokeWidth={sw}
            vectorEffect={ve}
          />
          <line
            x1={-15}
            y1={0}
            x2={15}
            y2={0}
            stroke={pen}
            strokeWidth={sw}
            strokeLinecap="round"
            vectorEffect={ve}
          />
          <line
            x1={0}
            y1={-15}
            x2={0}
            y2={15}
            stroke={pen}
            strokeWidth={sw}
            strokeLinecap="round"
            vectorEffect={ve}
          />
        </g>
      );
    case "diamond":
      return (
        <path
          d="M 0,-12 L 11,0 L 0,12 L -11,0 Z"
          fill={dim}
          fillOpacity={0.35}
          stroke={pen}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect={ve}
          style={pe}
        />
      );
    case "pin":
      return (
        <g style={pe}>
          <circle
            cx={0}
            cy={-4}
            r={7}
            fill={dim}
            fillOpacity={0.45}
            stroke={pen}
            strokeWidth={sw}
            vectorEffect={ve}
          />
          <path
            d="M 0,3 L -8,14 L 8,14 Z"
            fill={dim}
            fillOpacity={0.5}
            stroke={pen}
            strokeWidth={sw}
            strokeLinejoin="round"
            vectorEffect={ve}
          />
        </g>
      );
    case "star":
      return (
        <path
          d="M 0,-12 L 3.5,-3.5 L 12,-2.5 L 6,3.5 L 7.5,12 L 0,7.5 L -7.5,12 L -6,3.5 L -12,-2.5 L -3.5,-3.5 Z"
          fill={dim}
          fillOpacity={0.35}
          stroke={pen}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect={ve}
          style={pe}
        />
      );
    case "bolt":
      return (
        <path
          d="M 4,-12 L -6,2 L -1,2 L -5,14 L 8,-2 L 2,-2 Z"
          fill={dim}
          fillOpacity={0.55}
          stroke={pen}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect={ve}
          style={pe}
        />
      );
    case "square":
      return (
        <rect
          x={-9}
          y={-9}
          width={18}
          height={18}
          rx={2}
          fill={dim}
          fillOpacity={0.3}
          stroke={pen}
          strokeWidth={sw}
          vectorEffect={ve}
          style={pe}
        />
      );
    case "triangle":
      return (
        <path
          d="M 0,-12 L 11,10 L -11,10 Z"
          fill={dim}
          fillOpacity={0.35}
          stroke={pen}
          strokeWidth={sw}
          strokeLinejoin="round"
          vectorEffect={ve}
          style={pe}
        />
      );
    case "plus_ring":
      return (
        <g style={pe}>
          <circle
            cx={0}
            cy={0}
            r={11}
            fill="none"
            stroke={pen}
            strokeWidth={sw}
            vectorEffect={ve}
          />
          <line
            x1={-7}
            y1={0}
            x2={7}
            y2={0}
            stroke={pen}
            strokeWidth={sw}
            strokeLinecap="round"
            vectorEffect={ve}
          />
          <line
            x1={0}
            y1={-7}
            x2={0}
            y2={7}
            stroke={pen}
            strokeWidth={sw}
            strokeLinecap="round"
            vectorEffect={ve}
          />
        </g>
      );
    default:
      return null;
  }
}
