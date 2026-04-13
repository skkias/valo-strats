"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import type { Agent, GameMap } from "@/types/catalog";
import type { Strat } from "@/types/strat";
import type { StratAgentTokenTransition } from "@/components/StratStageAgentTokens";
import { StratViewerPanel } from "@/components/StratViewerPanel";
import { resolveGameMapForStrat } from "@/lib/resolve-game-map";
import {
  abilityMetaForSlot,
  fetchValorantAbilityUiBySlug,
  type ValorantAbilityUiMeta,
} from "@/lib/valorant-api-abilities";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Swords,
  Shield,
  Layers,
} from "lucide-react";

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, "").trim();
}

function parseStepTiming(input: string): string | null {
  const clean = stripHtml(input);
  const m = clean.match(/^\s*(\[(?:\d{1,2}:\d{2}|T\+\d{1,2})\]|T\+\d{1,2}|\d{1,2}:\d{2})/i);
  if (!m) return null;
  return m[1]?.replace(/^\[|\]$/g, "") ?? null;
}

export function StratModal({
  strat,
  onClose,
  maps = [],
  agentsCatalog = [],
}: {
  strat: Strat | null;
  onClose: () => void;
  maps?: GameMap[];
  agentsCatalog?: Agent[];
}) {
  const images = strat?.images?.filter((i) => i.url) ?? [];
  const [imageIndex, setImageIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [agentStageTransition, setAgentStageTransition] =
    useState<StratAgentTokenTransition | null>(null);
  const [abilityMetaBySlug, setAbilityMetaBySlug] = useState<
    Record<string, ValorantAbilityUiMeta[]>
  >({});
  const lastStageIdxRef = useRef(0);
  const prevStratIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!strat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strat, onClose]);

  useEffect(() => {
    if (!strat) return;
    setImageIndex(0);
    setStageIndex(0);
  }, [strat?.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchValorantAbilityUiBySlug()
      .then((data) => {
        if (!cancelled) setAbilityMetaBySlug(data);
      })
      .catch(() => {
        if (!cancelled) setAbilityMetaBySlug({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gameMap = useMemo(
    () => (strat ? resolveGameMapForStrat(strat, maps) : null),
    [strat, maps],
  );

  const stages = strat?.strat_stages ?? [];
  const maxStage = Math.max(0, stages.length - 1);
  const safeStageIndex = Math.min(stageIndex, maxStage);
  const activeStage = stages[safeStageIndex] ?? stages[0];
  const activeStageUtility = useMemo(() => {
    if (!activeStage) return [];
    return activeStage.abilities.map((ab) => {
      const meta = abilityMetaForSlot(abilityMetaBySlug, ab.agentSlug, ab.slot);
      return {
        id: ab.id,
        agentSlug: ab.agentSlug,
        slot: ab.slot.toUpperCase(),
        name: meta?.displayName ?? ab.slot.toUpperCase(),
      };
    });
  }, [activeStage, abilityMetaBySlug]);

  useLayoutEffect(() => {
    if (!strat) return;
    if (prevStratIdRef.current !== strat.id) {
      prevStratIdRef.current = strat.id;
      lastStageIdxRef.current = 0;
      setAgentStageTransition(null);
      return;
    }
    if (lastStageIdxRef.current === safeStageIndex) return;
    const fromIdx = lastStageIdxRef.current;
    lastStageIdxRef.current = safeStageIndex;
    const leaving = stages[fromIdx];
    if (!leaving || leaving.transition === "none") {
      setAgentStageTransition(null);
      return;
    }
    setAgentStageTransition({
      fromStage: stages[fromIdx],
      kind: leaving.transition,
      ms: leaving.transitionMs,
    });
    const tid = window.setTimeout(
      () => setAgentStageTransition(null),
      leaving.transitionMs + 80,
    );
    return () => window.clearTimeout(tid);
  }, [strat, safeStageIndex, stages]);

  const goImage = useCallback(
    (dir: -1 | 1) => {
      if (images.length === 0) return;
      setImageIndex((i) => (i + dir + images.length) % images.length);
    },
    [images.length],
  );

  if (!strat) return null;

  const currentImage = images[imageIndex];
  const compSlugs = strat.agents;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:p-2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="strat-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex h-dvh min-h-0 w-full max-w-none flex-col overflow-hidden border-0 border-violet-500/25 bg-slate-950/95 shadow-2xl shadow-violet-950/40 sm:max-h-[calc(100dvh-1rem)] sm:rounded-xl sm:border sm:ring-1 sm:ring-violet-500/10">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-violet-500/15 px-4 py-4 sm:px-6">
          <div>
            <h2
              id="strat-modal-title"
              className="text-xl font-semibold text-white"
            >
              {strat.title}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-violet-200/65">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {strat.map}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  strat.side === "atk"
                    ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/20"
                    : "bg-sky-500/15 text-sky-300"
                }`}
              >
                {strat.side === "atk" ? (
                  <Swords className="h-3.5 w-3.5" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                {strat.side === "atk" ? "Attack" : "Defense"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-violet-300/70 transition hover:bg-violet-950/80 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {gameMap && activeStage ? (
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="order-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto border-violet-500/10 px-4 py-4 sm:px-5 lg:order-1 lg:max-w-[min(100%,520px)] lg:flex-[0_1_42%] lg:border-r lg:pr-5">
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                  <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Stages & overview
                </div>
                {stages.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-violet-300/70">
                      Stage timeline
                    </p>
                    <div
                      className="flex gap-2 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      role="tablist"
                      aria-label="Strat stages"
                    >
                      {stages.map((st, i) => {
                        const on = i === safeStageIndex;
                        return (
                          <button
                            key={st.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => setStageIndex(i)}
                            className={`flex shrink-0 items-baseline gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                              on
                                ? "border-violet-500/50 bg-violet-950/55 text-violet-50 shadow-md shadow-violet-950/20"
                                : "border-violet-800/40 bg-slate-950/50 text-violet-200/85 hover:border-violet-500/35"
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                on
                                  ? "bg-violet-600 text-white"
                                  : "bg-slate-900 text-violet-300/80"
                              }`}
                            >
                              {i + 1}
                            </span>
                            <span className="max-w-56 font-medium leading-snug">
                              {st.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {activeStage?.notes?.trim() ? (
                      <p className="rounded-lg border border-violet-500/15 bg-slate-950/50 p-3 text-sm text-violet-100/90">
                        {activeStage.notes}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="mt-6 space-y-6 pb-2">
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                      Summary
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-200/90">
                      {strat.description}
                    </p>
                  </section>

                  {strat.steps.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                        Execution timeline
                      </h3>
                      <ol className="mt-3 space-y-2">
                        {strat.steps.map((s, i) => {
                          const timing = parseStepTiming(s.text);
                          return (
                            <li
                              key={`timeline-${i}`}
                              className="rounded-lg border border-violet-800/35 bg-slate-950/45 px-3 py-2 text-sm text-violet-100/90"
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-xs font-semibold text-violet-300/70">
                                  Step {i + 1}
                                </span>
                                {timing ? (
                                  <span className="rounded-full border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                                    {timing}
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-sm text-slate-200/90">{stripHtml(s.text)}</p>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  )}

                  {activeStageUtility.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                        Utility in this stage
                      </h3>
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {activeStageUtility.map((u) => (
                          <li
                            key={u.id}
                            className="rounded-lg border border-violet-700/35 bg-slate-950/45 px-3 py-2 text-sm text-slate-100/90"
                          >
                            <span className="font-semibold text-violet-200">{u.agentSlug}</span>
                            <span className="text-violet-400/55"> · </span>
                            <span className="text-cyan-200">{u.slot}</span>
                            <span className="text-violet-400/55"> · </span>
                            <span>{u.name}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {strat.steps.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                        Detailed plan
                      </h3>
                      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200/90">
                        {strat.steps.map((s, i) => (
                          <li
                            key={i}
                            className="leading-relaxed [&_strong]:text-violet-200"
                            dangerouslySetInnerHTML={{ __html: s.text }}
                          />
                        ))}
                      </ol>
                    </section>
                  )}

                  {strat.roles.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                        Roles
                      </h3>
                      <ul className="mt-3 space-y-2">
                        {strat.roles.map((r, i) => (
                          <li
                            key={i}
                            className="rounded-lg border border-violet-500/20 bg-violet-950/25 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-violet-200">
                              {r.agent}
                            </span>
                            <span className="text-violet-400/45"> — </span>
                            <span className="text-slate-200/85">{r.desc}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {strat.notes && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                        Coach notes
                      </h3>
                      <p className="mt-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/20 p-3 text-sm text-fuchsia-100/90">
                        {strat.notes}
                      </p>
                    </section>
                  )}
                </div>

                {images.length > 0 && currentImage && (
                  <div className="relative mt-4 aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-black">
                    <Image
                      src={currentImage.url}
                      alt={currentImage.label || strat.title}
                      fill
                      className="object-contain"
                      sizes="(max-width: 1024px) 100vw, 520px"
                      priority
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => goImage(-1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                          aria-label="Previous image"
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                          type="button"
                          onClick={() => goImage(1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                          aria-label="Next image"
                        >
                          <ChevronRight className="h-6 w-6" />
                        </button>
                        <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-zinc-300">
                          {currentImage.label && (
                            <span className="rounded bg-black/60 px-2 py-1">
                              {currentImage.label}
                            </span>
                          )}
                          <span className="ml-2 text-zinc-500">
                            {imageIndex + 1} / {images.length}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="order-1 flex min-h-[min(42vh,380px)] min-w-0 shrink-0 flex-col border-b border-violet-500/10 bg-slate-950/50 px-2 pb-2 pt-2 sm:px-3 lg:order-2 lg:min-h-0 lg:flex-1 lg:border-b-0 lg:border-l lg:pb-3 lg:pl-3 lg:pt-3">
                <StratViewerPanel
                  gameMap={gameMap}
                  side={strat.side}
                  stage={activeStage}
                  compSlugs={compSlugs}
                  agentsCatalog={agentsCatalog}
                  agentTransition={agentStageTransition}
                  embed
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-violet-300/70">
                {gameMap
                  ? "No stage data for this strat."
                  : maps.length === 0
                    ? "Map catalog unavailable — link this strat to a map in Coach to see the vector layout."
                    : "No matching map in the catalog for this strat. Assign a map in Coach or fix the map name."}
              </p>
              <div className="mt-8 space-y-6">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                    Summary
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200/90">
                    {strat.description}
                  </p>
                </section>
                {strat.steps.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                      Round plan
                    </h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200/90">
                      {strat.steps.map((s, i) => (
                        <li
                          key={i}
                          className="leading-relaxed [&_strong]:text-violet-200"
                          dangerouslySetInnerHTML={{ __html: s.text }}
                        />
                      ))}
                    </ol>
                  </section>
                )}
                {strat.notes && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                      Coach notes
                    </h3>
                    <p className="mt-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/20 p-3 text-sm text-fuchsia-100/90">
                      {strat.notes}
                    </p>
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
