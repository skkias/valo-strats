"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, GameMap } from "@/types/catalog";
import type { StratSide, StratStage } from "@/types/strat";
import type { ViewBoxRect } from "@/lib/map-path";
import { stratStagePinForDisplay } from "@/lib/strat-stage-coords";
import {
  StratStageAgentTokens,
  type StratAgentTokenTransition,
} from "@/components/StratStageAgentTokens";
import {
  abilitySlotLabel,
} from "@/lib/strat-stage-pin-styles";
import { agentBlueprintForSlot } from "@/lib/strat-ability-blueprint-lookup";
import { StratAbilityBlueprintSvg } from "@/components/StratAbilityBlueprintSvg";
import {
  abilityMetaForSlot,
  fetchValorantAbilityUiBySlug,
  type ValorantAbilityUiMeta,
} from "@/lib/valorant-api-abilities";
import { stratAnchorOverrideForBlueprint } from "@/lib/strat-blueprint-map-point";
import {
  clampCoachMapPinScale,
  stratAbilityPinDimensions,
} from "@/lib/strat-map-pin-scale";
import { buildVisionLosContext } from "@/lib/vision-cone-los";

function visionConeDisplayShape(
  origin: { x: number; y: number },
  vbWidth: number,
  width: "wide" | "thin",
  rotationDeg: number,
  scale = 1,
) {
  const len = vbWidth * (width === "wide" ? 0.13 : 0.16) * scale;
  const halfDeg = width === "wide" ? 52 : 28;
  const base = (rotationDeg * Math.PI) / 180;
  const left = base + (halfDeg * Math.PI) / 180;
  const right = base - (halfDeg * Math.PI) / 180;
  return {
    lx: origin.x + Math.cos(left) * len,
    ly: origin.y + Math.sin(left) * len,
    rx: origin.x + Math.cos(right) * len,
    ry: origin.y + Math.sin(right) * len,
  };
}

export function StratStagePinsReadonly({
  gameMap,
  vb,
  vbWidth,
  side,
  stage,
  compSlugs,
  agentsCatalog,
  agentTransition,
  pinScale = 1,
}: {
  gameMap: GameMap;
  vb: ViewBoxRect;
  vbWidth: number;
  side: StratSide;
  stage: StratStage;
  compSlugs: string[];
  agentsCatalog: Agent[];
  /** When the viewed stage tab changes, animate agent tokens from the previous stage. */
  agentTransition?: StratAgentTokenTransition;
  /** Coach / saved browser preference (default 1). */
  pinScale?: number;
}) {
  const roster = useMemo(() => {
    const slugs = compSlugs.map((s) => s.trim()).filter(Boolean);
    const uniq = [...new Set(slugs)];
    return uniq
      .map((slug) => {
        const a = agentsCatalog.find((x) => x.slug === slug);
        if (!a) return null;
        const raw = a.portrait_url?.trim();
        return {
          slug,
          name: a.name,
          role: a.role,
          themeColor: a.theme_color ?? null,
          portraitUrl:
            raw?.startsWith("https://") === true ? raw : null,
        };
      })
      .filter(
        (x): x is {
          slug: string;
          name: string;
          role: string;
          themeColor: string | null;
          portraitUrl: string | null;
        } => x != null,
      );
  }, [compSlugs, agentsCatalog]);

  const pinS = clampCoachMapPinScale(pinScale);
  const { abilityR, fontAbility } = stratAbilityPinDimensions(
    vbWidth,
    pinScale,
  );

  const [valorantAbilityUi, setValorantAbilityUi] = useState<
    Record<string, ValorantAbilityUiMeta[]>
  >({});

  useEffect(() => {
    let cancelled = false;
    void fetchValorantAbilityUiBySlug()
      .then((data) => {
        if (!cancelled) setValorantAbilityUi(data);
      })
      .catch(() => {
        if (!cancelled) setValorantAbilityUi({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visionLosContext = useMemo(
    () => buildVisionLosContext(gameMap, side),
    [gameMap, side],
  );

  return (
    <g style={{ pointerEvents: "none" }}>
      {stage.visionCones.map((cone) => {
        const pos = stratStagePinForDisplay(vb, side, { x: cone.x, y: cone.y });
        const sh = visionConeDisplayShape(
          pos,
          vbWidth,
          cone.width,
          cone.rotationDeg,
          pinS,
        );
        return (
          <polygon
            key={cone.id}
            points={`${pos.x},${pos.y} ${sh.lx},${sh.ly} ${sh.rx},${sh.ry}`}
            fill="rgba(244,114,182,0.2)"
            stroke="rgb(244,114,182)"
            strokeWidth={Math.max(vbWidth * 0.0018, 0.8)}
            strokeLinejoin="round"
          />
        );
      })}
      {stage.abilities.map((ab) => {
        const agentTheme =
          agentsCatalog.find((a) => a.slug === ab.agentSlug)?.theme_color ??
          "rgb(34,211,238)";
        const pos = stratStagePinForDisplay(vb, side, { x: ab.x, y: ab.y });
        const bp = agentBlueprintForSlot(agentsCatalog, ab.agentSlug, ab.slot);
        const stratOv = bp ? stratAnchorOverrideForBlueprint(bp) : undefined;

        return (
          <g key={ab.id}>
            {bp ? (
              <StratAbilityBlueprintSvg
                blueprint={bp}
                mapX={pos.x}
                mapY={pos.y}
                vbWidth={vbWidth}
                rotationDeg={ab.rotationDeg ?? 0}
                pointerEvents="none"
                stratAnchorOverride={stratOv}
                mapPinScale={pinScale}
                abilityDisplayIconUrl={
                  bp.shapeKind === "point"
                    ? abilityMetaForSlot(
                        valorantAbilityUi,
                        ab.agentSlug,
                        ab.slot,
                      )?.displayIcon ?? null
                    : null
                }
                visionLosContext={visionLosContext}
              />
            ) : (
              <g transform={`translate(${pos.x},${pos.y})`}>
                <circle
                  r={abilityR}
                  fill={agentTheme}
                  stroke={agentTheme}
                  strokeWidth={vbWidth * 0.0024 * pinS}
                />
                <text
                  y={fontAbility * 0.35}
                  textAnchor="middle"
                  fill="rgba(15,23,42,0.92)"
                  style={{
                    fontSize: fontAbility,
                    fontFamily: "system-ui, sans-serif",
                    fontWeight: 800,
                  }}
                >
                  {abilitySlotLabel(ab.slot)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <StratStageAgentTokens
        vb={vb}
        vbWidth={vbWidth}
        side={side}
        agents={stage.agents}
        roster={roster}
        transition={agentTransition ?? null}
        pinScale={pinScale}
        pointerEventsNoneOnText
      />
    </g>
  );
}
