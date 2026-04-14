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
import {
  ChevronLeft,
  ChevronRight,
  MousePointerClick,
  Move,
  Plus,
  ScanEye,
  Trash2,
} from "lucide-react";
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
import {
  abilityPlacementOptionsFromBlueprint,
  type AbilityPlacementOption,
} from "@/lib/agent-blueprint-ability-slots";
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
import { placedAbilityPinLabel } from "@/lib/strat-stage-pin-styles";
import { agentBlueprintForSlot } from "@/lib/strat-ability-blueprint-lookup";
import { StratAbilityBlueprintSvg } from "@/components/StratAbilityBlueprintSvg";
import {
  clampPointToViewBox,
  flipPointsThroughViewBoxCenter,
  type MapPoint,
  type ViewBoxRect,
} from "@/lib/map-path";
import {
  stratStagePinForDisplay,
  stratStagePinToStoredAttack,
} from "@/lib/strat-stage-coords";
import { stratUsesAttackEditorFrame } from "@/lib/map-strat-side";
import {
  effectiveStratAttachToAgent,
  effectiveStratPlacementMode,
} from "@/lib/strat-blueprint-anchor";
import {
  stratAbilityRotationHandleDistance,
  stratAbilityRotationHandleStored,
  stratRicochetRotationHandleDisplay,
  stratToggleableRayToggleOffsetFromLine,
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
      /** Set when `slot === "custom"` (matches `AgentAbilityBlueprint.id`). */
      abilityBlueprintId?: string;
      /** First click stored (attack coords) when using origin + direction placement. */
      pendingOriginAttack?: { x: number; y: number };
    };

function abilityFieldsFromPlacementMode(
  m: Extract<PlacementMode, { kind: "ability" }>,
): Pick<StratPlacedAbility, "slot" | "abilityBlueprintId"> {
  if (m.slot === "custom" && m.abilityBlueprintId) {
    return { slot: "custom", abilityBlueprintId: m.abilityBlueprintId };
  }
  return { slot: m.slot };
}

function isActiveAbilityPlacementOption(
  m: PlacementMode,
  slug: string,
  opt: AbilityPlacementOption,
): boolean {
  if (!m || m.kind !== "ability" || m.slug !== slug) return false;
  if (opt.kind === "key") return m.slot === opt.slot;
  return m.slot === "custom" && m.abilityBlueprintId === opt.blueprintId;
}

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
      /** `unwrap(pointer) + rotationGrabDeg` so handles need not sit on the heading ray. */
      rotationGrabDeg: number;
    }
  | {
      kind: "agentVisionConeRotate";
      agentId: string;
      pointerId: number;
      /** Distance along look ray in display space; clamped to [sNear, sFar]. */
      handleAlongDist: number;
    }
  | null;

/** Keep pointer angle continuous across atan2's ±π branch while dragging. */
function unwrapPointerDegAlong(rawDeg: number, prevUnwrapped: number): number {
  let x = rawDeg;
  while (x < prevUnwrapped - 180) x += 360;
  while (x > prevUnwrapped + 180) x -= 360;
  return x;
}

function wrapDeg180(deg: number): number {
  let x = ((deg % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return x;
}

function clampFixedMenuPosition(
  clientX: number,
  clientY: number,
  menuW: number,
  menuH: number,
): { left: number; top: number } {
  if (typeof window === "undefined") {
    return { left: clientX, top: clientY };
  }
  return {
    left: Math.max(8, Math.min(clientX, window.innerWidth - menuW)),
    top: Math.max(8, Math.min(clientY, window.innerHeight - menuH)),
  };
}

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
  /** Portal target for Stage UI (e.g. coach left column). */
  controlsMountEl: HTMLElement | null;
  /** Portal target for the map viewer only (e.g. coach right column). */
  mapMountEl: HTMLElement | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSvgRef = useRef<SVGSVGElement | null>(null);
  const abilityRotatePointerUnwrappedRef = useRef(0);
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
  const [mapLayersModalOpen, setMapLayersModalOpen] = useState(false);
  const [mapControlsModalOpen, setMapControlsModalOpen] = useState(false);
  const [mapResetZoomSignal, setMapResetZoomSignal] = useState(0);
  /** Left column: stage fields vs token placement controls. */
  const [tokenTrayOpenSlug, setTokenTrayOpenSlug] = useState<string | null>(
    null,
  );
  const [agentVisionContextMenu, setAgentVisionContextMenu] = useState<{
    clientX: number;
    clientY: number;
    agentId: string;
  } | null>(null);
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
  /**
   * Keep map orientation stable in strat editor while side selector changes metadata.
   */
  const editorFrameSide: StratSide = useMemo(
    () => (stratUsesAttackEditorFrame(gameMap, "atk") ? "atk" : "def"),
    [gameMap, side],
  );
  const rotateView180 = side !== editorFrameSide;

  useEffect(() => {
    setPlacementMode(null);
    setSelectedId(null);
  }, [activeStageIndex]);

  const { vb, vbWidth, mapOverlays } = useMemo(() => {
    const d = stratMapDisplayData(gameMap, editorFrameSide);
    return { vb: d.vb, vbWidth: d.vb.width, mapOverlays: d.overlays };
  }, [gameMap, editorFrameSide]);

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
        editorFrameSide,
        stages[activeStageIndex]?.doorOpenByOverlayId,
      ),
    [gameMap, editorFrameSide, stages, activeStageIndex],
  );

  const mapGeoScale = useMemo(
    () =>
      mapGeometryScaleFromEditorMeta(
        normalizeEditorMeta(gameMap.editor_meta),
      ),
    [gameMap.editor_meta],
  );

  const svgPointerToLogical = useCallback(
    (svg: SVGSVGElement, clientX: number, clientY: number) => {
      const raw = clientToSvgPoint(svg, clientX, clientY);
      /**
       * StratMapViewer nests transforms: uniform scale about center, then 180° about center.
       * Forward: root = R(S(logical)). Invert: logical = S⁻¹(R(root)) — flip raw first, then
       * undo scale (not scale then flip).
       */
      const preScale = rotateView180
        ? (flipPointsThroughViewBoxCenter(vb, [raw])[0] ?? raw)
        : raw;
      return rootPointToLogicalGeometry(preScale, vb, mapGeoScale);
    },
    [vb, mapGeoScale, rotateView180],
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
          abilityPlacementOptions: abilityPlacementOptionsFromBlueprint(
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
          abilityPlacementOptions: AbilityPlacementOption[];
        } => x != null,
      );
  }, [compSlugs, agentsCatalog]);

  useEffect(() => {
    setMapPinScale(readCoachMapPinScale());
  }, []);

  useEffect(() => {
    if (!mapControlsModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapControlsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapControlsModalOpen]);

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
      gameMap,
      vb,
      side: editorFrameSide,
      vbWidth,
      mapPinScale,
    });
  }, [
    visionLosBase,
    activeStage?.abilities,
    activeStage?.agents,
    agentsCatalog,
    gameMap,
    vb,
    editorFrameSide,
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
          gameMap,
          vb,
          side: editorFrameSide,
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
    gameMap,
    vb,
    editorFrameSide,
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
        side: editorFrameSide,
        gameMap,
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
      editorFrameSide,
      gameMap,
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

  const beginAbilityRotateDrag = useCallback(
    (e: React.PointerEvent, ab: StratPlacedAbility) => {
      const svg = svgRef.current;
      if (!svg || !activeStage) return;
      const raw = svgPointerToLogical(svg, e.clientX, e.clientY);
      const p = stratStagePinToStoredAttack(
        vb,
        editorFrameSide,
        gameMap,
        clampPointToViewBox(vb, raw),
      );
      const stPos = resolvedPlacedAbilityStoredPosition(ab, activeStage.agents);
      const initialPointerDeg =
        (Math.atan2(p.y - stPos.y, p.x - stPos.x) * 180) / Math.PI;
      abilityRotatePointerUnwrappedRef.current = initialPointerDeg;
      setDrag({
        kind: "abilityRotate",
        id: ab.id,
        pointerId: e.pointerId,
        rotationGrabDeg: (ab.rotationDeg ?? 0) - initialPointerDeg,
      });
    },
    [
      activeStage,
      editorFrameSide,
      gameMap,
      svgPointerToLogical,
      vb,
    ],
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
        setTokenTrayOpenSlug(null);
        setAgentVisionContextMenu(null);
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
      patchStage(activeStageIndex, {
        agents: activeStage.agents.filter((a) => a.id !== id),
        abilities: activeStage.abilities.filter(
          (a) => a.id !== id && a.attachedToAgentId !== id,
        ),
      });
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedId,
    activeStage,
    activeStageIndex,
    patchStage,
    setAgents,
    setAbilities,
  ]);

  useEffect(() => {
    setTokenTrayOpenSlug(null);
    setAgentVisionContextMenu(null);
    setMapLayersModalOpen(false);
  }, [activeStageIndex]);

  useEffect(() => {
    if (!drag) {
      dragSvgRef.current = null;
    }
  }, [drag]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const svg = dragSvgRef.current ?? svgRef.current;
      if (!svg || !activeStage) return;
      const raw = svgPointerToLogical(svg, e.clientX, e.clientY);
      const p =
        drag.kind === "abilityRotate" ||
        drag.kind === "agentVisionConeRotate"
          ? stratStagePinToStoredAttack(
              vb,
              editorFrameSide,
              gameMap,
              clampPointToViewBox(vb, raw),
            )
          : stratStagePinToStoredAttack(
              vb,
              editorFrameSide,
              gameMap,
              clampPointToViewBox(vb, {
                x: raw.x - drag.grabDx,
                y: raw.y - drag.grabDy,
              }),
            );
      if (drag.kind === "agent") {
        patchStage(activeStageIndex, {
          agents: activeStage.agents.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
          abilities: activeStage.abilities.map((ab) =>
            ab.attachedToAgentId === drag.id
              ? { ...ab, x: p.x, y: p.y }
              : ab,
          ),
        });
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
            const stPos = resolvedPlacedAbilityStoredPosition(
              a,
              activeStage.agents,
            );
            const rawPointerDeg =
              (Math.atan2(p.y - stPos.y, p.x - stPos.x) * 180) / Math.PI;
            const unwrapped = unwrapPointerDegAlong(
              rawPointerDeg,
              abilityRotatePointerUnwrappedRef.current,
            );
            abilityRotatePointerUnwrappedRef.current = unwrapped;
            const rotationDeg = wrapDeg180(
              unwrapped + drag.rotationGrabDeg,
            );
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
          side: editorFrameSide,
          gameMap,
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
      const svg = dragSvgRef.current ?? svgRef.current;
      if (svg) {
        try {
          if (svg.hasPointerCapture(drag.pointerId)) {
            svg.releasePointerCapture(drag.pointerId);
          }
        } catch {
          /* ignore capture release errors */
        }
      }
      if (drag.kind === "agentVisionConeRotate") {
        lastVisionConeHandleAlongRef.current[drag.agentId] =
          drag.handleAlongDist;
      }
      dragSvgRef.current = null;
      setDrag(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [
    drag,
    activeStage,
    activeStageIndex,
    vb,
    editorFrameSide,
    gameMap,
    patchStage,
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
    setTokenTrayOpenSlug(null);
    const raw = svgPointerToLogical(svgRef.current, e.clientX, e.clientY);
    const pDisplay = clampPointToViewBox(vb, raw);
    const p = stratStagePinToStoredAttack(
      vb,
      editorFrameSide,
      gameMap,
      pDisplay,
    );
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
      placementMode.abilityBlueprintId,
    );
    const withToggleDefault = (
      placed: StratPlacedAbility,
    ): StratPlacedAbility => {
      if (
        bp?.shapeKind === "ray" &&
        bp.geometry.kind === "ray" &&
        bp.geometry.toggleable === true
      ) {
        return { ...placed, toggledOn: true };
      }
      return placed;
    };
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
          ...abilityFieldsFromPlacementMode(placementMode),
          x: ag.x,
          y: ag.y,
          rotationDeg,
          attachedToAgentId: ag.id,
        };
        setAbilities(
          activeStageIndex,
          [...activeStage.abilities, withToggleDefault(next)],
        );
      } else {
        const next: StratPlacedAbility = {
          id: newItemId(),
          agentSlug: placementMode.slug,
          ...abilityFieldsFromPlacementMode(placementMode),
          x: ag.x,
          y: ag.y,
          attachedToAgentId: ag.id,
        };
        setAbilities(
          activeStageIndex,
          [...activeStage.abilities, withToggleDefault(next)],
        );
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
          abilityBlueprintId: placementMode.abilityBlueprintId,
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
        ...abilityFieldsFromPlacementMode(placementMode),
        x: o.x,
        y: o.y,
        rotationDeg,
      };
      setAbilities(
        activeStageIndex,
        [...activeStage.abilities, withToggleDefault(next)],
      );
      setPlacementMode(null);
      setAbilityDirPreview(null);
      setSelectedId(null);
      return;
    }

    const next: StratPlacedAbility = {
      id: newItemId(),
      agentSlug: placementMode.slug,
      ...abilityFieldsFromPlacementMode(placementMode),
      x: p.x,
      y: p.y,
    };
    setAbilities(
      activeStageIndex,
      [...activeStage.abilities, withToggleDefault(next)],
    );
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
          placementMode.abilityBlueprintId,
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
      placementMode.abilityBlueprintId,
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

  const mapPlacementStatusText = useMemo(() => {
    if (!activeStage) return "";
    if (!placementMode) {
      return "";
    }
    if (placementMode.kind === "agent") {
      const r = roster.find((x) => x.slug === placementMode.slug);
      return `Placing agent token (${r?.name ?? placementMode.slug}) — click the map to drop.`;
    }
    const r = roster.find((x) => x.slug === placementMode.slug);
    const who = r?.name ?? placementMode.slug;
    const b = agentBlueprintForSlot(
      agentsCatalog,
      placementMode.slug,
      placementMode.slot,
      placementMode.abilityBlueprintId,
    );
    const slotLabel =
      placementMode.slot === "custom"
        ? (b?.name ?? "utility")
        : placementMode.slot.toUpperCase();
    if (placementMode.pendingOriginAttack) {
      return `Placing ${who} ${slotLabel} — click the map to set facing.`;
    }
    if (b && effectiveStratAttachToAgent(b)) {
      const m = effectiveStratPlacementMode(b);
      if (m === "origin_direction") {
        return `Placing ${who} ${slotLabel} — click the map to aim from the agent token.`;
      }
      return `Placing ${who} ${slotLabel} — click the map to drop on the agent.`;
    }
    const m = b ? effectiveStratPlacementMode(b) : "center";
    if (m === "origin_direction") {
      return `Placing ${who} ${slotLabel} — click the map for origin, then again for direction.`;
    }
    return `Placing ${who} ${slotLabel} — click the map to place.`;
  }, [activeStage, placementMode, roster, agentsCatalog]);

  const selectedAgentId =
    activeStage?.agents.some((a) => a.id === selectedId) ? selectedId : null;
  const orderedVisionConeAgents = useMemo(() => {
    if (!activeStage) return [];
    const withCones = activeStage.agents.filter((a) => a.visionConeWidth);
    return [...withCones].sort((a, b) => {
      const aSel = selectedAgentId === a.id ? 1 : 0;
      const bSel = selectedAgentId === b.id ? 1 : 0;
      return aSel - bSel;
    });
  }, [activeStage, selectedAgentId]);
  const orderedAbilities = useMemo(() => {
    if (!activeStage) return [];
    return [...activeStage.abilities].sort((a, b) => {
      const aPri =
        (selectedId === a.id ? 2 : 0) +
        (selectedAgentId && a.attachedToAgentId === selectedAgentId ? 1 : 0);
      const bPri =
        (selectedId === b.id ? 2 : 0) +
        (selectedAgentId && b.attachedToAgentId === selectedAgentId ? 1 : 0);
      return aPri - bPri;
    });
  }, [activeStage, selectedId, selectedAgentId]);

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
          setTokenTrayOpenSlug(null);
          setAgentVisionContextMenu(null);
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
                  editorFrameSide,
                  gameMap,
                  placementMode.pendingOriginAttack,
                ).x
              : (() => {
                  const ag = resolveStratAttachAgent(
                    activeStage,
                    placementMode.slug,
                    selectedId,
                  );
                  return ag
                    ? stratStagePinForDisplay(vb, editorFrameSide, gameMap, {
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
                  editorFrameSide,
                  gameMap,
                  placementMode.pendingOriginAttack,
                ).y
              : (() => {
                  const ag = resolveStratAttachAgent(
                    activeStage,
                    placementMode.slug,
                    selectedId,
                  );
                  return ag
                    ? stratStagePinForDisplay(vb, editorFrameSide, gameMap, {
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
      {orderedVisionConeAgents.map((agent) => {
          const w = agent.visionConeWidth!;
          const rot = agent.visionConeRotationDeg ?? 0;
          const sel = selectedId === agent.id;
          const pos = stratStagePinForDisplay(vb, editorFrameSide, gameMap, {
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
            side: editorFrameSide,
            gameMap,
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
      {orderedAbilities.map((ab) => {
        const agentTheme =
          agentsCatalog.find((a) => a.slug === ab.agentSlug)?.theme_color ??
          "rgb(34,211,238)";
        const sel = selectedId === ab.id;
        const stPos = resolvedPlacedAbilityStoredPosition(
          ab,
          activeStage.agents,
        );
        const pos = stratStagePinForDisplay(
          vb,
          editorFrameSide,
          gameMap,
          stPos,
        );
        const isAttached = Boolean(ab.attachedToAgentId);
        const bp = agentBlueprintForSlot(
          agentsCatalog,
          ab.agentSlug,
          ab.slot,
          ab.abilityBlueprintId,
        );
        const useTwoHandles =
          bp != null && effectiveStratPlacementMode(bp) === "origin_direction";
        const showRotationHandle = useTwoHandles && bp?.shapeKind !== "circle";
        const isRicochetHandles = useTwoHandles && bp?.shapeKind === "ricochet";
        const isToggleableRay =
          bp?.shapeKind === "ray" &&
          bp.geometry.kind === "ray" &&
          bp.geometry.toggleable === true;
        const legacyRayStartsDown =
          bp?.shapeKind === "ray" &&
          bp.geometry.kind === "ray" &&
          (bp.geometry as { wallState?: "up" | "down" }).wallState === "down";
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
        const rotPos = stratStagePinForDisplay(
          vb,
          editorFrameSide,
          gameMap,
          rotStored,
        );
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
        const rotationHandlePos = isRicochetHandles
          ? stratRicochetRotationHandleDisplay(
              pos,
              ab.rotationDeg ?? 0,
              vbWidth,
              pinS,
            )
          : isRectOD && rectCenterPos
            ? rectCenterPos
            : rotPos;
        const moveHandleRadius =
          Math.max(
            vbWidth * (isRicochetHandles ? 0.0058 : 0.0088),
            isRicochetHandles ? 3.1 : 4.2,
          ) * pinS;
        const rotateHandleHalf = Math.max(vbWidth * 0.0058, 3.1) * pinS;
        const rotateHandleSize = rotateHandleHalf * 2;
        const rayToggleDisplayPos =
          isToggleableRay && bp && bp.geometry.kind === "ray"
            ? (() => {
                const g = bp.geometry;
                const midBp = g.curve
                  ? {
                      x: 0.25 * g.x1 + 0.5 * g.curve.cx + 0.25 * g.x2,
                      y: 0.25 * g.y1 + 0.5 * g.curve.cy + 0.25 * g.y2,
                    }
                  : { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
                const mid = blueprintPointToStratMapDisplay(
                  midBp,
                  bp,
                  pos.x,
                  pos.y,
                  vbWidth,
                  ab.rotationDeg ?? 0,
                  stratOv,
                );
                const segStart = blueprintPointToStratMapDisplay(
                  { x: g.x1, y: g.y1 },
                  bp,
                  pos.x,
                  pos.y,
                  vbWidth,
                  ab.rotationDeg ?? 0,
                  stratOv,
                );
                const segEnd = blueprintPointToStratMapDisplay(
                  { x: g.x2, y: g.y2 },
                  bp,
                  pos.x,
                  pos.y,
                  vbWidth,
                  ab.rotationDeg ?? 0,
                  stratOv,
                );
                return stratToggleableRayToggleOffsetFromLine(
                  mid,
                  segStart,
                  segEnd,
                  [pos, rotationHandlePos],
                  vbWidth,
                  pinS,
                );
              })()
            : null;
        const rayToggleOn = ab.toggledOn ?? !legacyRayStartsDown;

        const abilitySvg = bp ? (
          <StratAbilityBlueprintSvg
            blueprint={bp}
            mapX={pos.x}
            mapY={pos.y}
            vbWidth={vbWidth}
            rotationDeg={ab.rotationDeg ?? 0}
            rayToggledOn={rayToggleOn}
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
              {placedAbilityPinLabel(ab, bp)}
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
                  {showRotationHandle ? (
                    <line
                      x1={pos.x}
                      y1={pos.y}
                      x2={rotationHandlePos.x}
                      y2={rotationHandlePos.y}
                      stroke={isRicochetHandles ? "rgb(250, 204, 21)" : accentColor}
                      opacity={isRicochetHandles ? 0.95 : 0.75}
                      strokeWidth={Math.max(vbWidth * 0.0018, 0.85) * pinS}
                      strokeDasharray={isRicochetHandles ? "3 6" : "6 5"}
                      pointerEvents="none"
                    />
                  ) : null}
                  {!isAttached ? (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={moveHandleRadius}
                      fill={isRicochetHandles ? "rgb(34, 197, 94)" : accentColor}
                      stroke={isRicochetHandles ? "#ecfccb" : sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                      strokeWidth={
                        Math.max(vbWidth * 0.0024, 1) *
                        (isRicochetHandles ? 1.9 : sel ? 2.2 : 1) *
                        pinS
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
                  {showRotationHandle ? (
                    <rect
                      x={rotationHandlePos.x - rotateHandleHalf}
                      y={rotationHandlePos.y - rotateHandleHalf}
                      width={rotateHandleSize}
                      height={rotateHandleSize}
                      rx={Math.max(vbWidth * 0.00145, 1.05) * pinS}
                      fill={isRicochetHandles ? "rgb(250, 204, 21)" : accentColor}
                      stroke={isRicochetHandles ? "#422006" : sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                      strokeWidth={Math.max(vbWidth * 0.00175, 0.9) * pinS}
                      transform={`rotate(45 ${rotationHandlePos.x} ${rotationHandlePos.y})`}
                      style={{
                        cursor: placementMode ? "default" : "grab",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (placementMode) return;
                        setSelectedId(ab.id);
                        focusMapSvg();
                        beginAbilityRotateDrag(e, ab);
                      }}
                    />
                  ) : null}
                  {isToggleableRay && rayToggleDisplayPos ? (
                    <g
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (placementMode) return;
                        setSelectedId(ab.id);
                        focusMapSvg();
                        setAbilities(
                          activeStageIndex,
                          activeStage.abilities.map((a) =>
                            a.id === ab.id
                              ? { ...a, toggledOn: !rayToggleOn }
                              : a,
                          ),
                        );
                      }}
                      style={{
                        cursor: placementMode ? "default" : "pointer",
                        touchAction: "none",
                      }}
                    >
                      <circle
                        cx={rayToggleDisplayPos.x}
                        cy={rayToggleDisplayPos.y}
                        r={Math.max(vbWidth * 0.011, 5.2) * pinS}
                        fill={rayToggleOn ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                        stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                        strokeWidth={Math.max(vbWidth * 0.0022, 1.1) * pinS}
                      />
                      <text
                        x={rayToggleDisplayPos.x}
                        y={rayToggleDisplayPos.y + Math.max(vbWidth * 0.0012, 0.55)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#f8fafc"
                        style={{
                          fontSize: Math.max(vbWidth * 0.008, 4.9) * pinS,
                          fontFamily: "system-ui, sans-serif",
                          fontWeight: 800,
                          pointerEvents: "none",
                        }}
                      >
                        {rayToggleOn ? "ON" : "OFF"}
                      </text>
                    </g>
                  ) : null}
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
            {sel && isToggleableRay && rayToggleDisplayPos ? (
              <g
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (placementMode) return;
                  setSelectedId(ab.id);
                  focusMapSvg();
                  setAbilities(
                    activeStageIndex,
                    activeStage.abilities.map((a) =>
                      a.id === ab.id
                        ? { ...a, toggledOn: !rayToggleOn }
                        : a,
                    ),
                  );
                }}
                style={{
                  cursor: placementMode ? "default" : "pointer",
                  touchAction: "none",
                }}
              >
                <circle
                  cx={rayToggleDisplayPos.x}
                  cy={rayToggleDisplayPos.y}
                  r={Math.max(vbWidth * 0.011, 5.2) * pinS}
                  fill={rayToggleOn ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                  stroke={sel ? "#faf5ff" : "rgb(15, 23, 42)"}
                  strokeWidth={Math.max(vbWidth * 0.0022, 1.1) * pinS}
                />
                <text
                  x={rayToggleDisplayPos.x}
                  y={rayToggleDisplayPos.y + Math.max(vbWidth * 0.0012, 0.55)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#f8fafc"
                  style={{
                    fontSize: Math.max(vbWidth * 0.008, 4.9) * pinS,
                    fontFamily: "system-ui, sans-serif",
                    fontWeight: 800,
                    pointerEvents: "none",
                  }}
                >
                  {rayToggleOn ? "ON" : "OFF"}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      <StratStageAgentTokens
        vb={vb}
        vbWidth={vbWidth}
        side={editorFrameSide}
        gameMap={gameMap}
        agents={activeStage.agents}
        roster={roster}
        transition={agentStageTrans}
        pinScale={mapPinScale}
        interactive={{
          selectedId,
          onPointerDown: (a, pos, e) => {
            e.stopPropagation();
            setSelectedId(a.id);
            focusMapSvg();
            const svg =
              (e.currentTarget as SVGGElement).ownerSVGElement ?? svgRef.current;
            if (svg) {
              dragSvgRef.current = svg;
              try {
                svg.setPointerCapture(e.pointerId);
              } catch {
                /* capture may fail on some synthetic pointer sources */
              }
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
          onContextMenu: (a, _pos, e) => {
            setSelectedId(a.id);
            setAgentVisionContextMenu({
              clientX: e.clientX,
              clientY: e.clientY,
              agentId: a.id,
            });
          },
        }}
      />
    </g>
  ) : null;

  function addStage() {
    const prev = stages[stages.length - 1];
    const next =
      prev != null
        ? {
            ...prev,
            id: newItemId(),
            agents: prev.agents.map((a) => ({ ...a })),
            abilities: prev.abilities.map((a) => ({ ...a })),
            mapLayerVisibility: prev.mapLayerVisibility
              ? { ...prev.mapLayerVisibility }
              : undefined,
            doorOpenByOverlayId: prev.doorOpenByOverlayId
              ? { ...prev.doorOpenByOverlayId }
              : undefined,
          }
        : createEmptyStratStage(stages.length);
    onStagesChange([...stages, next]);
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

  const stageSelectorUnderMap = (
    <div className="mt-2 min-w-0 max-w-full shrink-0 overflow-x-auto rounded-lg border border-violet-800/40 bg-slate-950/50 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {stages.map((st, idx) => (
            <div key={st.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveStageIndex(idx)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
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
                  className="rounded p-1.5 text-violet-400/60 hover:bg-fuchsia-950/40 hover:text-fuchsia-200"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={addStage}
            className="btn-secondary inline-flex items-center gap-1 py-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Stage
          </button>
        </div>
        <div className="flex shrink-0 items-stretch gap-1">
          <button
            type="button"
            className="btn-secondary inline-flex min-h-10 items-center justify-center px-2.5"
            disabled={activeStageIndex <= 0}
            onClick={() => setActiveStageIndex((i) => Math.max(0, i - 1))}
            title="Previous stage"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex min-h-10 items-center justify-center px-2.5"
            disabled={activeStageIndex >= stages.length - 1}
            onClick={() =>
              setActiveStageIndex((i) => Math.min(stages.length - 1, i + 1))
            }
            title="Next stage"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const controlsPanel = !activeStage ? (
    <p className="text-sm text-amber-200/80">
      Add strat stages data (save error). Try refreshing the coach page.
    </p>
  ) : (
    <div className="flex h-full max-h-[min(72dvh,800px)] min-h-0 w-full min-w-0 flex-col lg:max-h-none">
        <div className="shrink-0 rounded-lg border border-violet-800/40 bg-slate-950/50 px-3 py-2.5">
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
          {valorantUiError ? (
            <p className="mt-2 text-[10px] leading-snug text-amber-200/75">
              Could not load Valorant ability names ({valorantUiError}). Slot
              letters still work on the map tray.
            </p>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
            <div className="space-y-4">
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
        </div>
    </div>
  );

  const mapPanel =
    activeStage ? (
      <div className="flex min-h-[min(44dvh,260px)] w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:flex-1">
        <div className="relative z-20 shrink-0 border-b border-violet-800/40 bg-slate-950/95 px-2 py-2">
          <div className="flex min-w-0 flex-wrap items-stretch justify-between gap-3">
            {roster.length === 0 ? (
              <p className="text-xs text-amber-200/85">
                Add agents in the Details tab comp to use the portrait tray above the
                map.
              </p>
            ) : (
              <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-start gap-2">
                {roster.map((r) => {
                  const agentPlacedOnStage = activeStage.agents.some(
                    (x) => x.agentSlug === r.slug,
                  );
                  const trayOpen = tokenTrayOpenSlug === r.slug;
                  const portraitActive =
                    (placementMode?.kind === "agent" &&
                      placementMode.slug === r.slug) ||
                    (placementMode?.kind === "ability" &&
                      placementMode.slug === r.slug);
                  return (
                    <div key={r.slug} className="relative">
                      <button
                        type="button"
                        title={r.name}
                        onClick={() => {
                          setTokenTrayOpenSlug((s) =>
                            s === r.slug ? null : r.slug,
                          );
                          focusMapSvg();
                        }}
                        className={`relative block rounded-full border-2 transition ${
                          trayOpen || portraitActive
                            ? "border-violet-400 shadow-md shadow-violet-900/40"
                            : "border-violet-800/50 hover:border-violet-500/70"
                        }`}
                      >
                        {r.portraitUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- coach roster portraits from Valorant CDN
                          <img
                            src={r.portraitUrl}
                            alt=""
                            className="h-11 w-11 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-950/80 text-sm font-bold text-violet-100">
                            {r.name.slice(0, 1)}
                          </div>
                        )}
                      </button>
                      {trayOpen ? (
                        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-max min-w-[220px] max-w-[min(480px,calc(100vw-1.25rem))] rounded-xl border border-violet-700/50 bg-slate-950 px-2 py-2 shadow-2xl shadow-violet-950/50">
                          <p className="mb-1.5 text-[10px] font-medium text-violet-400/90">
                            {r.name}
                          </p>
                          <button
                            type="button"
                            disabled={agentPlacedOnStage}
                            title={
                              agentPlacedOnStage
                                ? "This agent is already on this stage"
                                : "Then click the map to drop the token"
                            }
                            onClick={() => {
                              setPlacementMode((m) =>
                                m?.kind === "agent" && m.slug === r.slug
                                  ? null
                                  : { kind: "agent", slug: r.slug },
                              );
                              focusMapSvg();
                            }}
                            className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs font-medium ${
                              placementMode?.kind === "agent" &&
                              placementMode.slug === r.slug
                                ? "border-violet-400 bg-violet-950/60 text-white"
                                : "border-violet-800/45 bg-slate-950/60 text-violet-200 hover:border-violet-600/50"
                            } disabled:cursor-not-allowed disabled:opacity-45`}
                          >
                            Place agent token
                          </button>
                          <div className="mt-2 flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain border-t border-violet-800/35 pt-2 pb-0.5 [scrollbar-gutter:stable]">
                            {r.abilityPlacementOptions.map((opt) => {
                              const slotForLookup: StratPlacedAbility["slot"] =
                                opt.kind === "key" ? opt.slot : "custom";
                              const vm =
                                opt.kind === "key"
                                  ? abilityMetaForSlot(
                                      valorantAbilityUi,
                                      r.slug,
                                      opt.slot,
                                    )
                                  : undefined;
                              const bpChip = agentBlueprintForSlot(
                                agentsCatalog,
                                r.slug,
                                slotForLookup,
                                opt.kind === "custom" ? opt.blueprintId : undefined,
                              );
                              const attachNeedsToken =
                                bpChip != null &&
                                effectiveStratAttachToAgent(bpChip) &&
                                !agentPlacedOnStage;
                              const title = attachNeedsToken
                                ? `Place ${r.name} on the map first — this ability attaches to the agent token.`
                                : opt.kind === "custom"
                                  ? `Place ${opt.name} (${r.name})`
                                  : vm
                                    ? `${vm.displayName}\n\n${vm.description}`
                                    : `Place ${opt.slot.toUpperCase()} for ${r.name}`;
                              const chipKey =
                                opt.kind === "key"
                                  ? opt.slot
                                  : `c-${opt.blueprintId}`;
                              const active = isActiveAbilityPlacementOption(
                                placementMode,
                                r.slug,
                                opt,
                              );
                              return (
                                <button
                                  key={chipKey}
                                  type="button"
                                  disabled={attachNeedsToken}
                                  title={title}
                                  onClick={() => {
                                    setPlacementMode((m) =>
                                      isActiveAbilityPlacementOption(m, r.slug, opt)
                                        ? null
                                        : {
                                            kind: "ability",
                                            slug: r.slug,
                                            slot:
                                              opt.kind === "key"
                                                ? opt.slot
                                                : "custom",
                                            abilityBlueprintId:
                                              opt.kind === "custom"
                                                ? opt.blueprintId
                                                : undefined,
                                          },
                                    );
                                    focusMapSvg();
                                  }}
                                  className={`flex min-h-9 w-19 shrink-0 flex-col items-center justify-center rounded border px-1 py-0.5 text-left leading-tight transition sm:w-21 ${
                                    active
                                      ? "border-cyan-400 bg-cyan-950/50 text-white"
                                      : "border-violet-800/50 bg-slate-950/70 text-violet-200"
                                  } disabled:cursor-not-allowed disabled:opacity-45`}
                                >
                                  <span className="text-[11px] font-bold">
                                    {opt.kind === "key"
                                      ? opt.slot.toUpperCase()
                                      : "★"}
                                  </span>
                                  {opt.kind === "custom" ? (
                                    <span className="line-clamp-2 w-full text-center text-[9px] font-normal text-violet-300/85">
                                      {opt.name}
                                    </span>
                                  ) : vm ? (
                                    <span className="line-clamp-2 w-full text-center text-[9px] font-normal text-violet-300/85">
                                      {vm.displayName}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                          {placementMode ? (
                            <button
                              type="button"
                              className="mt-2 w-full text-center text-[10px] text-violet-400 underline hover:text-violet-200"
                              onClick={() => {
                                setPlacementMode(null);
                                setAbilityDirPreview(null);
                              }}
                            >
                              Cancel placement
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex shrink-0 flex-wrap items-stretch gap-2">
              <button
                type="button"
                onClick={() => setMapLayersModalOpen(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-violet-700/55 bg-slate-950/80 px-3 text-xs font-medium text-violet-100/90 hover:border-violet-500/60 hover:bg-violet-950/45"
              >
                Map filters
              </button>
              <button
                type="button"
                onClick={() => setMapControlsModalOpen(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-violet-700/55 bg-slate-950/80 px-3 text-xs font-medium text-violet-100/90 hover:border-violet-500/60 hover:bg-violet-950/45"
              >
                Map controls
              </button>
              <button
                type="button"
                onClick={() => setMapResetZoomSignal((n) => n + 1)}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-violet-700/50 bg-slate-950/80 px-3 text-xs font-medium text-violet-200 hover:border-violet-500/50 hover:bg-violet-950/50"
              >
                Reset zoom
              </button>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <StratMapViewer
            ref={svgRef}
            gameMap={gameMap}
            side={editorFrameSide}
            rotateView180={rotateView180}
            showLayerToggles={false}
            showFooter={false}
            showInlineResetZoom={false}
            layerModalOpen={mapLayersModalOpen}
            onLayerModalOpenChange={setMapLayersModalOpen}
            resetZoomSignal={mapResetZoomSignal}
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
        {mapPlacementStatusText ? (
          <div className="mt-2 min-w-0 shrink-0 rounded-lg border border-violet-800/40 bg-slate-950/55 px-3 py-2.5">
            <p className="wrap-anywhere text-sm font-medium leading-snug text-violet-100/95">
              {mapPlacementStatusText}
            </p>
          </div>
        ) : null}

        {mapControlsModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/75"
              onClick={() => setMapControlsModalOpen(false)}
              aria-label="Close map controls"
            />
            <div className="relative z-10 w-full max-w-[min(100%,48rem)] min-w-0 rounded-xl border border-violet-600/35 bg-slate-950 px-4 py-4 shadow-2xl shadow-violet-950/45">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-violet-100">
                  Map controls
                </h3>
                <button
                  type="button"
                  onClick={() => setMapControlsModalOpen(false)}
                  className="rounded-md border border-violet-700/50 px-2 py-1 text-xs text-violet-200 hover:bg-violet-950/45"
                >
                  Close
                </button>
              </div>
              <ul className="grid max-h-[70dvh] gap-2 overflow-y-auto sm:grid-cols-2">
                <li className="flex gap-2 rounded-md border border-violet-800/25 bg-slate-950/50 px-2 py-1.5">
                  <MousePointerClick
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400/90"
                    aria-hidden
                  />
                  <span className="text-[11px] leading-snug text-violet-100/90">
                    <span className="font-semibold text-violet-200">Place</span>
                    <span className="text-violet-400/90"> · </span>
                    Open a portrait, choose agent or ability, then click the map.
                  </span>
                </li>
                <li className="flex gap-2 rounded-md border border-violet-800/25 bg-slate-950/50 px-2 py-1.5">
                  <ScanEye
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-400/85"
                    aria-hidden
                  />
                  <span className="text-[11px] leading-snug text-violet-100/90">
                    <span className="font-semibold text-violet-200">Vision</span>
                    <span className="text-violet-400/90"> · </span>
                    Right-click an agent token for cone options.
                  </span>
                </li>
                <li className="flex gap-2 rounded-md border border-violet-800/25 bg-slate-950/50 px-2 py-1.5">
                  <Move
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/85"
                    aria-hidden
                  />
                  <span className="text-[11px] leading-snug text-violet-100/90">
                    <span className="font-semibold text-violet-200">Adjust</span>
                    <span className="text-violet-400/90"> · </span>
                    Drag tokens and ability pins to move them.
                  </span>
                </li>
                <li className="flex gap-2 rounded-md border border-violet-800/25 bg-slate-950/50 px-2 py-1.5">
                  <Trash2
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/80"
                    aria-hidden
                  />
                  <span className="text-[11px] leading-snug text-violet-100/90">
                    <span className="font-semibold text-violet-200">Remove</span>
                    <span className="text-violet-400/90"> · </span>
                    Press Delete or Backspace to clear the selection.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
        {stageSelectorUnderMap}
        {agentVisionContextMenu ? (
          <>
            <button
              type="button"
              aria-label="Dismiss menu"
              className="fixed inset-0 z-45 cursor-default bg-transparent"
              onPointerDown={() => setAgentVisionContextMenu(null)}
            />
            <div
              role="menu"
              className="fixed z-50 min-w-42 rounded-lg border border-violet-700/55 bg-slate-950 py-1 shadow-2xl shadow-violet-950/50"
              style={clampFixedMenuPosition(
                agentVisionContextMenu.clientX,
                agentVisionContextMenu.clientY,
                176,
                132,
              )}
            >
              {(
                [
                  { key: "off" as const, label: "Vision cone: Off" },
                  { key: "wide" as const, label: "Vision cone: Wide" },
                  { key: "thin" as const, label: "Vision cone: Thin" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-xs text-violet-100 hover:bg-violet-900/45"
                  onClick={() => {
                    const id = agentVisionContextMenu.agentId;
                    if (key === "off") {
                      setAgents(
                        activeStageIndex,
                        activeStage.agents.map((ag) => {
                          if (ag.id !== id) return ag;
                          const {
                            visionConeWidth: _vw,
                            visionConeRotationDeg: _vr,
                            ...rest
                          } = ag;
                          return rest;
                        }),
                      );
                    } else {
                      setAgents(
                        activeStageIndex,
                        activeStage.agents.map((ag) =>
                          ag.id === id
                            ? {
                                ...ag,
                                visionConeWidth: key,
                                visionConeRotationDeg:
                                  ag.visionConeRotationDeg ?? 0,
                              }
                            : ag,
                        ),
                      );
                    }
                    setAgentVisionContextMenu(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : null}
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
