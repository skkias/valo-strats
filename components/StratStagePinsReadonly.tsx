"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent } from "@/types/catalog";
import type { StratSide, StratStage } from "@/types/strat";
import type { ViewBoxRect } from "@/lib/map-path";
import { stratStagePinForDisplay } from "@/lib/strat-stage-coords";
import { StratAgentMapPinSvg } from "@/components/StratAgentMapPinSvg";
import {
  abbrevAgentName,
  abilitySlotLabel,
  abilitySlotStyle,
  roleAccent,
} from "@/lib/strat-stage-pin-styles";
import { agentBlueprintForSlot } from "@/lib/strat-ability-blueprint-lookup";
import { StratAbilityBlueprintSvg } from "@/components/StratAbilityBlueprintSvg";
import {
  abilityMetaForSlot,
  fetchValorantAbilityUiBySlug,
  type ValorantAbilityUiMeta,
} from "@/lib/valorant-api-abilities";

export function StratStagePinsReadonly({
  vb,
  vbWidth,
  side,
  stage,
  compSlugs,
  agentsCatalog,
}: {
  vb: ViewBoxRect;
  vbWidth: number;
  side: StratSide;
  stage: StratStage;
  compSlugs: string[];
  agentsCatalog: Agent[];
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
          portraitUrl:
            raw?.startsWith("https://") === true ? raw : null,
        };
      })
      .filter(
        (x): x is {
          slug: string;
          name: string;
          role: string;
          portraitUrl: string | null;
        } => x != null,
      );
  }, [compSlugs, agentsCatalog]);

  const tokenR = vbWidth * 0.018;
  const abilityR = vbWidth * 0.012;
  const fontAgent = Math.max(10, vbWidth * 0.016);
  const fontAbility = Math.max(9, vbWidth * 0.013);

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

  return (
    <g style={{ pointerEvents: "none" }}>
      {stage.agents.map((a) => {
        const meta = roster.find((r) => r.slug === a.agentSlug);
        const accent = meta
          ? roleAccent(meta.role)
          : { fill: "#94a3b8", stroke: "#fff" };
        const abbr = meta
          ? abbrevAgentName(meta.name)
          : a.agentSlug.slice(0, 2).toUpperCase();
        const pos = stratStagePinForDisplay(vb, side, { x: a.x, y: a.y });
        return (
          <g key={a.id} transform={`translate(${pos.x},${pos.y})`}>
            <StratAgentMapPinSvg
              tokenR={tokenR}
              vbWidth={vbWidth}
              abbr={abbr}
              fontAgent={fontAgent}
              accent={accent}
              portraitUrl={meta?.portraitUrl}
              selected={false}
              pinId={a.id}
              pointerEventsNoneOnText
            />
          </g>
        );
      })}
      {stage.abilities.map((ab) => {
        const st = abilitySlotStyle(ab.slot);
        const pos = stratStagePinForDisplay(vb, side, { x: ab.x, y: ab.y });
        const bp = agentBlueprintForSlot(agentsCatalog, ab.agentSlug, ab.slot);
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
                abilityDisplayIconUrl={
                  bp.shapeKind === "point"
                    ? abilityMetaForSlot(
                        valorantAbilityUi,
                        ab.agentSlug,
                        ab.slot,
                      )?.displayIcon ?? null
                    : null
                }
              />
            ) : (
              <g transform={`translate(${pos.x},${pos.y})`}>
                <circle
                  r={abilityR}
                  fill={st.fill}
                  stroke={st.stroke}
                  strokeWidth={vbWidth * 0.0024}
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
    </g>
  );
}
