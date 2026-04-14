"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type {
  AgentAbilityBlueprint,
  AgentAbilityGeometry,
  PointMarkStyle,
  PointMarkSymbolId,
} from "@/types/agent-ability";
import { blueprintStratAnchor } from "@/lib/strat-blueprint-anchor";
import { rgbaWithAlpha } from "@/lib/ability-textures";
import { AbilityTextureDefs } from "@/components/ability/AbilityTextureDefs";
import {
  BLUEPRINT_CANVAS_SIZE,
  stratBlueprintUnitsToMapScale,
} from "@/lib/agent-ability-blueprint-scale";
import { blueprintPointToStratMapDisplay } from "@/lib/strat-blueprint-map-point";
import {
  computeVisionConeLosPolygon,
  type VisionLosContext,
} from "@/lib/vision-cone-los";
import { computeRicochetPath } from "@/lib/ricochet-path";
import {
  effectivePointColorIntensity,
  effectivePointMarkStyle,
  effectivePointMarkSymbolId,
} from "@/lib/point-blueprint-mark";
import { PointMarkSymbolGraphic } from "@/components/PointBlueprintMarkDraw";

const BP = BLUEPRINT_CANVAS_SIZE;

/** Thinner strokes on the strat map (uniform scale for all blueprint linework). */
const MAP_BLUEPRINT_STROKE_SCALE = 0.5;

/** Minimum stroke width (SVG user units, with non-scaling-stroke) for hit-testing thin lines. */
function blueprintMinLineHitWidth(vbWidth: number, visibleW: number): number {
  return Math.max(visibleW, Math.max(vbWidth * 0.036, 16));
}

/**
 * Renders an invisible wide stroke for picking, then the visible stroke on top.
 * Hit path uses no dasharray so dashed lines stay easy to grab along the full geometry.
 */
function BlueprintLineHitStroke({
  vbWidth,
  pointerEvents: peMode,
  visibleStrokeWidth,
  stroke,
  strokeLinecap = "round",
  strokeLinejoin,
  strokeDasharray,
  vectorEffect = "non-scaling-stroke",
  pathD,
  line,
}: {
  vbWidth: number;
  pointerEvents: "none" | "auto";
  visibleStrokeWidth: number;
  stroke: string;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "bevel" | "miter";
  strokeDasharray?: string;
  vectorEffect?: "non-scaling-stroke" | "none";
  pathD?: string;
  line?: { x1: number; y1: number; x2: number; y2: number };
}): ReactNode {
  const hitW = blueprintMinLineHitWidth(vbWidth, visibleStrokeWidth);
  const ve = vectorEffect;
  const join = strokeLinejoin;

  if (peMode === "none") {
    if (pathD) {
      return (
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={join}
          strokeDasharray={strokeDasharray}
          vectorEffect={ve}
          strokeWidth={visibleStrokeWidth}
          style={{ pointerEvents: "none" }}
        />
      );
    }
    if (line) {
      return (
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={stroke}
          strokeLinecap={strokeLinecap}
          strokeDasharray={strokeDasharray}
          vectorEffect={ve}
          strokeWidth={visibleStrokeWidth}
          style={{ pointerEvents: "none" }}
        />
      );
    }
    return null;
  }

  if (pathD) {
    return (
      <g className="strat-ability-line-group">
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeLinecap={strokeLinecap}
          strokeLinejoin={join}
          vectorEffect={ve}
          strokeWidth={hitW}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
        />
        <path
          className="strat-ability-line-visible"
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={join}
          strokeDasharray={strokeDasharray}
          vectorEffect={ve}
          strokeWidth={visibleStrokeWidth}
          style={{ pointerEvents: "none" }}
        />
      </g>
    );
  }

  if (line) {
    return (
      <g className="strat-ability-line-group">
        <line
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="transparent"
          strokeLinecap={strokeLinecap}
          vectorEffect={ve}
          strokeWidth={hitW}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
        />
        <line
          className="strat-ability-line-visible"
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={stroke}
          strokeLinecap={strokeLinecap}
          strokeDasharray={strokeDasharray}
          vectorEffect={ve}
          strokeWidth={visibleStrokeWidth}
          style={{ pointerEvents: "none" }}
        />
      </g>
    );
  }

  return null;
}

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

/** Point-only: ability icon, dot, or preset vector mark in blueprint space. */
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
  markStyle,
  symbolId,
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
  markStyle: PointMarkStyle;
  symbolId?: PointMarkSymbolId;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const scale = Math.min(3, Math.max(0.12, iconScale));
  const size = BP * 0.038 * scale;
  const half = size / 2;
  const symScale = (BP * 0.019 * scale) / 12;
  const showImg =
    markStyle === "ability_icon" &&
    typeof displayIconUrl === "string" &&
    displayIconUrl.startsWith("http") &&
    !imgFailed;

  if (markStyle === "dot") {
    return (
      <g opacity={op} style={{ pointerEvents }}>
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
      </g>
    );
  }

  if (markStyle === "symbol") {
    const sid = symbolId ?? "crosshair";
    return (
      <g opacity={op} style={{ pointerEvents }}>
        <g transform={`translate(${x},${y}) scale(${symScale})`}>
          <PointMarkSymbolGraphic
            symbolId={sid}
            stroke={accentStroke}
            selected={selected}
            swMap={swMap}
          />
        </g>
        {selected ? (
          <circle
            cx={x}
            cy={y}
            r={BP * 0.024 * scale}
            fill="none"
            stroke="#fae8ff"
            vectorEffect="non-scaling-stroke"
            strokeWidth={swMap * 0.9}
            style={{ pointerEvents: "none" }}
          />
        ) : null}
      </g>
    );
  }

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
  mapPinScale = 1,
  visionLosContext,
  rayToggledOn = true,
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
  /** Coach preference: scales blueprint on the strat map (default 1). */
  mapPinScale?: number;
  /** Optional map geometry for LOS clipping on vision cones. */
  visionLosContext?: VisionLosContext | null;
  /** For toggleable ray blueprints: per-stage on/off state (`false` = down/inactive). */
  rayToggledOn?: boolean;
}) {
  const g = blueprint.geometry;
  const stroke = blueprint.color;
  const fill = rgbaWithAlpha(blueprint.color, 0.27);
  const texturePatternId = `abtx-map-${blueprint.id}`;
  const textureAnchor = blueprintStratAnchor(blueprint);
  const textureFill =
    blueprint.textureId && blueprint.textureId !== "solid"
      ? `url(#${texturePatternId})`
      : fill;
  const anchor = stratAnchorOverride ?? blueprintStratAnchor(blueprint);
  const scale =
    stratBlueprintUnitsToMapScale(vbWidth) *
    (Number.isFinite(mapPinScale) ? mapPinScale : 1);
  const swMap =
    Math.max(vbWidth * 0.0016, 1.25) *
    (selected ? 1.35 : 1) *
    MAP_BLUEPRINT_STROKE_SCALE;
  const op = selected ? 1 : 0.92;
  const transform = `translate(${mapX},${mapY}) rotate(${rotationDeg}) scale(${scale}) translate(${-anchor.x},${-anchor.y})`;
  const mappedVbWidth =
    vbWidth * (Number.isFinite(mapPinScale) ? mapPinScale : 1);

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
      const markStyle = effectivePointMarkStyle(blueprint);
      const symbolId =
        markStyle === "symbol"
          ? effectivePointMarkSymbolId(blueprint)
          : undefined;
      const effectiveIconUrl =
        markStyle === "ability_icon" ? abilityDisplayIconUrl : null;
      const intensity = effectivePointColorIntensity(blueprint);
      inner = (
        <PointBlueprintMark
          x={g.x}
          y={g.y}
          accentStroke={stroke}
          displayIconUrl={effectiveIconUrl}
          iconScale={iconScale}
          selected={!!selected}
          swMap={swMap}
          op={op * intensity}
          pointerEvents={pointerEvents}
          markStyle={markStyle}
          symbolId={symbolId}
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
            fill={textureFill}
            stroke={stroke}
            {...commonStroke}
          />
        </g>
      );
      break;
    case "ray":
      {
        const legacyWallDown = (g as { wallState?: "up" | "down" }).wallState === "down";
        const wallDown = legacyWallDown || (g.toggleable === true && rayToggledOn === false);
        const wallOpacity = wallDown ? op * 0.42 : op;
        const wallDash =
          wallDown
            ? `${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE} ${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE}`
            : undefined;
        const strokeMul =
          typeof g.strokeWidthMul === "number" &&
          Number.isFinite(g.strokeWidthMul) &&
          g.strokeWidthMul > 0
            ? Math.min(8, Math.max(0.2, g.strokeWidthMul))
            : 1;
        const d = g.curve
          ? `M ${g.x1} ${g.y1} Q ${g.curve.cx} ${g.curve.cy} ${g.x2} ${g.y2}`
          : `M ${g.x1} ${g.y1} L ${g.x2} ${g.y2}`;
        inner = (
          <g opacity={wallOpacity} style={{ pointerEvents }}>
            <BlueprintLineHitStroke
              vbWidth={vbWidth}
              pointerEvents={pointerEvents}
              pathD={d}
              visibleStrokeWidth={swMap * 1.5 * strokeMul}
              stroke={stroke}
              strokeLinejoin="round"
              strokeDasharray={wallDash}
            />
          </g>
        );
      }
      break;
    case "cone":
      if (
        (blueprint.shapeKind === "vision_cone_narrow" ||
          blueprint.shapeKind === "vision_cone_wide") &&
        visionLosContext
      ) {
        const o = blueprintPointToStratMapDisplay(
          { x: g.ox, y: g.oy },
          blueprint,
          mapX,
          mapY,
          mappedVbWidth,
          rotationDeg,
          stratAnchorOverride,
        );
        const l = blueprintPointToStratMapDisplay(
          { x: g.lx, y: g.ly },
          blueprint,
          mapX,
          mapY,
          mappedVbWidth,
          rotationDeg,
          stratAnchorOverride,
        );
        const r = blueprintPointToStratMapDisplay(
          { x: g.rx, y: g.ry },
          blueprint,
          mapX,
          mapY,
          mappedVbWidth,
          rotationDeg,
          stratAnchorOverride,
        );
        const losPts = computeVisionConeLosPolygon({
          origin: o,
          left: l,
          right: r,
          context: visionLosContext,
        });
        inner = (
          <g opacity={op} style={{ pointerEvents }}>
            <polygon
              points={losPts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={fill}
              stroke={stroke}
              strokeLinejoin="round"
              {...commonStroke}
            />
          </g>
        );
        break;
      }
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <polygon
            points={`${g.ox},${g.oy} ${g.lx},${g.ly} ${g.rx},${g.ry}`}
            fill={textureFill}
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
          <BlueprintLineHitStroke
            vbWidth={vbWidth}
            pointerEvents={pointerEvents}
            pathD={d}
            visibleStrokeWidth={swMap * 1.35}
            stroke={stroke}
            strokeLinejoin="round"
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
            fill={textureFill}
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
            fill={textureFill}
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
          <BlueprintLineHitStroke
            vbWidth={vbWidth}
            pointerEvents={pointerEvents}
            pathD={arcPathD(g)}
            visibleStrokeWidth={swMap * 1.45}
            stroke={stroke}
          />
        </g>
      );
      break;
    case "movement": {
      const m = g;
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <BlueprintLineHitStroke
            vbWidth={vbWidth}
            pointerEvents={pointerEvents}
            line={{ x1: m.ax, y1: m.ay, x2: m.bx, y2: m.by }}
            visibleStrokeWidth={swMap * 1.65}
            stroke={stroke}
            strokeDasharray={`${vbWidth * 0.014 * MAP_BLUEPRINT_STROKE_SCALE} ${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE}`}
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
            fill={textureFill}
            stroke={stroke}
            {...commonStroke}
          />
        </g>
      );
      break;
    }
    case "ricochet": {
      const r = g;
      if (visionLosContext) {
        const from = blueprintPointToStratMapDisplay(
          { x: r.ax, y: r.ay },
          blueprint,
          mapX,
          mapY,
          mappedVbWidth,
          rotationDeg,
          stratAnchorOverride,
        );
        const toward = blueprintPointToStratMapDisplay(
          { x: r.bx, y: r.by },
          blueprint,
          mapX,
          mapY,
          mappedVbWidth,
          rotationDeg,
          stratAnchorOverride,
        );
        const pts = computeRicochetPath({
          from,
          toward,
          context: visionLosContext,
        });
        const d = pts
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ");
        inner = (
          <g opacity={op} style={{ pointerEvents }}>
            <BlueprintLineHitStroke
              vbWidth={vbWidth}
              pointerEvents={pointerEvents}
              pathD={d}
              visibleStrokeWidth={swMap * 1.65}
              stroke={stroke}
              strokeLinejoin="round"
              strokeDasharray={`${vbWidth * 0.014 * MAP_BLUEPRINT_STROKE_SCALE} ${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE}`}
            />
            <circle
              cx={from.x}
              cy={from.y}
              r={Math.max(vbWidth * 0.0045, 2.2)}
              fill={stroke}
              stroke="#fff"
              vectorEffect="non-scaling-stroke"
              strokeWidth={swMap * 0.9}
            />
            <circle
              cx={pts[pts.length - 1]!.x}
              cy={pts[pts.length - 1]!.y}
              r={Math.max(vbWidth * 0.004, 2)}
              fill={fill}
              stroke={stroke}
              vectorEffect="non-scaling-stroke"
              strokeWidth={swMap * 0.85}
            />
          </g>
        );
        break;
      }
      inner = (
        <g opacity={op} style={{ pointerEvents }}>
          <BlueprintLineHitStroke
            vbWidth={vbWidth}
            pointerEvents={pointerEvents}
            line={{ x1: r.ax, y1: r.ay, x2: r.bx, y2: r.by }}
            visibleStrokeWidth={swMap * 1.65}
            stroke={stroke}
            strokeDasharray={`${vbWidth * 0.014 * MAP_BLUEPRINT_STROKE_SCALE} ${vbWidth * 0.01 * MAP_BLUEPRINT_STROKE_SCALE}`}
          />
          <circle
            cx={r.ax}
            cy={r.ay}
            r={BP * 0.012}
            fill={stroke}
            stroke="#fff"
            {...commonStroke}
            strokeWidth={swMap * 0.9}
          />
          <circle
            cx={r.bx}
            cy={r.by}
            r={BP * 0.01}
            fill={textureFill}
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

  if (
    g.kind === "cone" &&
    (blueprint.shapeKind === "vision_cone_narrow" ||
      blueprint.shapeKind === "vision_cone_wide") &&
    visionLosContext
  ) {
    return inner;
  }
  if (g.kind === "ricochet" && visionLosContext) {
    return inner;
  }

  return (
    <g transform={transform}>
      <AbilityTextureDefs
        patternId={texturePatternId}
        textureId={blueprint.textureId}
        color={blueprint.color}
        originX={textureAnchor.x}
        originY={textureAnchor.y}
        radialFromOrigin={blueprint.textureRadialFromOrigin === true}
      />
      {inner}
    </g>
  );
}
