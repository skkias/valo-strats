"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  Strat,
  StratSide,
} from "@/types/strat";
import type { Agent, GameMap } from "@/types/catalog";
import {
  Loader2,
  Folder,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import {
  createStratAction,
  deleteStratAction,
  listStratsForCoach,
  updateStratAction,
  uploadStratImageAction,
} from "@/app/coach/strat-actions";
import {
  emptyCoachForm,
  groupStratsByMap,
  parseRoles,
  resolveMapIdForStrat,
  slotsFromStratAgents,
} from "@/lib/coach-strat-form";
import { CoachAgentSlotPicker } from "@/components/coach/CoachAgentSlotPicker";
import { DifficultyPicker } from "@/components/coach/DifficultyPicker";
import { StratSideToggle } from "@/components/coach/StratSideToggle";

const StratStageEditor = dynamic(
  () => import("@/components/StratStageEditor").then((m) => m.StratStageEditor),
  {
    ssr: false,
    loading: () => (
      <p className="rounded-lg border border-violet-800/40 bg-slate-950/55 px-3 py-2 text-xs text-violet-300/75">
        Loading stage editor…
      </p>
    ),
  },
);

export function CoachDashboard({
  initialAgents,
  initialMaps,
  catalogError,
}: {
  initialAgents: Agent[];
  initialMaps: GameMap[];
  catalogError: string | null;
}) {
  const [strats, setStrats] = useState<Strat[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCoachForm);
  /** Row index that receives pasted images (Ctrl+V). */
  const [pasteTargetRow, setPasteTargetRow] = useState(0);

  const loadStrats = useCallback(async () => {
    setListLoading(true);
    setBanner(null);
    const { data, error } = await listStratsForCoach();
    setListLoading(false);
    if (error) {
      setBanner(error);
      return;
    }
    setStrats(data ?? []);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStrats();
    });
  }, [loadStrats]);

  useEffect(() => {
    queueMicrotask(() => {
      setPasteTargetRow((i) =>
        Math.min(i, Math.max(0, form.images.length - 1)),
      );
    });
  }, [form.images.length]);

  const uploadImageFile = useCallback(async (file: Blob, imageIndex: number) => {
    setBanner(null);
    const name =
      file instanceof File && file.name
        ? file.name
        : `paste-${Date.now()}.png`;
    const fd = new FormData();
    fd.set(
      "file",
      file instanceof File
        ? file
        : new File([file], name, { type: file.type || "image/png" }),
    );
    const res = await uploadStratImageAction(fd);
    if (res.error) {
      setBanner(res.error);
      return;
    }
    if (res.url) {
      setForm((f) => {
        const images = [...f.images];
        images[imageIndex] = { ...images[imageIndex], url: res.url! };
        return { ...f, images };
      });
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      let blob: Blob | null = null;
      const items = dt.items;
      if (items?.length) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it?.kind === "file" && it.type.startsWith("image/")) {
            blob = it.getAsFile();
            break;
          }
        }
      }
      if (!blob && dt.files?.length) {
        const f = dt.files[0];
        if (f?.type.startsWith("image/")) blob = f;
      }
      if (!blob) return;
      e.preventDefault();
      void uploadImageFile(blob, pasteTargetRow);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteTargetRow, uploadImageFile]);

  const startEdit = useCallback((s: Strat) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      map_id: resolveMapIdForStrat(s, initialMaps),
      side: s.side,
      agentSlots: slotsFromStratAgents(s.agents),
      difficulty: String(s.difficulty),
      description: s.description,
      steps: s.steps.map((x) => x.text).join("\n"),
      roles: s.roles.map((r) => `${r.agent} | ${r.desc}`).join("\n"),
      notes: s.notes,
      tags: s.tags.join(", "),
      images:
        s.images.length > 0
          ? s.images.map((i) => ({ url: i.url, label: i.label ?? "" }))
          : [{ url: "", label: "" }],
      stratStages: s.strat_stages.length > 0 ? s.strat_stages : emptyCoachForm().stratStages,
    });
    setBanner(null);
  }, [initialMaps]);

  const selectNewStrat = useCallback(() => {
    setEditingId(null);
    setForm(emptyCoachForm());
    setBanner(null);
  }, []);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  /** Left column (Details / Map tabs): default ~30% width on large screens; drag handle adjusts. */
  const [splitPct, setSplitPct] = useState(30);
  const [coachFormTab, setCoachFormTab] = useState<"details" | "stages">(
    "details",
  );
  const [stagesControlsMountEl, setStagesControlsMountEl] =
    useState<HTMLDivElement | null>(null);
  const [stratMapMountEl, setStratMapMountEl] = useState<HTMLDivElement | null>(
    null,
  );
  const splitDragRef = useRef<{ startX: number; startPct: number } | null>(
    null,
  );

  const onSplitMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      splitDragRef.current = { startX: e.clientX, startPct: splitPct };
      const onMove = (ev: MouseEvent) => {
        const drag = splitDragRef.current;
        const box = splitContainerRef.current?.getBoundingClientRect();
        if (!drag || !box?.width) return;
        const dx = ev.clientX - drag.startX;
        const dPct = (dx / box.width) * 100;
        const next = Math.max(20, Math.min(80, drag.startPct + dPct));
        setSplitPct(next);
      };
      const onUp = () => {
        splitDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [splitPct],
  );

  const initSelectionRef = useRef(false);

  useEffect(() => {
    if (listLoading) return;
    if (initSelectionRef.current) return;
    if (strats.length === 0) {
      initSelectionRef.current = true;
      return;
    }
    initSelectionRef.current = true;
    startEdit(strats[0]!);
  }, [listLoading, strats, startEdit]);

  useEffect(() => {
    if (listLoading) return;
    if (!editingId) return;
    if (strats.some((s) => s.id === editingId)) return;
    if (strats[0]) startEdit(strats[0]);
    else selectNewStrat();
  }, [listLoading, strats, editingId, startEdit, selectNewStrat]);

  function buildPayload(): Omit<Strat, "id" | "created_at"> {
    const agents = form.agentSlots.map((x) => x.trim()).filter(Boolean);
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const steps = form.steps
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
    const roles = parseRoles(form.roles);
    const images = form.images
      .filter((i) => i.url.trim())
      .map((i) => ({
        url: i.url.trim(),
        label: i.label?.trim() || undefined,
      }));

    const mapName =
      initialMaps.find((m) => m.id === form.map_id)?.name ?? "";

    return {
      title: form.title.trim(),
      map: mapName,
      map_id: form.map_id || null,
      side: form.side,
      agents,
      difficulty: Math.min(3, Math.max(1, Number(form.difficulty) || 2)),
      description: form.description.trim(),
      steps,
      roles,
      notes: form.notes.trim(),
      images,
      tags,
      strat_stages: form.stratStages,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    const payload = buildPayload();

    if (editingId) {
      const { error } = await updateStratAction(editingId, payload);
      setSaving(false);
      if (error) setBanner(error);
      else {
        setBanner("Strat updated.");
        void loadStrats();
      }
      return;
    }

    const { error, strat } = await createStratAction(payload);
    setSaving(false);
    if (error) {
      setBanner(error);
      return;
    }
    setBanner("Strat created.");
    if (strat) {
      startEdit(strat);
    }
    void loadStrats();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this strat permanently?")) return;
    const { error } = await deleteStratAction(id);
    if (error) setBanner(error);
    else {
      void loadStrats();
      if (editingId === id) {
        selectNewStrat();
      }
    }
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    imageIndex: number,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadImageFile(file, imageIndex);
  }

  const catalogReady =
    !catalogError && initialAgents.length > 0 && initialMaps.length > 0;

  const selectedStratMap = initialMaps.find((m) => m.id === form.map_id);

  const stratsByMap = useMemo(
    () => groupStratsByMap(strats, initialMaps),
    [strats, initialMaps],
  );

  return (
    <div className="flex w-full min-w-0 flex-col overflow-visible md:min-h-0 md:flex-1 md:overflow-hidden">
      <div className="flex w-full min-w-0 flex-col overflow-visible md:min-h-0 md:flex-1 md:flex-row md:overflow-hidden">
        <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-violet-900/40 bg-slate-950/65 md:max-h-none md:min-h-0 md:w-72 md:shrink-0 md:border-r md:self-stretch">
          <div className="flex gap-2 border-b border-violet-900/35 p-3">
            <button
              type="button"
              onClick={selectNewStrat}
              className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
                editingId === null
                  ? "bg-violet-500 text-white shadow-lg shadow-violet-600/25 ring-2 ring-violet-400/40"
                  : "btn-primary"
              }`}
            >
              <Plus className="h-4 w-4 shrink-0" />
              New strat
            </button>
            <button
              type="button"
              onClick={() => void loadStrats()}
              disabled={listLoading}
              title="Refresh strat list"
              aria-label="Refresh strat list"
              className="btn-secondary inline-flex shrink-0 items-center justify-center p-2.5"
            >
              <RefreshCw
                className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable]">
            {listLoading && strats.length === 0 ? (
              <p className="px-2 py-3 text-sm text-violet-400/60">Loading…</p>
            ) : strats.length === 0 ? (
              <p className="px-2 py-3 text-sm text-violet-400/55">
                No strats yet. Use{" "}
                <span className="text-violet-200">New strat</span> to add one.
              </p>
            ) : (
              <ul className="space-y-4">
                {stratsByMap.map((group) => (
                  <li key={group.key}>
                    <div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-violet-400/70">
                      <Folder className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      <span className="truncate">{group.label}</span>
                    </div>
                    <ul className="space-y-0.5 border-l border-violet-800/30 pl-2">
                      {group.strats.map((s) => {
                        const active = editingId === s.id;
                        return (
                          <li key={s.id} className="group flex items-stretch gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(s)}
                              className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm transition ${
                                active
                                  ? "bg-violet-600/35 text-white ring-1 ring-violet-500/50"
                                  : "text-violet-100/85 hover:bg-violet-950/50"
                              }`}
                            >
                              <span className="line-clamp-2 font-medium">
                                {s.title || "Untitled"}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-violet-400/60">
                                {s.side === "atk" ? "Attack" : "Defense"}
                              </span>
                            </button>
                            <button
                              type="button"
                              title="Delete strat"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(s.id);
                              }}
                              className="shrink-0 rounded-md p-1.5 text-violet-500/50 opacity-80 hover:bg-fuchsia-950/50 hover:text-fuchsia-300 group-hover:opacity-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="flex w-full min-w-0 flex-col overflow-visible md:min-h-0 md:flex-1 md:overflow-hidden">
          <div className="flex w-full max-w-none min-w-0 flex-col gap-6 px-4 pt-4 pb-4 md:min-h-0 md:flex-1 md:overflow-hidden md:px-6 lg:px-8">
      {catalogError && (
        <p
          className="min-w-0 shrink-0 break-words rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-4 py-3 text-sm text-fuchsia-200"
          role="alert"
        >
          {catalogError}{" "}
          <span className="text-fuchsia-300/80">
            Run the SQL in{" "}
            <code className="mt-1 block max-w-full overflow-x-auto rounded bg-black/30 px-1 py-0.5 text-xs break-all">
              supabase/migrations/20260410120000_agents_maps.sql
            </code>{" "}
            in the Supabase SQL editor, then refresh.
          </span>
        </p>
      )}

      {banner && (
        <p
          className="min-w-0 shrink-0 break-words rounded-lg border border-violet-800/40 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
          role="status"
        >
          {banner}
        </p>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-violet-500/20 bg-slate-950/45 p-4 shadow-lg shadow-violet-950/15 backdrop-blur-sm sm:p-6">
        {!catalogReady && !catalogError ? (
          <p className="shrink-0 text-sm text-amber-200/80">
            Add agents and maps in Supabase (see migration). Until the catalog has
            rows, you cannot save strats with the new picker.
          </p>
        ) : null}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-6 ${
            !catalogReady && !catalogError ? "mt-4" : ""
          }`}
        >
          <div
            ref={splitContainerRef}
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-8 lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
            style={
              {
                "--coach-split-pct": `${splitPct}%`,
              } as React.CSSProperties
            }
          >
            <div className="flex min-h-0 w-full min-w-0 flex-col gap-3 overflow-hidden lg:flex-[0_0_var(--coach-split-pct)] lg:min-h-0">
              <div className="flex shrink-0 gap-1 rounded-lg border border-violet-800/45 bg-slate-950/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setCoachFormTab("details")}
                  className={`min-w-0 flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition ${
                    coachFormTab === "details"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                      : "text-violet-300/80 hover:bg-violet-950/50 hover:text-violet-100"
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setCoachFormTab("stages")}
                  className={`min-w-0 flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition ${
                    coachFormTab === "stages"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                      : "text-violet-300/80 hover:bg-violet-950/50 hover:text-violet-100"
                  }`}
                >
                  Map & stages
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable]">
                <div
                  className={
                    coachFormTab === "details" ? "space-y-4" : "hidden"
                  }
                  aria-hidden={coachFormTab !== "details"}
                >
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="input-field mt-1"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="map_id">
                Map
              </label>
              <select
                id="map_id"
                value={form.map_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, map_id: e.target.value }))
                }
                className="input-field mt-1"
                required={catalogReady}
                disabled={!catalogReady}
              >
                <option value="">— Select map —</option>
                {initialMaps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-violet-400/45">
                Configure reference art and outlines under{" "}
                <Link href="/coach/maps" className="text-violet-300 underline">
                  Map shapes
                </Link>
                .
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-y-5 sm:col-span-2 sm:grid-cols-[auto_1fr] sm:gap-y-0">
              <div className="min-w-0 w-max max-w-full justify-self-start px-3 sm:px-0 sm:pl-3 sm:pr-2">
                <div className="label" id="strat-side-label">
                  Side
                </div>
                <div className="mt-1 flex min-h-27 items-center sm:min-h-29">
                  <div className="w-max max-w-full min-w-0 py-1 sm:py-0.5">
                    <StratSideToggle
                      value={form.side}
                      labelledBy="strat-side-label"
                      onChange={(side) => setForm((f) => ({ ...f, side }))}
                    />
                  </div>
                </div>
              </div>
              <div className="min-w-0 w-full px-3 sm:px-0 sm:pl-2 sm:pr-3">
                <div className="label" id="strat-difficulty-label">
                  Difficulty
                </div>
                <div className="mt-1 flex min-h-27 w-full items-stretch sm:min-h-29">
                  <div className="w-full min-w-0">
                    <DifficultyPicker
                      value={form.difficulty}
                      labelledBy="strat-difficulty-label"
                      onChange={(n) =>
                        setForm((f) => ({ ...f, difficulty: String(n) }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="label">Team comp (5 agents)</span>
              <p className="mt-1 text-xs text-violet-400/45">
                Slugs match the catalog — used later for ability-based visuals.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-5">
                {([0, 1, 2, 3, 4] as const).map((i) => (
                  <CoachAgentSlotPicker
                    key={i}
                    slotIndex={i}
                    value={form.agentSlots[i]}
                    agents={initialAgents}
                    disabled={!catalogReady}
                    required={catalogReady}
                    onChange={(slug) => {
                      const next = [...form.agentSlots] as [
                        string,
                        string,
                        string,
                        string,
                        string,
                      ];
                      next[i] = slug;
                      setForm((f) => ({ ...f, agentSlots: next }));
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">
                Summary
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="input-field mt-1 min-h-[88px]"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="steps">
                Round plan (one step per line; HTML allowed e.g.{" "}
                <code>&lt;strong&gt;</code>)
              </label>
              <textarea
                id="steps"
                value={form.steps}
                onChange={(e) =>
                  setForm((f) => ({ ...f, steps: e.target.value }))
                }
                className="input-field mt-1 min-h-[120px] font-mono text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="roles">
                Roles (one per line:{" "}
                <code className="text-xs">Agent | responsibility</code>)
              </label>
              <textarea
                id="roles"
                value={form.roles}
                onChange={(e) =>
                  setForm((f) => ({ ...f, roles: e.target.value }))
                }
                className="input-field mt-1 min-h-[100px]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="notes">
                Coach notes
              </label>
              <textarea
                id="notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                className="input-field mt-1 min-h-[72px]"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="tags">
                Tags (comma-separated)
              </label>
              <input
                id="tags"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
                className="input-field mt-1"
                placeholder="default, pistol, …"
              />
            </div>
              </div>

              <div className="space-y-3">
            <div>
              <span className="label">Images (URL, upload, or paste)</span>
              <p className="mt-1 text-xs text-violet-400/50">
                Click a row to select it, then paste an image (Ctrl+V or
                Cmd+V). Upload still works per row.
              </p>
            </div>
            {form.images.map((img, idx) => (
              <div
                key={idx}
                role="group"
                aria-label={`Image row ${idx + 1}${pasteTargetRow === idx ? ", clipboard target" : ""}`}
                onClick={() => setPasteTargetRow(idx)}
                className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition sm:flex-row sm:items-end ${
                  pasteTargetRow === idx
                    ? "border-violet-500/55 ring-2 ring-violet-500/25"
                    : "border-violet-800/35 hover:border-violet-700/45"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <label
                    className="text-xs text-violet-400/55"
                    htmlFor={`iu-${idx}`}
                  >
                    URL
                  </label>
                  <input
                    id={`iu-${idx}`}
                    value={img.url}
                    onChange={(e) => {
                      const images = [...form.images];
                      images[idx] = { ...images[idx], url: e.target.value };
                      setForm((f) => ({ ...f, images }));
                    }}
                    className="input-field mt-1"
                    placeholder="https://…"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label
                    className="text-xs text-violet-400/55"
                    htmlFor={`il-${idx}`}
                  >
                    Label
                  </label>
                  <input
                    id={`il-${idx}`}
                    value={img.label}
                    onChange={(e) => {
                      const images = [...form.images];
                      images[idx] = { ...images[idx], label: e.target.value };
                      setForm((f) => ({ ...f, images }));
                    }}
                    className="input-field mt-1"
                    placeholder="Post-plant"
                  />
                </div>
                <div className="flex min-w-0 shrink-0 flex-wrap gap-2">
                  <label className="btn-secondary inline-flex min-w-0 cursor-pointer items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUpload(e, idx)}
                    />
                  </label>
                  {form.images.length > 1 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          images: f.images.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2 text-sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  images: [...f.images, { url: "", label: "" }],
                }))
              }
            >
              <Plus className="h-4 w-4" />
              Add image row
            </button>
              </div>
                </div>

                <div
                  className={
                    coachFormTab === "stages"
                      ? "flex min-h-[min(220px,38dvh)] w-full min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1"
                      : "hidden"
                  }
                  aria-hidden={coachFormTab !== "stages"}
                >
                  <div className="min-w-0 shrink-0">
                    <h3 className="text-sm font-semibold text-white">
                      Strat map &amp; stages
                    </h3>
                    <p className="mt-1 text-xs text-violet-400/50">
                      Timeline and pins: place comp agents and Q/E/C/X on the
                      map. Full vector editing lives under{" "}
                      <Link
                        href="/coach/maps"
                        className="text-violet-300 underline"
                      >
                        Map shapes
                      </Link>
                      .
                    </p>
                  </div>
                  <div
                    ref={setStagesControlsMountEl}
                    className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
                  />
                </div>
              </div>
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize columns"
              className="mx-0 hidden h-auto w-2 shrink-0 cursor-col-resize rounded-sm bg-violet-900/50 hover:bg-violet-500/45 active:bg-violet-400/50 lg:mx-1 lg:block"
              onMouseDown={onSplitMouseDown}
            />

            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col lg:overflow-hidden lg:rounded-xl lg:border lg:border-violet-800/35 lg:bg-slate-950/35 lg:p-2">
              {selectedStratMap ? (
                <div
                  ref={setStratMapMountEl}
                  className="flex min-h-[min(44dvh,280px)] min-w-0 flex-1 flex-col lg:min-h-0"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-violet-800/45 bg-slate-950/40 px-4 py-10 text-center">
                  <p className="text-sm text-violet-300/75">
                    Select a <strong className="text-violet-200">map</strong>{" "}
                    under Details to load the layout and place agents.
                  </p>
                </div>
              )}
            </div>
          </div>

          {selectedStratMap &&
            stagesControlsMountEl &&
            stratMapMountEl && (
              <StratStageEditor
                gameMap={selectedStratMap}
                side={form.side}
                compSlugs={form.agentSlots}
                agentsCatalog={initialAgents}
                stages={form.stratStages}
                onStagesChange={(next) =>
                  setForm((f) => ({ ...f, stratStages: next }))
                }
                controlsMountEl={stagesControlsMountEl}
                mapMountEl={stratMapMountEl}
              />
            )}

          <div className="flex min-w-0 shrink-0 flex-wrap gap-3 border-t border-violet-900/35 pt-4">
            <button
              type="submit"
              disabled={saving || !catalogReady}
              className="btn-primary"
            >
              {saving ? (
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              ) : null}
              {editingId ? "Save changes" : "Create strat"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={selectNewStrat}
                className="btn-secondary"
              >
                New draft
              </button>
            )}
          </div>
        </form>
      </section>
          </div>
        </main>
      </div>
    </div>
  );
}
