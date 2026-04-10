"use client";

import { useCallback, useEffect, useState } from "react";
import type { Strat, StratImage, StratRole, StratSide } from "@/types/strat";
import {
  Loader2,
  Trash2,
  Pencil,
  Plus,
  Upload,
  Lock,
} from "lucide-react";
import { lockCoach } from "@/app/coach/actions";
import {
  createStratAction,
  deleteStratAction,
  listStratsForCoach,
  updateStratAction,
  uploadStratImageAction,
} from "@/app/coach/strat-actions";

function parseRoles(text: string): StratRole[] {
  return text.split("\n").reduce<StratRole[]>((acc, line) => {
    const t = line.trim();
    if (!t) return acc;
    const pipe = t.indexOf("|");
    if (pipe !== -1) {
      acc.push({
        agent: t.slice(0, pipe).trim(),
        desc: t.slice(pipe + 1).trim(),
      });
      return acc;
    }
    const dash = t.indexOf(" - ");
    if (dash !== -1) {
      acc.push({
        agent: t.slice(0, dash).trim(),
        desc: t.slice(dash + 3).trim(),
      });
      return acc;
    }
    acc.push({ agent: t, desc: "" });
    return acc;
  }, []);
}

function emptyForm() {
  return {
    title: "",
    map: "",
    side: "atk" as StratSide,
    agents: "",
    difficulty: "2",
    description: "",
    steps: "",
    roles: "",
    notes: "",
    tags: "",
    images: [{ url: "", label: "" }] as StratImage[],
  };
}

export function CoachDashboard() {
  const [strats, setStrats] = useState<Strat[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  function startEdit(s: Strat) {
    setEditingId(s.id);
    setForm({
      title: s.title,
      map: s.map,
      side: s.side,
      agents: s.agents.join(", "),
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
    });
    setBanner(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function buildPayload(): Omit<Strat, "id" | "created_at"> {
    const agents = form.agents
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
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

    return {
      title: form.title.trim(),
      map: form.map.trim(),
      side: form.side,
      agents,
      difficulty: Math.min(3, Math.max(1, Number(form.difficulty) || 2)),
      description: form.description.trim(),
      steps,
      roles,
      notes: form.notes.trim(),
      images,
      tags,
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
        cancelEdit();
        void loadStrats();
      }
      return;
    }

    const { error } = await createStratAction(payload);
    setSaving(false);
    if (error) setBanner(error);
    else {
      setBanner("Strat created.");
      setForm(emptyForm());
      void loadStrats();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this strat permanently?")) return;
    const { error } = await deleteStratAction(id);
    if (error) setBanner(error);
    else {
      void loadStrats();
      if (editingId === id) cancelEdit();
    }
  }

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    imageIndex: number,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBanner(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadStratImageAction(fd);
    if (res.error) {
      setBanner(res.error);
      e.target.value = "";
      return;
    }
    if (res.url) {
      setForm((f) => {
        const images = [...f.images];
        images[imageIndex] = { ...images[imageIndex], url: res.url! };
        return { ...f, images };
      });
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-violet-200/65">
          Signed in with the <span className="text-slate-100">coach password</span>
          . Strats update the public browse page after each save.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadStrats()}
            disabled={listLoading}
            className="btn-secondary inline-flex items-center gap-2"
          >
            {listLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Refresh list
          </button>
          <form action={lockCoach}>
            <button
              type="submit"
              className="btn-secondary inline-flex items-center gap-2"
            >
              <Lock className="h-4 w-4" />
              Lock coach
            </button>
          </form>
        </div>
      </div>

      {banner && (
        <p
          className="rounded-lg border border-violet-800/40 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
          role="status"
        >
          {banner}
        </p>
      )}

      <section className="rounded-xl border border-violet-500/20 bg-slate-950/45 p-6 shadow-lg shadow-violet-950/15 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">
          {editingId ? "Edit strat" : "New strat"}
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className="label" htmlFor="map">
                Map
              </label>
              <input
                id="map"
                value={form.map}
                onChange={(e) => setForm((f) => ({ ...f, map: e.target.value }))}
                className="input-field mt-1"
                placeholder="Ascent"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="side">
                Side
              </label>
              <select
                id="side"
                value={form.side}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    side: e.target.value as StratSide,
                  }))
                }
                className="input-field mt-1"
              >
                <option value="atk">Attack</option>
                <option value="def">Defense</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="difficulty">
                Difficulty (1–3)
              </label>
              <input
                id="difficulty"
                type="number"
                min={1}
                max={3}
                value={form.difficulty}
                onChange={(e) =>
                  setForm((f) => ({ ...f, difficulty: e.target.value }))
                }
                className="input-field mt-1"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="agents">
                Agents (comma-separated)
              </label>
              <input
                id="agents"
                value={form.agents}
                onChange={(e) =>
                  setForm((f) => ({ ...f, agents: e.target.value }))
                }
                className="input-field mt-1"
                placeholder="Jett, Sova, …"
              />
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
            <span className="label">Images (ValoPlant URLs or upload)</span>
            {form.images.map((img, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-lg border border-violet-800/35 p-3 sm:flex-row sm:items-end"
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
                <div className="flex gap-2">
                  <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
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

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? (
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              ) : null}
              {editingId ? "Save changes" : "Create strat"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="btn-secondary"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">Your strats</h2>
        {listLoading && strats.length === 0 ? (
          <p className="mt-4 text-violet-300/50">Loading…</p>
        ) : strats.length === 0 ? (
          <p className="mt-4 text-violet-300/50">No strats yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-violet-900/50 rounded-xl border border-violet-500/20">
            {strats.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-100">{s.title}</p>
                  <p className="text-sm text-violet-300/55">
                    {s.map} · {s.side === "atk" ? "Attack" : "Defense"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="btn-secondary inline-flex items-center gap-1 text-sm"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(s.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-fuchsia-800/50 bg-fuchsia-950/45 px-3 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-950/65"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
