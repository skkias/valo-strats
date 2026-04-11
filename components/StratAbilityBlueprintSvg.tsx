"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AgentAbilityBlueprint, AgentAbilityGeometry } from "@/types/agent-ability";
import {
  blueprintBoundsCenterAndSpan,
  blueprintGeometryBounds,
} from "@/lib/strat-ability-blueprint-bounds";
import {
  BLUEPRINT_CANVAS_SIZE,
  stratBlueprintUnitsToMapScale,
} from "@/lib/agent-ability-blueprint-scale";

const BP = BLUEPRINT_CANVAS_SIZE;

function arcPathD(g: Extract<AgentAbilityGeometry, { kind: "arc" }>): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const { cx, cy, r, startDeg, sweepDeg } = g;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(startDeg + sweepDeg));
  const y2 = cy + r * Math.sin(rad(startDeg + sweepDeg));
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = sweepDeg >= 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

/**
 * Renders a coach-saved ability blueprint (normalized 0–1000 canvas) on the strat map
 * at `(mapX, mapY)`. The **1000 bp canvas edge** maps to `STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO`
 * of map width; shape coordinates scale **linearly**, so editing radius/size in bp changes
 * on-map size. Uses non-scaling strokes so lines stay visible when scaled.
 */
export function StratAbilityBlueprintSvg({
  blueprint,
  mapX,
  mapY,
  vbWidth,
  selected,
  pointerEvents = "auto",
}: {
  blueprint: AgentAbilityBlueprint;
  mapX: number;
  mapY: number;
  vbWidth: number;
  selected?: boolean;
  pointerEvents?: "none" | "auto";
}) {
  const g = blueprint.geometry;
  const stroke = blueprint.color;
  const fill = `${blueprint.color}44`;
  const bounds = blueprintGeometryBounds(g);
  const { cx, cy } = blueprintBoundsCenterAndSpan(bounds);
  const scale = stratBlueprintUnitsToMapScale(vbWidth);
  const swMap = Math.max(vbWidth * 0.0016, 1.25) * (selected ? 1.35 : 1);
  const op = selected ? 1 : 0.92;
  const transform = `translate(${mapX},${mapY}) scale(${scale}) translate(${-cx},${-cy})`;

  const commonStroke = {
    vectorEffect: "non-scaling-stroke" as const,
    strokeWidth: swMap,
    style: { pointerEvents } as CSSProperties,
  };

  let inner: ReactNode = null;

  switch (g.kind) {
    case "point":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <circle
            cx={g.x}
            cy={g.y}
            r={BP * 0.018}
            fill={stroke}
            stroke={selected ? "#fae8ff" : "#fff"}
            {...commonStroke}
            strokeWidth={swMap * (selected ? 1.4 : 1.1)}
          />
        </g>
      );
      break;
    case "circle":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <circle
            cx={g.cx}
            cy={g.cy}
            r={g.r}
            fill={fill}
            stroke={stroke}
            {...commonStroke}
          />
        </g>
      );
      break;
    case "ray":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <line
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={stroke}
            strokeLinecap="round"
            {...commonStroke}
            strokeWidth={swMap * 1.5}
          />
        </g>
      );
      break;
    case "cone":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <polygon
            points={`${g.ox},${g.oy} ${g.lx},${g.ly} ${g.rx},${g.ry}`}
            fill={fill}
            stroke={stroke}
            strokeLinejoin="round"
            {...commonStroke}
          />
        </g>
      );
      break;
    case "polyline": {
      const d = g.points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ");
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <path
            d={d}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...commonStroke}
            strokeWidth={swMap * 1.35}
          />
        </g>
      );
      break;
    }
    case "polygon":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <polygon
            points={g.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={fill}
            stroke={stroke}
            strokeLinejoin="round"
            {...commonStroke}
          />
        </g>
      );
      break;
    case "rectangle":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <rect
            x={g.x}
            y={g.y}
            width={g.w}
            height={g.h}
            fill={fill}
            stroke={stroke}
            {...commonStroke}
            transform={
              g.rotationDeg
                ? `rotate(${g.rotationDeg},${g.x + g.w / 2},${g.y + g.h / 2})`
                : undefined
            }
          />
        </g>
      );
      break;
    case "arc":
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <path
            d={arcPathD(g)}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            {...commonStroke}
            strokeWidth={swMap * 1.45}
          />
        </g>
      );
      break;
    default:
      inner = null;
  }

  if (!inner) return null;

  return <g transform={transform}>{inner}</g>;
}
