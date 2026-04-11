import type { Metadata } from "next";
import Link from "next/link";
import { listAgents } from "@/lib/catalog-queries";
import type { Agent } from "@/types/catalog";
import { ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Agent abilities · Coach",
  description: "Define ability shapes and slots for lineup-style tooling.",
};

export default async function CoachAgentsPage() {
  let agents: Agent[] = [];
  let loadError: string | null = null;
  try {
    agents = await listAgents();
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load agents from Supabase.";
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-violet-500/15 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold text-white drop-shadow-[0_0_20px_rgba(139,92,246,0.2)]">
            Agent abilities
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-violet-200/65">
            Draw blueprint shapes for each ability—smokes, rays, trap zones, dart
            paths, cones, and more—on a normalized canvas (like ValoPlant-style
            schematics). These definitions can drive future strat and lineup UIs.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {loadError ? (
          <p className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-4 py-3 text-sm text-fuchsia-200">
            {loadError}{" "}
            <span className="text-fuchsia-300/70">
              Apply migrations in{" "}
              <code className="rounded bg-black/30 px-1">supabase/migrations/</code>{" "}
              if catalog tables are missing.
            </span>
          </p>
        ) : (
          <ul className="divide-y divide-violet-900/40 rounded-xl border border-violet-500/20">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/coach/agents/${a.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-violet-950/35"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {a.portrait_url?.trim().startsWith("https://") ? (
                      <img
                        src={a.portrait_url.trim()}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border border-violet-800/40 object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-violet-800/50 bg-slate-950/50 text-[10px] text-violet-500/60"
                        title="No portrait URL"
                      >
                        —
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">{a.name}</p>
                      <p className="text-sm text-violet-400/65">{a.role}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-violet-500/50" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
