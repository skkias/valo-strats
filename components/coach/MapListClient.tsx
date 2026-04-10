"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameMap } from "@/types/catalog";
import { createMapAction, deleteMapAction } from "@/app/coach/map-actions";
import { Loader2, Map as MapIcon, Pencil, Plus, Trash2 } from "lucide-react";

export function MapListClient({ maps }: { maps: GameMap[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreating(true);
    const res = await createMapAction({
      name: name.trim(),
      slug: slug.trim() || undefined,
    });
    setCreating(false);
    if (res.error) setErr(res.error);
    else if (res.id) {
      setName("");
      setSlug("");
      router.push(`/coach/maps/${res.id}`);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Delete map “${label}”? Strats referencing it will lose map_id.`))
      return;
    setErr(null);
    const res = await deleteMapAction(id);
    if (res.error) setErr(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-violet-500/20 bg-slate-950/45 p-6">
        <h2 className="text-lg font-semibold text-white">Add a map</h2>
        <p className="mt-1 text-sm text-violet-200/55">
          Slug is optional (derived from the name if empty). Use lowercase letters,
          numbers, and hyphens only.
        </p>
        <form
          onSubmit={(e) => void onCreate(e)}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="map-name">
              Display name
            </label>
            <input
              id="map-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1"
              placeholder="e.g. Ascent"
              required
            />
          </div>
          <div className="min-w-0 sm:w-48">
            <label className="label" htmlFor="map-slug">
              Slug (optional)
            </label>
            <input
              id="map-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="input-field mt-1 font-mono text-sm"
              placeholder="ascent"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create &amp; edit
          </button>
        </form>
        {err && (
          <p className="mt-3 text-sm text-fuchsia-300" role="alert">
            {err}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">Existing maps</h2>
        {maps.length === 0 ? (
          <p className="mt-4 text-violet-300/50">No maps yet. Create one above.</p>
        ) : (
          <ul className="mt-4 divide-y divide-violet-900/50 rounded-xl border border-violet-500/20">
            {maps.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-800/50 bg-violet-950/40">
                    <MapIcon className="h-4 w-4 text-violet-300/70" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100">{m.name}</p>
                    <p className="truncate font-mono text-xs text-violet-400/55">
                      {m.slug}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/coach/maps/${m.id}`}
                    className="btn-secondary inline-flex items-center gap-1 text-sm"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit shape
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onDelete(m.id, m.name)}
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
