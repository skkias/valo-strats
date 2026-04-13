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
import { appendPlacedAbilitiesVisionBlockers } from "@/lib/ability-vision-blockers";
import {
  buildVisionLosContext,
  computeVisionConeLosPolygon,
  isVisionOriginInPlayable,
  type VisionLosContext,
} from "@/lib/vision-cone-los";
import { stratAgentVisionConeDisplayHints } from "@/lib/strat-agent-vision-cone";

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

  const visionLosBase = useMemo(
    () => buildVisionLosContext(gameMap, side, stage.doorOpenByOverlayId),
    [gameMap, side, stage.doorOpenByOverlayId],
  );
  const visionLosContextMerged = useMemo(() => {
    if (!visionLosBase) return null;
    return appendPlacedAbilitiesVisionBlockers(visionLosBase, {
      placedAbilities: stage.abilities,
      agentsCatalog,
      vb,
      side,
      vbWidth,
      mapPinScale: pinS,
    });
  }, [
    visionLosBase,
    stage.abilities,
    agentsCatalog,
    vb,
    side,
    vbWidth,
    pinS,
  ]);
  const visionLosContextByExcludeId = useMemo(() => {
    const m = new Map<string, VisionLosContext>();
    if (!visionLosBase) return m;
    for (const ab of stage.abilities) {
      m.set(
        ab.id,
        appendPlacedAbilitiesVisionBlockers(visionLosBase, {
          placedAbilities: stage.abilities,
          agentsCatalog,
          vb,
          side,
          vbWidth,
          mapPinScale: pinS,
          excludePlacedAbilityId: ab.id,
        }),
      );
    }
    return m;
  }, [
    visionLosBase,
    stage.abilities,
    agentsCatalog,
    vb,
    side,
    vbWidth,
    pinS,
  ]);

  return (
    <g style={{ pointerEvents: "none" }}>
      {stage.agents
        .filter((a) => a.visionConeWidth)
        .map((agent) => {
          const pos = stratStagePinForDisplay(vb, side, {
            x: agent.x,
            y: agent.y,
          });
          const rot = agent.visionConeRotationDeg ?? 0;
          const w = agent.visionConeWidth!;
          const sh = stratAgentVisionConeDisplayHints(
            pos,
            vbWidth,
            w,
            rot,
            pinS,
          );
          const inPlayable =
            visionLosContextMerged != null &&
            isVisionOriginInPlayable(pos, visionLosContextMerged);
          const losPoly =
            visionLosContextMerged && inPlayable
              ? computeVisionConeLosPolygon({
                  origin: pos,
                  left: { x: sh.lx, y: sh.ly },
                  right: { x: sh.rx, y: sh.ry },
                  context: visionLosContextMerged,
                })
              : [pos, { x: sh.lx, y: sh.ly }, { x: sh.rx, y: sh.ry }];
          return (
            <g key={`vc-${agent.id}`}>
              <polygon
                points={losPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(244,114,182,0.2)"
                stroke="none"
              />
            </g>
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
                visionLosContext={
                  visionLosContextByExcludeId.get(ab.id) ?? visionLosContextMerged
                }
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
