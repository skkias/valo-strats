"use client";

import { useMemo } from "react";
import type { Agent } from "@/types/catalog";
import type { StratStage } from "@/types/strat";
import {
  abbrevAgentName,
  abilitySlotLabel,
  abilitySlotStyle,
  roleAccent,
} from "@/lib/strat-stage-pin-styles";

export function StratStagePinsReadonly({
  vbWidth,
  stage,
  compSlugs,
  agentsCatalog,
}: {
  vbWidth: number;
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
        return a ? { slug, name: a.name, role: a.role } : null;
      })
      .filter((x): x is { slug: string; name: string; role: string } => x != null);
  }, [compSlugs, agentsCatalog]);

  const tokenR = vbWidth * 0.018;
  const abilityR = vbWidth * 0.012;
  const fontAgent = Math.max(10, vbWidth * 0.016);
  const fontAbility = Math.max(9, vbWidth * 0.013);
  const strokeBase = vbWidth * 0.0022;

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
        return (
          <g key={a.id} transform={`translate(${a.x},${a.y})`}>
            <circle
              r={tokenR}
              fill={accent.fill}
              stroke={accent.stroke}
              strokeWidth={vbWidth * 0.0028}
            />
            <text
              y={fontAgent * 0.35}
              textAnchor="middle"
              fill="rgba(15,23,42,0.92)"
              style={{
                fontSize: fontAgent,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 800,
              }}
            >
              {abbr}
            </text>
          </g>
        );
      })}
      {stage.abilities.map((ab) => {
        const st = abilitySlotStyle(ab.slot);
        return (
          <g key={ab.id} transform={`translate(${ab.x},${ab.y})`}>
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
        );
      })}
    </g>
  );
}
