"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { clientToSvgPoint } from "@/lib/svg-coords";
import { createEmptyStratStage } from "@/lib/strat-stages";
import type { MapPoint, ViewBoxRect } from "@/lib/map-path";

type PlacementMode =
  | null
  | { kind: "agent"; slug: string }
  | { kind: "ability"; slug: string; slot: StratPlacedAbility["slot"] };

type DragState =
  | {
      kind: "agent" | "ability";
      id: string;
      grabDx: number;
      grabDy: number;
      pointerId: number;
    }
  | null;

function newItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function abbrevAgentName(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
}

function roleAccent(role: string): { fill: string; stroke: string } {
  const r = role.toLowerCase();
  if (r.includes("duelist"))
    return { fill: "rgba(251,113,133,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("initiator"))
    return { fill: "rgba(251,191,36,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("controller"))
    return { fill: "rgba(56,189,248,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("sentinel"))
    return { fill: "rgba(148,163,184,0.95)", stroke: "rgba(255,255,255,0.92)" };
  return { fill: "rgba(167,139,250,0.95)", stroke: "rgba(255,255,255,0.92)" };
}

function slotStyle(slot: StratPlacedAbility["slot"]): {
  fill: string;
  stroke: string;
} {
  switch (slot) {
    case "q":
      return { fill: "rgba(34,211,238,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "e":
      return { fill: "rgba(74,222,128,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "c":
      return { fill: "rgba(251,191,36,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "x":
      return { fill: "rgba(248,113,113,0.95)", stroke: "rgba(255,255,255,0.9)" };
    default:
      return { fill: "rgba(255,255,255,0.85)", stroke: "rgba(0,0,0,0.4)" };
  }
}

function slotLabel(slot: StratPlacedAbility["slot"]): string {
  return slot.toUpperCase();
}

function clampToViewBox(vb: ViewBoxRect, p: MapPoint): MapPoint {
  return {
    x: Math.min(vb.minX + vb.width, Math.max(vb.minX, p.x)),
    y: Math.min(vb.minY + vb.height, Math.max(vb.minY, p.y)),
  };
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
}: {
  gameMap: GameMap;
  side: StratSide;
  /** Five agent slugs from the strat form (may include empty strings). */
  compSlugs: string[];
  agentsCatalog: Agent[];
  stages: StratStage[];
  onStagesChange: (next: StratStage[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapAnim, setMapAnim] = useState<{
    name: string;
    ms: number;
  } | null>(null);

  const didMountRef = useRef(false);

  useEffect(() => {
    setPlacementMode(null);
    setSelectedId(null);
  }, [activeStageIndex]);

  const { vb, vbWidth } = useMemo(() => {
    const d = stratMapDisplayData(gameMap, side);
    return { vb: d.vb, vbWidth: d.vb.width };
  }, [gameMap, side]);

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
      const raw = clientToSvgPoint(svg, e.clientX, e.clientY);
      const p = clampToViewBox(vb, {
        x: raw.x - drag.grabDx,
        y: raw.y - drag.grabDy,
      });
      if (drag.kind === "agent") {
        setAgents(
          activeStageIndex,
          activeStage.agents.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
        );
      } else {
        setAbilities(
          activeStageIndex,
          activeStage.abilities.map((a) =>
            a.id === drag.id ? { ...a, x: p.x, y: p.y } : a,
          ),
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
  }, [drag, activeStage, activeStageIndex, vb, setAgents, setAbilities]);

  function onMapBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (!placementMode || !svgRef.current || !activeStage) return;
    const raw = clientToSvgPoint(svgRef.current, e.clientX, e.clientY);
    const p = clampToViewBox(vb, raw);
    if (placementMode.kind === "agent") {
      const next: StratPlacedAgent = {
        id: newItemId(),
        agentSlug: placementMode.slug,
        x: p.x,
        y: p.y,
      };
      setAgents(activeStageIndex, [...activeStage.agents, next]);
    } else {
      const next: StratPlacedAbility = {
        id: newItemId(),
        agentSlug: placementMode.slug,
        slot: placementMode.slot,
        x: p.x,
        y: p.y,
      };
      setAbilities(activeStageIndex, [...activeStage.abilities, next]);
    }
    setPlacementMode(null);
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
        onPointerDown={onMapBackgroundPointerDown}
        style={{ cursor: placementMode ? "crosshair" : "default" }}
      />
      {activeStage.agents.map((a) => {
        const meta = roster.find((r) => r.slug === a.agentSlug);
        const accent = meta
          ? roleAccent(meta.role)
          : { fill: "#94a3b8", stroke: "#fff" };
        const abbr = meta ? abbrevAgentName(meta.name) : a.agentSlug.slice(0, 2).toUpperCase();
        const sel = selectedId === a.id;
        return (
          <g
            key={a.id}
            transform={`translate(${a.x},${a.y})`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (placementMode) return;
              setSelectedId(a.id);
              const svg = svgRef.current;
              if (svg) {
                const o = clientToSvgPoint(svg, e.clientX, e.clientY);
                setDrag({
                  kind: "agent",
                  id: a.id,
                  grabDx: o.x - a.x,
                  grabDy: o.y - a.y,
                  pointerId: e.pointerId,
                });
              }
            }}
            style={{ cursor: placementMode ? "default" : "grab" }}
          >
            <circle
              r={tokenR}
              fill={accent.fill}
              stroke={sel ? "#fae8ff" : accent.stroke}
              strokeWidth={vbWidth * 0.0028 * (sel ? 2.2 : 1)}
            />
            <text
              y={fontAgent * 0.35}
              textAnchor="middle"
              fill="rgba(15,23,42,0.92)"
              style={{
                fontSize: fontAgent,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 800,
                pointerEvents: "none",
              }}
            >
              {abbr}
            </text>
          </g>
        );
      })}
      {activeStage.abilities.map((ab) => {
        const st = slotStyle(ab.slot);
        const sel = selectedId === ab.id;
        return (
          <g
            key={ab.id}
            transform={`translate(${ab.x},${ab.y})`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (placementMode) return;
              setSelectedId(ab.id);
              const svg = svgRef.current;
              if (svg) {
                const o = clientToSvgPoint(svg, e.clientX, e.clientY);
                setDrag({
                  kind: "ability",
                  id: ab.id,
                  grabDx: o.x - ab.x,
                  grabDy: o.y - ab.y,
                  pointerId: e.pointerId,
                });
              }
            }}
            style={{ cursor: placementMode ? "default" : "grab" }}
          >
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
              {slotLabel(ab.slot)}
            </text>
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

  if (!activeStage) {
    return (
      <p className="text-sm text-amber-200/80">
        Add strat stages data (save error). Try refreshing the coach page.
      </p>
    );
  }

  return (
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
        <div>
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
        <div className="sm:col-span-2">
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
            className="input-field mt-1 max-w-[220px]"
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
            className="input-field mt-1 min-h-[72px]"
            placeholder="Coach notes for this beat…"
          />
        </div>
      </div>

      <div className="rounded-lg border border-violet-800/35 bg-slate-950/40 p-3">
        <p className="text-xs text-violet-300/70">
          {placementMode ? (
            <>
              <span className="text-violet-200">Placement mode:</span> click the
              map to drop{" "}
              {placementMode.kind === "agent" ? (
                <>an agent token ({placementMode.slug})</>
              ) : (
                <>
                  {placementMode.slot.toUpperCase()} for {placementMode.slug}
                </>
              )}
              .{" "}
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
              Choose <strong className="text-slate-200">Place agent</strong> or an
              ability button, then click the map. Drag tokens to adjust. Select a
              token and press Delete to remove.
            </>
          )}
        </p>
        {roster.length === 0 ? (
          <p className="mt-2 text-xs text-amber-200/80">
            Fill all five agents in the comp above to place icons and abilities.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {roster.map((r) => (
              <div key={r.slug} className="flex flex-wrap items-center gap-1">
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
                {(["q", "e", "c", "x"] as const).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    title={`Place ${slot.toUpperCase()} for ${r.name}`}
                    onClick={() =>
                      setPlacementMode((m) =>
                        m?.kind === "ability" &&
                        m.slug === r.slug &&
                        m.slot === slot
                          ? null
                          : { kind: "ability", slug: r.slug, slot },
                      )
                    }
                    className={`h-7 w-7 rounded border text-[11px] font-bold ${
                      placementMode?.kind === "ability" &&
                      placementMode.slug === r.slug &&
                      placementMode.slot === slot
                        ? "border-cyan-400 bg-cyan-950/50 text-white"
                        : "border-violet-800/50 bg-slate-950/70 text-violet-200"
                    }`}
                  >
                    {slot.toUpperCase()}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
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
        >
          {overlay}
        </StratMapViewer>
      </div>
    </div>
  );
}
