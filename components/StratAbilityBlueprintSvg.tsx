"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { AgentAbilityBlueprint, AgentAbilityGeometry } from "@/types/agent-ability";
import { blueprintStratAnchor } from "@/lib/strat-blueprint-anchor";
import {
  BLUEPRINT_CANVAS_SIZE,
  stratBlueprintUnitsToMapScale,
} from "@/lib/agent-ability-blueprint-scale";

const BP = BLUEPRINT_CANVAS_SIZE;

/** Thinner strokes on the strat map (uniform scale for all blueprint linework). */
const MAP_BLUEPRINT_STROKE_SCALE = 0.5;

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

/** Point-only: Valorant API ability icon (`displayIcon`), scaled into blueprint space. */
function PointBlueprintMark({
  x,
  y,
  accentStroke,
  displayIconUrl,
  iconScale = 1,
  selected,
  swMap,
  op,
  pointerEvents,
}: {
  x: number;
  y: number;
  accentStroke: string;
  displayIconUrl: string | null | undefined;
  /** Multiplier for base icon size in blueprint units (point abilities). */
  iconScale?: number;
  selected: boolean;
  swMap: number;
  op: number;
  pointerEvents: "none" | "auto";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const scale = Math.min(3, Math.max(0.12, iconScale));
  const size = BP * 0.038 * scale;
  const half = size / 2;
  const showImg =
    typeof displayIconUrl === "string" &&
    displayIconUrl.startsWith("http") &&
    !imgFailed;

  return (
    <g opacity={op} style={{ pointerEvents }}>
      {showImg ? (
        <>
          <image
            href={displayIconUrl}
            x={x - half}
            y={y - half}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            onError={() => setImgFailed(true)}
          />
          <circle
            cx={x}
            cy={y}
            r={half * 1.06}
            fill="none"
            stroke={accentStroke}
            vectorEffect="non-scaling-stroke"
            strokeWidth={swMap * 0.85}
            style={{ pointerEvents } as CSSProperties}
          />
          <circle
            cx={x}
            cy={y}
            r={half * 1.06}
            fill="none"
            stroke={selected ? "#fae8ff" : "#fff"}
            vectorEffect="non-scaling-stroke"
            strokeWidth={swMap * (selected ? 1.35 : 0.55)}
            style={{ pointerEvents } as CSSProperties}
          />
        </>
      ) : (
        <circle
          cx={x}
          cy={y}
          r={BP * 0.018 * scale}
          fill={accentStroke}
          stroke={selected ? "#fae8ff" : "#fff"}
          vectorEffect="non-scaling-stroke"
          strokeWidth={swMap * (selected ? 1.4 : 1.1)}
          style={{ pointerEvents } as CSSProperties}
        />
      )}
    </g>
  );
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
  rotationDeg = 0,
  selected,
  pointerEvents = "auto",
  /** Valorant API `displayIcon` URL for point shapes — shows ability art instead of a dot. */
  abilityDisplayIconUrl,
  /**
   * When set (e.g. rectangle = geometric center), strat rotation is around this blueprint
   * point instead of `blueprint.origin` / bbox center.
   */
  stratAnchorOverride,
}: {
  blueprint: AgentAbilityBlueprint;
  mapX: number;
  mapY: number;
  vbWidth: number;
  /** Map heading: blueprint +X aligns with this angle (degrees). */
  rotationDeg?: number;
  selected?: boolean;
  pointerEvents?: "none" | "auto";
  abilityDisplayIconUrl?: string | null;
  stratAnchorOverride?: { x: number; y: number } | null;
}) {
  const g = blueprint.geometry;
  const stroke = blueprint.color;
  const fill = `${blueprint.color}44`;
  const anchor = stratAnchorOverride ?? blueprintStratAnchor(blueprint);
  const scale = stratBlueprintUnitsToMapScale(vbWidth);
  const swMap =
    Math.max(vbWidth * 0.0016, 1.25) *
    (selected ? 1.35 : 1) *
    MAP_BLUEPRINT_STROKE_SCALE;
  const op = selected ? 1 : 0.92;
  const transform = `translate(${mapX},${mapY}) rotate(${rotationDeg}) scale(${scale}) translate(${-anchor.x},${-anchor.y})`;

  const commonStroke = {
    vectorEffect: "non-scaling-stroke" as const,
    strokeWidth: swMap,
    style: { pointerEvents } as CSSProperties,
  };

  let inner: ReactNode = null;

  switch (g.kind) {
    case "point": {
      const iconScale =
        typeof blueprint.pointIconScale === "number" &&
        Number.isFinite(blueprint.pointIconScale)
          ? blueprint.pointIconScale
          : 1;
      const effectiveIconUrl =
        blueprint.pointIconShow === false ? null : abilityDisplayIconUrl;
      inner = (
        <PointBlueprintMark
          x={g.x}
          y={g.y}
          accentStroke={stroke}
          displayIconUrl={effectiveIconUrl}
          iconScale={iconScale}
          selected={!!selected}
          swMap={swMap}
          op={op}
          pointerEvents={pointerEvents}
        />
      );
      break;
    }
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
    case "movement": {
      const m = g;
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <line
            x1={m.ax}
            y1={m.ay}
            x2={m.bx}
            y2={m.by}
            stroke={stroke}
            strokeLinecap="round"
            strokeDasharray={`${vbWidth * 0.014 * MAP_BLUEPRINT_STROKE_SCALE} ${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE}`}
            {...commonStroke}
            strokeWidth={swMap * 1.65}
          />
          <circle
            cx={m.ax}
            cy={m.ay}
            r={BP * 0.012}
            fill={stroke}
            stroke="#fff"
            {...commonStroke}
            strokeWidth={swMap * 0.9}
          />
          <circle
            cx={m.bx}
            cy={m.by}
            r={BP * 0.01}
            fill={fill}
            stroke={stroke}
            {...commonStroke}
          />
        </g>
      );
      break;
    }
    default:
      inner = null;
  }

  if (!inner) return null;

  return <g transform={transform}>{inner}</g>;
}
