"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Agent, GameMap } from "@/types/catalog";
import type {
  StratPlacedAbility,
  StratPlacedAgent,
  StratSide,
  StratStage,
  StratStageTransition,
} from "@/types/strat";
import { StratMapViewer } from "@/components/StratMapViewer";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import {
  mapGeometryScaleFromEditorMeta,
  rootPointToLogicalGeometry,
} from "@/lib/map-geometry-scale";
import { clientToSvgPoint } from "@/lib/svg-coords";
import { allowedAbilitySlotsFromBlueprint } from "@/lib/agent-blueprint-ability-slots";
import { createEmptyStratStage } from "@/lib/strat-stages";
import {
  abilityMetaForSlot,
  fetchValorantAbilityUiBySlug,
  type ValorantAbilityUiMeta,
} from "@/lib/valorant-api-abilities";
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
  clampPointToViewBox,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import {
  stratStagePinForDisplay,
  stratStagePinToStoredAttack,
} from "@/lib/strat-stage-coords";
import { effectiveStratPlacementMode } from "@/lib/strat-blueprint-anchor";
import {
  stratAbilityRotationHandleDistance,
  stratAbilityRotationHandleStored,
} from "@/lib/strat-ability-rotation-handle";
import {
  blueprintPointToStratMapDisplay,
  rectanglePlacementEdgeBlueprint,
  stratAnchorOverrideForBlueprint,
} from "@/lib/strat-blueprint-map-point";

type PlacementMode =
  | null
  | { kind: "agent"; slug: string }
  | {
      kind: "ability";
      slug: string;
      slot: StratPlacedAbility["slot"];
      /** First click stored (attack coords) when using origin + direction placement. */
      pendingOriginAttack?: { x: number; y: number };
    };

type DragState =
  | {
      kind: "agent";
      id: string;
      grabDx: number;
      grabDy: number;
      pointerId: number;
    }
  | {
      kind: "ability";
      id: string;
      grabDx: number;
      grabDy: number;
      pointerId: number;
    }
  | {
      kind: "abilityOrigin";
      id: string;
      grabDx: number;
      grabDy: number;
      pointerId: number;
    }
  | {
      kind: "abilityRotate";
      id: string;
      pointerId: number;
    }
  | null;

function newItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function transitionAnimationName(t: StratStageTransition): string | null {
  switch (t) {
    case "fade":
      return "strat-stage-fade";
    case "slide-left":
      return "strat-stage-slide-from-left";
    case "slide-right":
      return "strat-stage-slide-from-right";
    case "none":
    default:
      return null;
  }
}

const TRANSITION_OPTIONS: { value: StratStageTransition; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide from left" },
  { value: "slide-right", label: "Slide from right" },
];

export function StratStageEditor({
  gameMap,
  side,
  compSlugs,
  agentsCatalog,
  stages,
  onStagesChange,
  controlsMountEl,
  mapMountEl,
}: {
  gameMap: GameMap;
  side: StratSide;
  /** Five agent slugs from the strat form (may include empty strings). */
  compSlugs: string[];
  agentsCatalog: Agent[];
  stages: StratStage[];
  onStagesChange: (next: StratStage[]) => void;
  /** Portal target for Stage/Tokens UI (e.g. coach left column). */
  controlsMountEl: HTMLElement | null;
  /** Portal target for the map viewer only (e.g. coach right column). */
  mapMountEl: HTMLElement | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  /** Display-space end point while choosing ability facing (second click). */
  const [abilityDirPreview, setAbilityDirPreview] = useState<MapPoint | null>(
    null,
  );
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapAnim, setMapAnim] = useState<{
    name: string;
    ms: number;
  } | null>(null);
  /** Left column: stage fields vs token placement controls. */
  const [editorTab, setEditorTab] = useState<"stage" | "tokens">("stage");
  /** Valorant API ability names/descriptions keyed by agent slug. */
  const [valorantAbilityUi, setValorantAbilityUi] = useState<
    Record<string, ValorantAbilityUiMeta[]>
  >({});
  const [valorantUiError, setValorantUiError] = useState<string | null>(null);

  const didMountRef = useRef(false);

  useEffect(() => {
    setPlacementMode(null);
    setSelectedId(null);
  }, [activeStageIndex]);

  const { vb, vbWidth } = useMemo(() => {
    const d = stratMapDisplayData(gameMap, side);
    return { vb: d.vb, vbWidth: d.vb.width };
  }, [gameMap, side]);

  const mapGeoScale = useMemo(
    () =>
      mapGeometryScaleFromEditorMeta(
        normalizeEditorMeta(gameMap.editor_meta),
      ),
    [gameMap.editor_meta],
  );

  const svgPointerToLogical = useCallback(
    (svg: SVGSVGElement, clientX: number, clientY: number) =>
      rootPointToLogicalGeometry(
        clientToSvgPoint(svg, clientX, clientY),
        vb,
        mapGeoScale,
      ),
    [vb, mapGeoScale],
  );

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
          allowedAbilitySlots: allowedAbilitySlotsFromBlueprint(
            a.abilities_blueprint,
          ),
        };
      })
      .filter(
        (x): x is {
          slug: string;
          name: string;
          role: string;
          portraitUrl: string | null;
          allowedAbilitySlots: StratPlacedAbility["slot"][];
        } => x != null,
      );
  }, [compSlugs, agentsCatalog]);

  useEffect(() => {
    let cancelled = false;
    void fetchValorantAbilityUiBySlug()
      .then((data) => {
        if (!cancelled) {
          setValorantAbilityUi(data);
          setValorantUiError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setValorantUiError(
            err instanceof Error ? err.message : "Ability catalog fetch failed",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const focusMapSvg = useCallback(() => {
    requestAnimationFrame(() => {
      svgRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const activeStage: StratStage | undefined = stages[activeStageIndex];
  const safeIndex = Math.min(activeStageIndex, Math.max(0, stages.length - 1));

  useEffect(() => {
    if (safeIndex !== activeStageIndex) {
      setActiveStageIndex(safeIndex);
    }
  }, [safeIndex, activeStageIndex]);

  const patchStage = useCallback(
    (index: number, patch: Partial<StratStage>) => {
      onStagesChange(
        stages.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      );
    },
    [onStagesChange, stages],
  );

  const setAgents = useCallback(
    (index: number, agents: StratPlacedAgent[]) => {
      patchStage(index, { agents });
    },
    [patchStage],
  );

  const setAbilities = useCallback(
    (index: number, abilities: StratPlacedAbility[]) => {
      patchStage(index, { abilities });
    },
    [patchStage],
  );

  const prevIndexRef = useRef(0);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      prevIndexRef.current = activeStageIndex;
      return;
    }
    const prev = prevIndexRef.current;
    prevIndexRef.current = activeStageIndex;
    if (prev === activeStageIndex) return;
    const left = stages[prev];
    const t = left?.transition ?? "fade";
    const ms = left?.transitionMs ?? 450;
    const name = transitionAnimationName(t);
    if (!name) {
      setMapAnim(null);
      return;
    }
    setMapAnim({ name, ms });
    const tid = window.setTimeout(() => setMapAnim(null), ms + 40);
    return () => window.clearTimeout(tid);
  }, [activeStageIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setSelectedId(null);
        setAbilityDirPreview(null);
        setPlacementMode(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (!selectedId || !activeStage) return;
      e.preventDefault();
      const id = selectedId;
      setAgents(
        activeStageIndex,
        activeStage.agents.filter((a) => a.id !== id),
      );
      setAbilities(
        activeStageIndex,
        activeStage.abilities.filter((a) => a.id !== id),
      );
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, activeStage, activeStageIndex, setAgents, setAbilities]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !activeStage) return;
      const raw = svgPointerToLogical(svg, e.clientX, e.clientY);
      const p =
        drag.kind === "abilityRotate"
          ? stratStagePinToStoredAttack(
              vb,
              side,
              clampPointToViewBox(vb, raw),
            )
          : stratStagePinToStoredAttack(
              vb,
              side,
              clampPointToViewBox(vb, {
                x: raw.x - drag.grabDx,
                y: raw.y - drag.grabDy,
              }),
            );
      if (drag.kind === "agent") {
        setAgents(
          activeStageIndex,
          activeStage.agents.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
        );
      } else if (drag.kind === "ability") {
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
        );
      } else if (drag.kind === "abilityOrigin") {
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
        );
      } else if (drag.kind === "abilityRotate") {
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((a) => {
            if (a.id !== drag.id) return a;
            const rotationDeg =
              (Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI;
            return { ...a, rotationDeg };
          }),
        );
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    drag,
    activeStage,
    activeStageIndex,
    vb,
    side,
    setAgents,
    setAbilities,
    svgPointerToLogical,
  ]);

  function onMapBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (!placementMode || !svgRef.current || !activeStage) return;
    const raw = svgPointerToLogical(svgRef.current, e.clientX, e.clientY);
    const pDisplay = clampPointToViewBox(vb, raw);
    const p = stratStagePinToStoredAttack(vb, side, pDisplay);
    if (placementMode.kind === "agent") {
      const next: StratPlacedAgent = {
        id: newItemId(),
        agentSlug: placementMode.slug,
        x: p.x,
        y: p.y,
      };
      setAgents(activeStageIndex, [...activeStage.agents, next]);
      setPlacementMode(null);
      setAbilityDirPreview(null);
      setSelectedId(null);
      return;
    }

    const bp = agentBlueprintForSlot(
      agentsCatalog,
      placementMode.slug,
      placementMode.slot,
    );
    const placeMode = bp
      ? effectiveStratPlacementMode(bp)
      : "center";

    if (placeMode === "origin_direction") {
      if (!placementMode.pendingOriginAttack) {
        setPlacementMode({
          kind: "ability",
          slug: placementMode.slug,
          slot: placementMode.slot,
          pendingOriginAttack: { x: p.x, y: p.y },
        });
        setSelectedId(null);
        return;
      }
      const o = placementMode.pendingOriginAttack;
      const rotationDeg = (Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI;
      const next: StratPlacedAbility = {
        id: newItemId(),
        agentSlug: placementMode.slug,
        slot: placementMode.slot,
        x: o.x,
        y: o.y,
        rotationDeg,
      };
      setAbilities(activeStageIndex, [...activeStage.abilities, next]);
      setPlacementMode(null);
      setAbilityDirPreview(null);
      setSelectedId(null);
      return;
    }

    const next: StratPlacedAbility = {
      id: newItemId(),
      agentSlug: placementMode.slug,
      slot: placementMode.slot,
      x: p.x,
      y: p.y,
    };
    setAbilities(activeStageIndex, [...activeStage.abilities, next]);
    setPlacementMode(null);
    setAbilityDirPreview(null);
    setSelectedId(null);
  }

  const tokenR = vbWidth * 0.018;
  const abilityR = vbWidth * 0.012;
  const fontAgent = Math.max(10, vbWidth * 0.016);
  const fontAbility = Math.max(9, vbWidth * 0.013);

  const overlay = activeStage ? (
    <g style={{ pointerEvents: "auto" }}>
      <rect
        x={vb.minX}
        y={vb.minY}
        width={vb.width}
        height={vb.height}
        fill="transparent"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (placementMode) {
            onMapBackgroundPointerDown(e);
            return;
          }
          setSelectedId(null);
        }}
        onPointerMove={(e) => {
          if (
            placementMode?.kind !== "ability" ||
            !placementMode.pendingOriginAttack ||
            !svgRef.current
          ) {
            setAbilityDirPreview(null);
            return;
          }
          const r = svgPointerToLogical(svgRef.current, e.clientX, e.clientY);
          setAbilityDirPreview(clampPointToViewBox(vb, r));
        }}
        onPointerLeave={() => setAbilityDirPreview(null)}
        style={{
          cursor:
            placementMode?.kind === "ability" &&
            placementMode.pendingOriginAttack
              ? "crosshair"
              : placementMode
                ? "crosshair"
                : "default",
        }}
      />
      {placementMode?.kind === "ability" &&
      placementMode.pendingOriginAttack &&
      abilityDirPreview ? (
        <line
          x1={
            stratStagePinForDisplay(vb, side, placementMode.pendingOriginAttack)
              .x
          }
          y1={
            stratStagePinForDisplay(vb, side, placementMode.pendingOriginAttack)
              .y
          }
          x2={abilityDirPreview.x}
          y2={abilityDirPreview.y}
          stroke="rgba(34,211,238,0.9)"
          strokeWidth={Math.max(vbWidth * 0.0035, 1.5)}
          strokeDasharray="12 10"
          pointerEvents="none"
        />
      ) : null}
      {activeStage.agents.map((a) => {
        const meta = roster.find((r) => r.slug === a.agentSlug);
        const accent = meta
          ? roleAccent(meta.role)
          : { fill: "#94a3b8", stroke: "#fff" };
        const abbr = meta ? abbrevAgentName(meta.name) : a.agentSlug.slice(0, 2).toUpperCase();
        const sel = selectedId === a.id;
        const pos = stratStagePinForDisplay(vb, side, { x: a.x, y: a.y });
        return (
          <g
            key={a.id}
            transform={`translate(${pos.x},${pos.y})`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (placementMode) return;
              setSelectedId(a.id);
              focusMapSvg();
              const svg = svgRef.current;
              if (svg) {
                const o = svgPointerToLogical(svg, e.clientX, e.clientY);
                setDrag({
                  kind: "agent",
                  id: a.id,
                  grabDx: o.x - pos.x,
                  grabDy: o.y - pos.y,
                  pointerId: e.pointerId,
                });
              }
            }}
            style={{ cursor: placementMode ? "default" : "grab" }}
          >
            <StratAgentMapPinSvg
              tokenR={tokenR}
              vbWidth={vbWidth}
              abbr={abbr}
              fontAgent={fontAgent}
              accent={accent}
              portraitUrl={meta?.portraitUrl}
              selected={sel}
              pinId={a.id}
            />
          </g>
        );
      })}
      {activeStage.abilities.map((ab) => {
        const st = abilitySlotStyle(ab.slot);
        const sel = selectedId === ab.id;
        const pos = stratStagePinForDisplay(vb, side, { x: ab.x, y: ab.y });
        const bp = agentBlueprintForSlot(agentsCatalog, ab.agentSlug, ab.slot);
        const useTwoHandles =
          bp != null && effectiveStratPlacementMode(bp) === "origin_direction";
        const stratOv = bp ? stratAnchorOverrideForBlueprint(bp) : undefined;
        const isRectOD =
          useTwoHandles &&
          bp != null &&
          bp.shapeKind === "rectangle" &&
          bp.geometry.kind === "rectangle";
        const rotDist = stratAbilityRotationHandleDistance(vbWidth);
        const rotStored = stratAbilityRotationHandleStored(
          { x: ab.x, y: ab.y },
          ab.rotationDeg ?? 0,
          rotDist,
        );
        const rotPos = stratStagePinForDisplay(vb, side, rotStored);
        const edgePos =
          isRectOD && bp && bp.geometry.kind === "rectangle"
            ? blueprintPointToStratMapDisplay(
                rectanglePlacementEdgeBlueprint(bp.geometry),
                bp,
                pos.x,
                pos.y,
                vbWidth,
                ab.rotationDeg ?? 0,
                stratOv,
              )
            : null;

        const abilitySvg = bp ? (
          <StratAbilityBlueprintSvg
            blueprint={bp}
            mapX={pos.x}
            mapY={pos.y}
            vbWidth={vbWidth}
            rotationDeg={ab.rotationDeg ?? 0}
            selected={sel}
            stratAnchorOverride={stratOv}
            abilityDisplayIconUrl={
              bp.shapeKind === "point"
                ? abilityMetaForSlot(
                    valorantAbilityUi,
                    ab.agentSlug,
                    ab.slot,
                  )?.displayIcon ?? null
                : null
            }
            pointerEvents="auto"
          />
        ) : (
          <g transform={`translate(${pos.x},${pos.y})`}>
            <circle
              r={abilityR}
              fill={st.fill}
              stroke={sel ? "#fae8ff" : st.stroke}
              strokeWidth={vbWidth * 0.0024 * (sel ? 2.2 : 1)}
            />
            <text
              y={fontAbility * 0.35}
              textAnchor="middle"
              fill="rgba(15,23,42,0.92)"
              style={{
                fontSize: fontAbility,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 800,
                pointerEvents: "none",
              }}
            >
              {abilitySlotLabel(ab.slot)}
            </text>
          </g>
        );

        if (useTwoHandles) {
          return (
            <g key={ab.id}>
              <g
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (placementMode) return;
                  setSelectedId(ab.id);
                  focusMapSvg();
                }}
                style={{
                  cursor: placementMode ? "default" : "pointer",
                }}
              >
                {abilitySvg}
              </g>
              <line
                x1={isRectOD && edgePos ? edgePos.x : pos.x}
                y1={isRectOD && edgePos ? edgePos.y : pos.y}
                x2={isRectOD ? pos.x : rotPos.x}
                y2={isRectOD ? pos.y : rotPos.y}
                stroke="rgba(34, 211, 238, 0.7)"
                strokeWidth={Math.max(vbWidth * 0.0018, 0.85)}
                strokeDasharray="6 5"
                pointerEvents="none"
              />
              <circle
                cx={isRectOD && edgePos ? edgePos.x : pos.x}
                cy={isRectOD && edgePos ? edgePos.y : pos.y}
                r={Math.max(vbWidth * 0.01, 5)}
                fill="rgb(250, 204, 21)"
                stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                strokeWidth={Math.max(vbWidth * 0.0024, 1) * (sel ? 2.2 : 1)}
                style={{
                  cursor: placementMode ? "default" : "grab",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (placementMode) return;
                  setSelectedId(ab.id);
                  focusMapSvg();
                  const svg = svgRef.current;
                  if (!svg) return;
                  const o = svgPointerToLogical(svg, e.clientX, e.clientY);
                  const grabFrom = isRectOD && edgePos ? edgePos : pos;
                  setDrag({
                    kind: "abilityOrigin",
                    id: ab.id,
                    grabDx: o.x - grabFrom.x,
                    grabDy: o.y - grabFrom.y,
                    pointerId: e.pointerId,
                  });
                }}
              />
              <circle
                cx={isRectOD ? pos.x : rotPos.x}
                cy={isRectOD ? pos.y : rotPos.y}
                r={Math.max(vbWidth * 0.009, 4.5)}
                fill="rgb(34, 211, 238)"
                stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                strokeWidth={Math.max(vbWidth * 0.002, 1) * (sel ? 2 : 1)}
                style={{
                  cursor: placementMode ? "default" : "grab",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (placementMode) return;
                  setSelectedId(ab.id);
                  focusMapSvg();
                  setDrag({
                    kind: "abilityRotate",
                    id: ab.id,
                    pointerId: e.pointerId,
                  });
                }}
              />
            </g>
          );
        }

        return (
          <g
            key={ab.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (placementMode) return;
              setSelectedId(ab.id);
              focusMapSvg();
              const svg = svgRef.current;
              if (svg) {
                const o = svgPointerToLogical(svg, e.clientX, e.clientY);
                setDrag({
                  kind: "ability",
                  id: ab.id,
                  grabDx: o.x - pos.x,
                  grabDy: o.y - pos.y,
                  pointerId: e.pointerId,
                });
              }
            }}
            style={{ cursor: placementMode ? "default" : "grab" }}
          >
            {abilitySvg}
          </g>
        );
      })}
    </g>
  ) : null;

  function addStage() {
    onStagesChange([...stages, createEmptyStratStage(stages.length)]);
    setActiveStageIndex(stages.length);
  }

  function removeStage(idx: number) {
    if (stages.length <= 1) return;
    const next = stages.filter((_, i) => i !== idx);
    onStagesChange(next);
    setActiveStageIndex((i) => {
      if (i > idx) return i - 1;
      if (i === idx) return Math.max(0, idx - 1);
      return i;
    });
  }

  const controlsPanel = !activeStage ? (
    <p className="text-sm text-amber-200/80">
      Add strat stages data (save error). Try refreshing the coach page.
    </p>
  ) : (
    <div className="flex min-h-0 w-full min-w-0 flex-col">
      <div className="flex gap-1 rounded-lg border border-violet-800/45 bg-slate-950/70 p-0.5">
          <button
            type="button"
            onClick={() => setEditorTab("stage")}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition ${
              editorTab === "stage"
                ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                : "text-violet-300/80 hover:bg-violet-950/50 hover:text-violet-100"
            }`}
          >
            Stage
          </button>
          <button
            type="button"
            onClick={() => setEditorTab("tokens")}
            className={`min-w-0 flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition ${
              editorTab === "tokens"
                ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                : "text-violet-300/80 hover:bg-violet-950/50 hover:text-violet-100"
            }`}
          >
            Tokens
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
          {editorTab === "stage" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <span className="label">Stages</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {stages.map((st, idx) => (
                      <div key={st.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveStageIndex(idx)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                            idx === activeStageIndex
                              ? "border-violet-500/70 bg-violet-950/50 text-white"
                              : "border-violet-800/40 bg-slate-950/50 text-violet-200/80 hover:border-violet-600/50"
                          }`}
                        >
                          {st.title || `Stage ${idx + 1}`}
                        </button>
                        {stages.length > 1 ? (
                          <button
                            type="button"
                            title="Remove stage"
                            onClick={() => removeStage(idx)}
                            className="rounded p-1 text-violet-400/60 hover:bg-fuchsia-950/40 hover:text-fuchsia-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addStage}
                      className="btn-secondary inline-flex items-center gap-1 py-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Stage
                    </button>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-secondary p-2"
                    disabled={activeStageIndex <= 0}
                    onClick={() =>
                      setActiveStageIndex((i) => Math.max(0, i - 1))
                    }
                    title="Previous stage"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary p-2"
                    disabled={activeStageIndex >= stages.length - 1}
                    onClick={() =>
                      setActiveStageIndex((i) =>
                        Math.min(stages.length - 1, i + 1),
                      )
                    }
                    title="Next stage"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`st-title-${activeStage.id}`}>
                    Stage title
                  </label>
                  <input
                    id={`st-title-${activeStage.id}`}
                    value={activeStage.title}
                    onChange={(e) =>
                      patchStage(activeStageIndex, { title: e.target.value })
                    }
                    className="input-field mt-1"
                    placeholder="e.g. Default take"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`st-tr-${activeStage.id}`}>
                    Transition to next stage
                  </label>
                  <select
                    id={`st-tr-${activeStage.id}`}
                    value={activeStage.transition}
                    onChange={(e) =>
                      patchStage(activeStageIndex, {
                        transition: e.target.value as StratStageTransition,
                      })
                    }
                    className="input-field mt-1"
                  >
                    {TRANSITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`st-ms-${activeStage.id}`}>
                    Transition duration (ms)
                  </label>
                  <input
                    id={`st-ms-${activeStage.id}`}
                    type="number"
                    min={0}
                    max={4000}
                    step={50}
                    value={activeStage.transitionMs}
                    onChange={(e) =>
                      patchStage(activeStageIndex, {
                        transitionMs: Math.min(
                          4000,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      })
                    }
                    className="input-field mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`st-notes-${activeStage.id}`}>
                    Stage notes
                  </label>
                  <textarea
                    id={`st-notes-${activeStage.id}`}
                    value={activeStage.notes}
                    onChange={(e) =>
                      patchStage(activeStageIndex, { notes: e.target.value })
                    }
                    className="input-field mt-1 min-h-[120px]"
                    placeholder="Coach notes for this beat…"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-violet-800/35 bg-slate-950/40 p-3">
              <p className="text-xs text-violet-300/70">
                {placementMode ? (
                  <>
                    <span className="text-violet-200">Placement mode:</span>{" "}
                    {placementMode.kind === "agent" ? (
                      <>click the map to drop an agent token ({placementMode.slug}).</>
                    ) : placementMode.pendingOriginAttack ? (
                      <>
                        Second click: <strong className="text-cyan-200">face</strong>{" "}
                        {placementMode.slot.toUpperCase()} for {placementMode.slug}{" "}
                        (cyan preview line).
                      </>
                    ) : (
                      <>
                        Click the map for{" "}
                        {(() => {
                          const b = agentBlueprintForSlot(
                            agentsCatalog,
                            placementMode.slug,
                            placementMode.slot,
                          );
                          const m = b
                            ? effectiveStratPlacementMode(b)
                            : "center";
                          return m === "origin_direction" ? (
                            <>
                              <strong className="text-cyan-200">origin</strong>, then
                              again for direction
                            </>
                          ) : (
                            <>
                              {placementMode.slot.toUpperCase()} ({placementMode.slug})
                            </>
                          );
                        })()}
                        .
                      </>
                    )}{" "}
                    <button
                      type="button"
                      className="text-violet-300 underline"
                      onClick={() => setPlacementMode(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    Choose <strong className="text-slate-200">agent name</strong>{" "}
                    or a <strong className="text-slate-200">Q/E/C/X</strong> chip,
                    then click the map. Drag pins to adjust; select a pin — the map
                    grabs focus — then Delete or Backspace removes it (Escape
                    clears selection).{" "}
                    {
                      "Ability chips follow each agent's coach blueprint when set."
                    }
                  </>
                )}
              </p>
              {valorantUiError ? (
                <p className="mt-2 text-[11px] text-amber-200/70">
                  Could not load Valorant ability names ({valorantUiError}). Slot
                  letters still work.
                </p>
              ) : null}
              {roster.length === 0 ? (
                <p className="mt-2 text-xs text-amber-200/80">
                  Fill the five agents in the comp (Details tab) to enable tokens.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {roster.map((r) => (
                    <div
                      key={r.slug}
                      className="flex max-w-full flex-col gap-1 rounded-lg border border-violet-800/30 bg-slate-950/30 px-2 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setPlacementMode((m) =>
                              m?.kind === "agent" && m.slug === r.slug
                                ? null
                                : { kind: "agent", slug: r.slug },
                            )
                          }
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${
                            placementMode?.kind === "agent" &&
                            placementMode.slug === r.slug
                              ? "border-violet-400 bg-violet-950/60 text-white"
                              : "border-violet-800/45 bg-slate-950/60 text-violet-200"
                          }`}
                        >
                          {r.name}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.allowedAbilitySlots.map((slot) => {
                          const vm = abilityMetaForSlot(
                            valorantAbilityUi,
                            r.slug,
                            slot,
                          );
                          const title = vm
                            ? `${vm.displayName}\n\n${vm.description}`
                            : `Place ${slot.toUpperCase()} for ${r.name}`;
                          return (
                            <button
                              key={slot}
                              type="button"
                              title={title}
                              onClick={() =>
                                setPlacementMode((m) =>
                                  m?.kind === "ability" &&
                                  m.slug === r.slug &&
                                  m.slot === slot
                                    ? null
                                    : { kind: "ability", slug: r.slug, slot },
                                )
                              }
                              className={`flex min-h-[2.25rem] min-w-[3.25rem] max-w-[7rem] flex-col items-center justify-center rounded border px-1 py-0.5 text-left leading-tight transition ${
                                placementMode?.kind === "ability" &&
                                placementMode.slug === r.slug &&
                                placementMode.slot === slot
                                  ? "border-cyan-400 bg-cyan-950/50 text-white"
                                  : "border-violet-800/50 bg-slate-950/70 text-violet-200"
                              }`}
                            >
                              <span className="text-[11px] font-bold">
                                {slot.toUpperCase()}
                              </span>
                              {vm ? (
                                <span className="line-clamp-2 w-full text-center text-[9px] font-normal text-violet-300/85">
                                  {vm.displayName}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );

  const mapPanel =
    activeStage ? (
      <div
        className="flex min-h-0 min-h-[min(56dvh,720px)] w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-1"
        style={{
          animation: mapAnim
            ? `${mapAnim.name} ${mapAnim.ms}ms ease both`
            : undefined,
        }}
      >
        <StratMapViewer
          ref={svgRef}
          gameMap={gameMap}
          side={side}
          showLayerToggles={false}
          showFooter={false}
          embed
        >
          {overlay}
        </StratMapViewer>
      </div>
    ) : null;

  return (
    <>
      {controlsMountEl
        ? createPortal(controlsPanel, controlsMountEl)
        : null}
      {mapMountEl && mapPanel ? createPortal(mapPanel, mapMountEl) : null}
    </>
  );
}
