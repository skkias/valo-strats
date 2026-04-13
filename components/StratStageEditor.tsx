"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  StratStageAgentTokens,
  type StratAgentTokenTransition,
} from "@/components/StratStageAgentTokens";
import {
  COACH_MAP_PIN_SCALE_MAX,
  COACH_MAP_PIN_SCALE_MIN,
  clampCoachMapPinScale,
  readCoachMapPinScale,
  stratAbilityPinDimensions,
  writeCoachMapPinScale,
} from "@/lib/strat-map-pin-scale";
import {
  abilitySlotLabel,
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
import {
  effectiveStratAttachToAgent,
  effectiveStratPlacementMode,
} from "@/lib/strat-blueprint-anchor";
import {
  stratAbilityRotationHandleDistance,
  stratAbilityRotationHandleStored,
} from "@/lib/strat-ability-rotation-handle";
import {
  blueprintPointToStratMapDisplay,
  rectangleStratPivotBlueprint,
  stratAnchorOverrideForBlueprint,
} from "@/lib/strat-blueprint-map-point";
import { appendPlacedAbilitiesVisionBlockers } from "@/lib/ability-vision-blockers";
import {
  resolveStratAttachAgent,
  resolvedPlacedAbilityStoredPosition,
} from "@/lib/strat-placed-ability-position";
import {
  buildVisionLosContext,
  computeVisionConeLosPolygon,
  isVisionOriginInPlayable,
  type VisionLosContext,
} from "@/lib/vision-cone-los";
import {
  catalogDefaultDoorOpen,
  effectiveDoorIsOpen,
} from "@/lib/strat-stage-door-states";
import {
  stratAgentVisionConeDisplayHints,
  stratAgentVisionConeHandleAlongBounds,
  stratAgentVisionConeRayInDisplay,
} from "@/lib/strat-agent-vision-cone";

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
  | {
      kind: "agentVisionConeRotate";
      agentId: string;
      pointerId: number;
      /** Distance along look ray in display space; clamped to [sNear, sFar]. */
      handleAlongDist: number;
    }
  | null;

function newItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TRANSITION_OPTIONS: { value: StratStageTransition; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide from left" },
  { value: "slide-right", label: "Slide from right" },
];

const VISION_CONE_TOKEN_COLOR = "rgb(244, 114, 182)";

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
  const [agentStageTrans, setAgentStageTrans] =
    useState<StratAgentTokenTransition | null>(null);
  /** Left column: stage fields vs token placement controls. */
  const [editorTab, setEditorTab] = useState<"stage" | "tokens">("stage");
  /** Valorant API ability names/descriptions keyed by agent slug. */
  const [valorantAbilityUi, setValorantAbilityUi] = useState<
    Record<string, ValorantAbilityUiMeta[]>
  >({});
  /** Coach: scales agent + ability pins on the map (persisted locally). */
  const [mapPinScale, setMapPinScale] = useState(1);
  const [valorantUiError, setValorantUiError] = useState<string | null>(null);

  const didMountRef = useRef(false);
  /** Remember vision-cone handle distance along the look ray (display space) after drag. */
  const lastVisionConeHandleAlongRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setPlacementMode(null);
    setSelectedId(null);
  }, [activeStageIndex]);

  const { vb, vbWidth, mapOverlays } = useMemo(() => {
    const d = stratMapDisplayData(gameMap, side);
    return { vb: d.vb, vbWidth: d.vb.width, mapOverlays: d.overlays };
  }, [gameMap, side]);

  const mapDoorOverlays = useMemo(
    () =>
      mapOverlays.filter(
        (sh) =>
          sh.kind === "toggle_door" || sh.kind === "breakable_doorway",
      ),
    [mapOverlays],
  );

  const visionLosBase = useMemo(
    () =>
      buildVisionLosContext(
        gameMap,
        side,
        stages[activeStageIndex]?.doorOpenByOverlayId,
      ),
    [gameMap, side, stages, activeStageIndex],
  );

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
          themeColor: a.theme_color ?? null,
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
          themeColor: string | null;
          portraitUrl: string | null;
          allowedAbilitySlots: StratPlacedAbility["slot"][];
        } => x != null,
      );
  }, [compSlugs, agentsCatalog]);

  useEffect(() => {
    setMapPinScale(readCoachMapPinScale());
  }, []);

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

  const visionLosContextMerged = useMemo(() => {
    if (!visionLosBase) return null;
    return appendPlacedAbilitiesVisionBlockers(visionLosBase, {
      placedAbilities: activeStage?.abilities ?? [],
      stageAgents: activeStage?.agents ?? [],
      agentsCatalog,
      vb,
      side,
      vbWidth,
      mapPinScale,
    });
  }, [
    visionLosBase,
    activeStage?.abilities,
    activeStage?.agents,
    agentsCatalog,
    vb,
    side,
    vbWidth,
    mapPinScale,
  ]);
  const visionLosContextByExcludeId = useMemo(() => {
    const m = new Map<string, VisionLosContext>();
    if (!visionLosBase) return m;
    const placed = activeStage?.abilities ?? [];
    for (const ab of placed) {
      m.set(
        ab.id,
        appendPlacedAbilitiesVisionBlockers(visionLosBase, {
          placedAbilities: placed,
          stageAgents: activeStage?.agents ?? [],
          agentsCatalog,
          vb,
          side,
          vbWidth,
          mapPinScale,
          excludePlacedAbilityId: ab.id,
        }),
      );
    }
    return m;
  }, [
    visionLosBase,
    activeStage?.abilities,
    activeStage?.agents,
    agentsCatalog,
    vb,
    side,
    vbWidth,
    mapPinScale,
  ]);

  const beginAgentVisionConeInteraction = useCallback(
    (
      e: React.PointerEvent,
      agent: StratPlacedAgent,
      width: NonNullable<StratPlacedAgent["visionConeWidth"]>,
    ) => {
      e.stopPropagation();
      if (placementMode) return;
      setSelectedId(agent.id);
      focusMapSvg();
      const svg = svgRef.current;
      if (!svg) return;
      const raw = svgPointerToLogical(svg, e.clientX, e.clientY);
      const qDisp = clampPointToViewBox(vb, raw);
      const pinS = clampCoachMapPinScale(mapPinScale);
      const ray = stratAgentVisionConeRayInDisplay({
        vb,
        side,
        vbWidth,
        pinS,
        agent,
        width,
        visionLosContext: visionLosContextMerged,
      });
      const { sNear, sFar } = stratAgentVisionConeHandleAlongBounds({
        vb,
        pos: ray.pos,
        dir: ray.dir,
        lenRay: ray.lenRay,
        vbWidth,
        pinS,
      });
      const s =
        (qDisp.x - ray.pos.x) * ray.dir.x +
        (qDisp.y - ray.pos.y) * ray.dir.y;
      const handleAlongDist = Math.min(sFar, Math.max(sNear, s));
      setDrag({
        kind: "agentVisionConeRotate",
        agentId: agent.id,
        pointerId: e.pointerId,
        handleAlongDist,
      });
    },
    [
      placementMode,
      focusMapSvg,
      svgPointerToLogical,
      vb,
      side,
      vbWidth,
      mapPinScale,
      visionLosContextMerged,
    ],
  );

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

  useLayoutEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      prevIndexRef.current = activeStageIndex;
      return;
    }
    const prev = prevIndexRef.current;
    prevIndexRef.current = activeStageIndex;
    if (prev === activeStageIndex) return;
    const leaving = stages[prev];
    if (!leaving || leaving.transition === "none") {
      setAgentStageTrans(null);
      return;
    }
    setAgentStageTrans({
      fromStage: stages[prev],
      kind: leaving.transition,
      ms: leaving.transitionMs,
    });
    const tid = window.setTimeout(
      () => setAgentStageTrans(null),
      leaving.transitionMs + 80,
    );
    return () => window.clearTimeout(tid);
  }, [activeStageIndex, stages]);

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
        activeStage.abilities.filter(
          (a) => a.id !== id && a.attachedToAgentId !== id,
        ),
      );
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    activeStage,
    activeStageIndex,
    setAgents,
    setAbilities,
  ]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg || !activeStage) return;
      const raw = svgPointerToLogical(svg, e.clientX, e.clientY);
      const p =
        drag.kind === "abilityRotate" ||
        drag.kind === "agentVisionConeRotate"
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
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((ab) =>
            ab.attachedToAgentId === drag.id
              ? { ...ab, x: p.x, y: p.y }
              : ab,
          ),
        );
      } else if (drag.kind === "ability") {
        const cur = activeStage.abilities.find((x) => x.id === drag.id);
        if (cur?.attachedToAgentId) return;
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
        );
      } else if (drag.kind === "abilityOrigin") {
        const cur = activeStage.abilities.find((x) => x.id === drag.id);
        if (cur?.attachedToAgentId) return;
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
      } else if (drag.kind === "agentVisionConeRotate") {
        const qDisp = clampPointToViewBox(vb, raw);
        const pinS = clampCoachMapPinScale(mapPinScale);
        const a = activeStage.agents.find((x) => x.id === drag.agentId);
        if (!a?.visionConeWidth) return;
        const rotationDeg =
          (Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI;
        const aNext = { ...a, visionConeRotationDeg: rotationDeg };
        const ray = stratAgentVisionConeRayInDisplay({
          vb,
          side,
          vbWidth,
          pinS,
          agent: aNext,
          width: a.visionConeWidth,
          visionLosContext: visionLosContextMerged,
        });
        const { sNear, sFar } = stratAgentVisionConeHandleAlongBounds({
          vb,
          pos: ray.pos,
          dir: ray.dir,
          lenRay: ray.lenRay,
          vbWidth,
          pinS,
        });
        const s =
          (qDisp.x - ray.pos.x) * ray.dir.x +
          (qDisp.y - ray.pos.y) * ray.dir.y;
        const handleAlongDist = Math.min(sFar, Math.max(sNear, s));
        setAgents(
          activeStageIndex,
          activeStage.agents.map((ag) =>
            ag.id === drag.agentId ? aNext : ag,
          ),
        );
        setDrag({
          kind: "agentVisionConeRotate",
          agentId: drag.agentId,
          pointerId: drag.pointerId,
          handleAlongDist,
        });
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      if (drag.kind === "agentVisionConeRotate") {
        lastVisionConeHandleAlongRef.current[drag.agentId] =
          drag.handleAlongDist;
      }
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
    visionLosContextMerged,
    vbWidth,
    mapPinScale,
  ]);

  function onMapBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (!placementMode || !svgRef.current || !activeStage) return;
    const raw = svgPointerToLogical(svgRef.current, e.clientX, e.clientY);
    const pDisplay = clampPointToViewBox(vb, raw);
    const p = stratStagePinToStoredAttack(vb, side, pDisplay);
    if (placementMode.kind === "agent") {
      if (
        activeStage.agents.some((x) => x.agentSlug === placementMode.slug)
      ) {
        setPlacementMode(null);
        return;
      }
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
    const attach = bp != null && effectiveStratAttachToAgent(bp);

    if (attach) {
      const ag = resolveStratAttachAgent(
        activeStage,
        placementMode.slug,
        selectedId,
      );
      if (!ag) {
        setPlacementMode(null);
        return;
      }
      if (placeMode === "origin_direction") {
        const rotationDeg =
          (Math.atan2(p.y - ag.y, p.x - ag.x) * 180) / Math.PI;
        const next: StratPlacedAbility = {
          id: newItemId(),
          agentSlug: placementMode.slug,
          slot: placementMode.slot,
          x: ag.x,
          y: ag.y,
          rotationDeg,
          attachedToAgentId: ag.id,
        };
        setAbilities(activeStageIndex, [...activeStage.abilities, next]);
      } else {
        const next: StratPlacedAbility = {
          id: newItemId(),
          agentSlug: placementMode.slug,
          slot: placementMode.slot,
          x: ag.x,
          y: ag.y,
          attachedToAgentId: ag.id,
        };
        setAbilities(activeStageIndex, [...activeStage.abilities, next]);
      }
      setPlacementMode(null);
      setAbilityDirPreview(null);
      setSelectedId(null);
      return;
    }

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

  const pinS = clampCoachMapPinScale(mapPinScale);
  const { abilityR, fontAbility } = stratAbilityPinDimensions(
    vbWidth,
    mapPinScale,
  );
  const placementPreviewColor =
    placementMode?.kind === "ability"
      ? (agentBlueprintForSlot(
          agentsCatalog,
          placementMode.slug,
          placementMode.slot,
        )?.color ??
        (agentsCatalog.find((a) => a.slug === placementMode.slug)?.theme_color ??
          "rgb(34,211,238)"))
      : "rgb(34,211,238)";

  const abilityPlacementAimPreview = useMemo(() => {
    if (!activeStage || placementMode?.kind !== "ability") return false;
    const b = agentBlueprintForSlot(
      agentsCatalog,
      placementMode.slug,
      placementMode.slot,
    );
    if (!b) return false;
    if (placementMode.pendingOriginAttack) return true;
    if (
      effectiveStratAttachToAgent(b) &&
      effectiveStratPlacementMode(b) === "origin_direction"
    ) {
      return (
        resolveStratAttachAgent(
          activeStage,
          placementMode.slug,
          selectedId,
        ) != null
      );
    }
    return false;
  }, [activeStage, placementMode, agentsCatalog, selectedId]);

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
            !placementMode ||
            placementMode.kind !== "ability" ||
            !abilityPlacementAimPreview ||
            !svgRef.current
          ) {
            setAbilityDirPreview(null);
            return;
          }
          if (!placementMode.pendingOriginAttack) {
            const ag = resolveStratAttachAgent(
              activeStage,
              placementMode.slug,
              selectedId,
            );
            if (!ag) {
              setAbilityDirPreview(null);
              return;
            }
          }
          const r = svgPointerToLogical(svgRef.current, e.clientX, e.clientY);
          setAbilityDirPreview(clampPointToViewBox(vb, r));
        }}
        onPointerLeave={() => setAbilityDirPreview(null)}
        style={{
          cursor:
            placementMode?.kind === "ability" && abilityPlacementAimPreview
              ? "crosshair"
              : placementMode
                ? "crosshair"
                : "default",
        }}
      />
      {placementMode?.kind === "ability" &&
      abilityDirPreview &&
      abilityPlacementAimPreview ? (
        <line
          x1={
            placementMode.pendingOriginAttack
              ? stratStagePinForDisplay(
                  vb,
                  side,
                  placementMode.pendingOriginAttack,
                ).x
              : (() => {
                  const ag = resolveStratAttachAgent(
                    activeStage,
                    placementMode.slug,
                    selectedId,
                  );
                  return ag
                    ? stratStagePinForDisplay(vb, side, {
                        x: ag.x,
                        y: ag.y,
                      }).x
                    : 0;
                })()
          }
          y1={
            placementMode.pendingOriginAttack
              ? stratStagePinForDisplay(
                  vb,
                  side,
                  placementMode.pendingOriginAttack,
                ).y
              : (() => {
                  const ag = resolveStratAttachAgent(
                    activeStage,
                    placementMode.slug,
                    selectedId,
                  );
                  return ag
                    ? stratStagePinForDisplay(vb, side, {
                        x: ag.x,
                        y: ag.y,
                      }).y
                    : 0;
                })()
          }
          x2={abilityDirPreview.x}
          y2={abilityDirPreview.y}
          stroke={placementPreviewColor}
          opacity={0.9}
          strokeWidth={Math.max(vbWidth * 0.0035, 1.5) * pinS}
          strokeDasharray="12 10"
          pointerEvents="none"
        />
      ) : null}
      {activeStage.agents
        .filter((a) => a.visionConeWidth)
        .map((agent) => {
          const w = agent.visionConeWidth!;
          const rot = agent.visionConeRotationDeg ?? 0;
          const sel = selectedId === agent.id;
          const pos = stratStagePinForDisplay(vb, side, {
            x: agent.x,
            y: agent.y,
          });
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
          const ray = stratAgentVisionConeRayInDisplay({
            vb,
            side,
            vbWidth,
            pinS,
            agent,
            width: w,
            visionLosContext: visionLosContextMerged,
          });
          const { sNear, sFar } = stratAgentVisionConeHandleAlongBounds({
            vb,
            pos: ray.pos,
            dir: ray.dir,
            lenRay: ray.lenRay,
            vbWidth,
            pinS,
          });
          const isRotDrag =
            drag?.kind === "agentVisionConeRotate" &&
            drag.agentId === agent.id;
          const remembered = lastVisionConeHandleAlongRef.current[agent.id];
          const sDefault = Math.min(
            sFar,
            Math.max(sNear, Math.min(ray.lenRay * 0.065, sFar * 0.22)),
          );
          const sIdle =
            remembered != null
              ? Math.min(sFar, Math.max(sNear, remembered))
              : sDefault;
          const sAlong = isRotDrag ? drag.handleAlongDist : sIdle;
          const hx = ray.pos.x + ray.dir.x * sAlong;
          const hy = ray.pos.y + ray.dir.y * sAlong;
          const lineStart = {
            x: ray.pos.x + ray.dir.x * sNear,
            y: ray.pos.y + ray.dir.y * sNear,
          };
          const lineEnd = {
            x: ray.pos.x + ray.dir.x * sFar,
            y: ray.pos.y + ray.dir.y * sFar,
          };
          return (
            <g key={`vc-${agent.id}`}>
              <polygon
                points={losPoly.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(244,114,182,0.2)"
                stroke="none"
                style={{ cursor: placementMode ? "default" : "grab" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (placementMode) return;
                  setSelectedId(agent.id);
                  focusMapSvg();
                  const svg = svgRef.current;
                  if (!svg) return;
                  const o = svgPointerToLogical(svg, e.clientX, e.clientY);
                  setDrag({
                    kind: "agent",
                    id: agent.id,
                    grabDx: o.x - pos.x,
                    grabDy: o.y - pos.y,
                    pointerId: e.pointerId,
                  });
                }}
              />
              {sel ? (
                <>
                  <line
                    x1={ray.pos.x}
                    y1={ray.pos.y}
                    x2={ray.rayEnd.x}
                    y2={ray.rayEnd.y}
                    stroke={VISION_CONE_TOKEN_COLOR}
                    opacity={0.82}
                    strokeWidth={Math.max(vbWidth * 0.0018, 0.85) * pinS}
                    strokeDasharray="6 5"
                    pointerEvents="none"
                  />
                  <line
                    x1={lineStart.x}
                    y1={lineStart.y}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke="transparent"
                    strokeWidth={Math.max(vbWidth * 0.028, 14) * pinS}
                    strokeLinecap="round"
                    style={{
                      cursor: placementMode ? "default" : "grab",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) =>
                      beginAgentVisionConeInteraction(e, agent, w)
                    }
                  />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={Math.max(vbWidth * 0.0072, 3.6) * pinS}
                    fill={VISION_CONE_TOKEN_COLOR}
                    stroke="#faf5ff"
                    strokeWidth={Math.max(vbWidth * 0.0019, 1) * pinS}
                    style={{
                      cursor: placementMode ? "default" : "grab",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) =>
                      beginAgentVisionConeInteraction(e, agent, w)
                    }
                  />
                </>
              ) : null}
            </g>
          );
        })}
      {activeStage.abilities.map((ab) => {
        const agentTheme =
          agentsCatalog.find((a) => a.slug === ab.agentSlug)?.theme_color ??
          "rgb(34,211,238)";
        const sel = selectedId === ab.id;
        const stPos = resolvedPlacedAbilityStoredPosition(
          ab,
          activeStage.agents,
        );
        const pos = stratStagePinForDisplay(vb, side, stPos);
        const isAttached = Boolean(ab.attachedToAgentId);
        const bp = agentBlueprintForSlot(agentsCatalog, ab.agentSlug, ab.slot);
        const useTwoHandles =
          bp != null && effectiveStratPlacementMode(bp) === "origin_direction";
        const stratOv = bp ? stratAnchorOverrideForBlueprint(bp) : undefined;
        const isRectOD =
          useTwoHandles &&
          bp != null &&
          bp.shapeKind === "rectangle" &&
          bp.geometry.kind === "rectangle";
        const rotDist = stratAbilityRotationHandleDistance(vbWidth) * pinS;
        const rotStored = stratAbilityRotationHandleStored(
          stPos,
          ab.rotationDeg ?? 0,
          rotDist,
        );
        const rotPos = stratStagePinForDisplay(vb, side, rotStored);
        const accentColor = bp?.color ?? "rgb(34, 211, 238)";
        /** Rectangle: cyan handle at geometric center; map pin (pos) is yellow edge. */
        const rectCenterPos =
          isRectOD && bp && bp.geometry.kind === "rectangle"
            ? blueprintPointToStratMapDisplay(
                rectangleStratPivotBlueprint(bp.geometry),
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
            mapPinScale={mapPinScale}
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
            pointerEvents="auto"
          />
        ) : (
          <g transform={`translate(${pos.x},${pos.y})`}>
            <circle
              r={abilityR}
              fill={agentTheme}
              stroke={sel ? "#fae8ff" : agentTheme}
              strokeWidth={
                vbWidth * 0.0024 * (sel ? 2.2 : 1) * pinS
              }
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
              {sel ? (
                <>
                  <line
                    x1={pos.x}
                    y1={pos.y}
                    x2={isRectOD && rectCenterPos ? rectCenterPos.x : rotPos.x}
                    y2={isRectOD && rectCenterPos ? rectCenterPos.y : rotPos.y}
                    stroke={accentColor}
                    opacity={0.75}
                    strokeWidth={Math.max(vbWidth * 0.0018, 0.85) * pinS}
                    strokeDasharray="6 5"
                    pointerEvents="none"
                  />
                  {!isAttached ? (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={Math.max(vbWidth * 0.01, 5) * pinS}
                      fill={accentColor}
                      stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                      strokeWidth={
                        Math.max(vbWidth * 0.0024, 1) * (sel ? 2.2 : 1) * pinS
                      }
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
                        setDrag({
                          kind: "abilityOrigin",
                          id: ab.id,
                          grabDx: o.x - pos.x,
                          grabDy: o.y - pos.y,
                          pointerId: e.pointerId,
                        });
                      }}
                    />
                  ) : null}
                  <circle
                    cx={isRectOD && rectCenterPos ? rectCenterPos.x : rotPos.x}
                    cy={isRectOD && rectCenterPos ? rectCenterPos.y : rotPos.y}
                    r={Math.max(vbWidth * 0.009, 4.5) * pinS}
                    fill={accentColor}
                    stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                    strokeWidth={
                      Math.max(vbWidth * 0.002, 1) * (sel ? 2 : 1) * pinS
                    }
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
                </>
              ) : null}
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
              if (isAttached) return;
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
            style={{
              cursor:
                placementMode || isAttached ? "default" : "grab",
            }}
          >
            {abilitySvg}
          </g>
        );
      })}
      <StratStageAgentTokens
        vb={vb}
        vbWidth={vbWidth}
        side={side}
        agents={activeStage.agents}
        roster={roster}
        transition={agentStageTrans}
        pinScale={mapPinScale}
        interactive={{
          placementModeBlocks: placementMode != null,
          selectedId,
          onPointerDown: (a, pos, e) => {
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
          },
        }}
      />
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

        <div className="mt-3 rounded-lg border border-violet-800/40 bg-slate-950/50 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <label
              className="text-xs font-medium text-violet-200/90"
              htmlFor="coach-map-pin-scale"
            >
              Map pin size
            </label>
            <span className="tabular-nums text-xs text-violet-400/90">
              {Math.round(mapPinScale * 100)}%
            </span>
          </div>
          <input
            id="coach-map-pin-scale"
            type="range"
            min={Math.round(COACH_MAP_PIN_SCALE_MIN * 100)}
            max={Math.round(COACH_MAP_PIN_SCALE_MAX * 100)}
            step={1}
            value={Math.round(mapPinScale * 100)}
            onChange={(e) => {
              const v = clampCoachMapPinScale(Number(e.target.value) / 100);
              setMapPinScale(v);
              writeCoachMapPinScale(v);
            }}
            className="mt-2 h-2 w-full cursor-pointer accent-violet-500"
          />
          <p className="mt-1.5 text-[10px] leading-snug text-violet-500/70">
            Live on the map. Saved in this browser; public view uses the same
            setting.
          </p>
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

              {mapDoorOverlays.length > 0 ? (
                <div className="rounded-md border border-emerald-900/35 bg-slate-950/45 p-3">
                  <h4 className="text-xs font-semibold text-emerald-100/90">
                    Doors (this stage)
                  </h4>
                  <p className="mt-1 text-[10px] leading-snug text-violet-400/75">
                    Closed doors block vision cones. Open lets LOS pass through the
                    doorway line. Values are saved on this stage only; matching the map
                    default clears your override for that door.
                  </p>
                  <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-0.5 [scrollbar-gutter:stable]">
                    {mapDoorOverlays.map((sh) => {
                      const open = effectiveDoorIsOpen(
                        sh,
                        activeStage.doorOpenByOverlayId,
                      );
                      const mapDefault = catalogDefaultDoorOpen(sh);
                      const label =
                        sh.kind === "toggle_door"
                          ? "Toggle door"
                          : "Breakable doorway";
                      const shortId =
                        sh.id.length > 10
                          ? `${sh.id.slice(0, 6)}…${sh.id.slice(-4)}`
                          : sh.id;
                      return (
                        <li
                          key={sh.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-900/25 bg-slate-950/60 px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-violet-100/90">
                              {label}
                            </div>
                            <div className="truncate font-mono text-[9px] text-violet-500/70">
                              {shortId}
                            </div>
                          </div>
                          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11px] text-violet-200/90">
                            <input
                              type="checkbox"
                              checked={open}
                              onChange={(e) => {
                                const want = e.target.checked;
                                const cur = {
                                  ...(activeStage.doorOpenByOverlayId ?? {}),
                                };
                                if (want === mapDefault) {
                                  delete cur[sh.id];
                                } else {
                                  cur[sh.id] = want;
                                }
                                patchStage(activeStageIndex, {
                                  doorOpenByOverlayId:
                                    Object.keys(cur).length > 0 ? cur : {},
                                });
                              }}
                              className="rounded border-violet-600/60"
                            />
                            Open
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-violet-800/35 bg-slate-950/40 p-3">
              <p className="text-xs text-violet-300/70">
                {placementMode ? (
                  <>
                    <span className="text-violet-200">Placement mode:</span>{" "}
                    {placementMode.kind === "agent" ? (
                      <>click the map to drop an agent token ({placementMode.slug}).</>
                    ) : placementMode.kind === "ability" ? (
                      (() => {
                        const b = agentBlueprintForSlot(
                          agentsCatalog,
                          placementMode.slug,
                          placementMode.slot,
                        );
                        if (b && effectiveStratAttachToAgent(b)) {
                          const m = effectiveStratPlacementMode(b);
                          return m === "origin_direction" ? (
                            <>
                              One click:{" "}
                              <strong className="text-cyan-200">aim</strong> from the
                              agent token (preview line from the pin).
                            </>
                          ) : (
                            <>
                              One click on the map drops{" "}
                              {placementMode.slot.toUpperCase()} on the agent token.
                            </>
                          );
                        }
                        if (placementMode.pendingOriginAttack) {
                          return (
                            <>
                              Second click:{" "}
                              <strong className="text-violet-200">face</strong>{" "}
                              {placementMode.slot.toUpperCase()} for{" "}
                              {placementMode.slug} (color-matched preview line).
                            </>
                          );
                        }
                        const m = b
                          ? effectiveStratPlacementMode(b)
                          : "center";
                        return m === "origin_direction" ? (
                          <>
                            Click the map for{" "}
                            <strong className="text-cyan-200">origin</strong>, then
                            again for direction.
                          </>
                        ) : (
                          <>
                            Click the map for{" "}
                            {placementMode.slot.toUpperCase()} ({placementMode.slug}).
                          </>
                        );
                      })()
                    ) : null}{" "}
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
                    then click the map. Select an agent to attach a{" "}
                    <strong className="text-slate-200">vision cone</strong> (wide or
                    thin). Drag pins to adjust; select a pin — the map grabs focus —
                    then Delete or Backspace removes it (Escape clears selection).{" "}
                    {
                      "Ability chips follow each agent's coach blueprint. Use \"Attach to agent token\" in coach for shapes like Paranoia that pivot on the agent."
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
              <div className="mt-3 rounded-md border border-violet-800/30 bg-slate-950/35 p-2">
                <p className="text-[11px] font-medium text-violet-300/80">
                  Agent vision cone
                </p>
                {activeStage.agents.some((a) => a.id === selectedId) ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(
                      [
                        { key: "off" as const, label: "Off" },
                        { key: "wide" as const, label: "Wide" },
                        { key: "thin" as const, label: "Thin" },
                      ] as const
                    ).map(({ key, label }) => {
                      const ag = activeStage.agents.find(
                        (x) => x.id === selectedId,
                      )!;
                      const cur =
                        ag.visionConeWidth === "wide" ||
                        ag.visionConeWidth === "thin"
                          ? ag.visionConeWidth
                          : ("off" as const);
                      const active = cur === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (key === "off") {
                              setAgents(
                                activeStageIndex,
                                activeStage.agents.map((a) => {
                                  if (a.id !== selectedId) return a;
                                  const {
                                    visionConeWidth: _vw,
                                    visionConeRotationDeg: _vr,
                                    ...rest
                                  } = a;
                                  return rest;
                                }),
                              );
                              return;
                            }
                            setAgents(
                              activeStageIndex,
                              activeStage.agents.map((a) =>
                                a.id === selectedId
                                  ? {
                                      ...a,
                                      visionConeWidth: key,
                                      visionConeRotationDeg:
                                        a.visionConeRotationDeg ?? 0,
                                    }
                                  : a,
                              ),
                            );
                          }}
                          className={`rounded-md border px-2 py-1 text-xs font-medium ${
                            active
                              ? "border-fuchsia-400 bg-fuchsia-950/60 text-white"
                              : "border-violet-800/45 bg-slate-950/60 text-violet-200"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[10px] leading-snug text-violet-500/75">
                    Select an agent token on the map, then choose wide or thin. Drag
                    along the dashed look line or the pink handle to aim (handle slides
                    on the line, clamped to the map); the cone moves with the agent.
                  </p>
                )}
              </div>
              {roster.length === 0 ? (
                <p className="mt-2 text-xs text-amber-200/80">
                  Fill the five agents in the comp (Details tab) to enable agent
                  tokens and ability chips.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {roster.map((r) => {
                    const agentPlacedOnStage =
                      activeStage?.agents.some((x) => x.agentSlug === r.slug) ??
                      false;
                    return (
                    <div
                      key={r.slug}
                      className="flex max-w-full flex-col gap-1 rounded-lg border border-violet-800/30 bg-slate-950/30 px-2 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          disabled={agentPlacedOnStage}
                          title={
                            agentPlacedOnStage
                              ? "This agent is already on this stage"
                              : undefined
                          }
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
                          } disabled:cursor-not-allowed disabled:opacity-45`}
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
                          const bpChip = agentBlueprintForSlot(
                            agentsCatalog,
                            r.slug,
                            slot,
                          );
                          const attachNeedsToken =
                            bpChip != null &&
                            effectiveStratAttachToAgent(bpChip) &&
                            !agentPlacedOnStage;
                          const title = attachNeedsToken
                            ? `Place ${r.name} on the map first — this ability attaches to the agent token.`
                            : vm
                              ? `${vm.displayName}\n\n${vm.description}`
                              : `Place ${slot.toUpperCase()} for ${r.name}`;
                          return (
                            <button
                              key={slot}
                              type="button"
                              disabled={attachNeedsToken}
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
                              className={`flex min-h-9 min-w-13 max-w-28 flex-col items-center justify-center rounded border px-1 py-0.5 text-left leading-tight transition ${
                                placementMode?.kind === "ability" &&
                                placementMode.slug === r.slug &&
                                placementMode.slot === slot
                                  ? "border-cyan-400 bg-cyan-950/50 text-white"
                                  : "border-violet-800/50 bg-slate-950/70 text-violet-200"
                              } disabled:cursor-not-allowed disabled:opacity-45`}
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
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );

  const mapPanel =
    activeStage ? (
      <div className="flex min-h-[min(56dvh,720px)] w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-1">
        <StratMapViewer
          ref={svgRef}
          gameMap={gameMap}
          side={side}
          showLayerToggles
          showFooter={false}
          embed
          initialVisibility={activeStage.mapLayerVisibility}
          visibilityScopeKey={activeStage.id}
          doorOpenByOverlayId={activeStage.doorOpenByOverlayId}
          onVisibilityChange={(next) =>
            patchStage(activeStageIndex, { mapLayerVisibility: next })
          }
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
