import { createServerSupabaseClient } from "@/lib/supabase-server";
import { listAgents, listMaps } from "@/lib/catalog-queries";
import { StratGrid } from "@/components/StratGrid";
import { normalizeStratRow } from "@/lib/strat-normalize";
import type { Agent, GameMap } from "@/types/catalog";
import type { Strat } from "@/types/strat";

export default async function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20">
        <p className="max-w-md text-center text-violet-200/70">
          Add{" "}
          <code className="rounded border border-violet-500/20 bg-slate-950/60 px-1.5 py-0.5 text-sm text-violet-200">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded border border-violet-500/20 bg-slate-950/60 px-1.5 py-0.5 text-sm text-violet-200">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to{" "}
          <code className="rounded border border-violet-500/20 bg-slate-950/60 px-1.5 py-0.5 text-sm text-violet-200">
            .env.local
          </code>{" "}
          and restart the dev server.
        </p>
      </main>
    );
  }

  let strats: Strat[] = [];
  let errorMessage: string | null = null;
  let agentNames: Record<string, string> = {};
  let initialMaps: GameMap[] = [];
  let initialAgents: Agent[] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("strats")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) errorMessage = error.message;
    else
      strats = (data ?? []).map((r) =>
        normalizeStratRow(r as Strat & { map_id?: string | null }),
      );
    try {
      const [agents, maps] = await Promise.all([listAgents(), listMaps()]);
      initialAgents = agents;
      initialMaps = maps;
      agentNames = Object.fromEntries(agents.map((a) => [a.slug, a.name]));
    } catch {
      initialAgents = [];
      initialMaps = [];
      agentNames = {};
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "Failed to connect to Supabase.";
  }

  if (errorMessage) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20">
        <p className="max-w-lg text-center text-fuchsia-400" role="alert">
          {errorMessage}
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-violet-500/15 bg-gradient-to-b from-violet-950/40 via-indigo-950/20 to-transparent px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-[0_0_24px_rgba(139,92,246,0.25)]">
            Team strats
          </h1>
          <p className="mt-2 max-w-2xl text-violet-200/65">
            Round plans, ValoPlant visuals, and role callouts — filter by map and
            side, then open a card for the full breakdown.
          </p>
        </div>
      </div>
      <StratGrid
        initialStrats={strats}
        agentNamesBySlug={agentNames}
        initialMaps={initialMaps}
        initialAgents={initialAgents}
      />
    </main>
  );
}
