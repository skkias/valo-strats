import type { Metadata } from "next";
import { CoachDashboard } from "@/components/CoachDashboard";
import { listAgents, listMaps } from "@/lib/catalog-queries";
import type { Agent, GameMap } from "@/types/catalog";

export const metadata: Metadata = {
  title: "Coach · Valo Strats",
  description: "Create and edit team strategies.",
};

export default async function CoachPage() {
  let agents: Agent[] = [];
  let maps: GameMap[] = [];
  let catalogError: string | null = null;
  try {
    agents = await listAgents();
    maps = await listMaps();
  } catch (e) {
    catalogError =
      e instanceof Error ? e.message : "Could not load agents or maps from Supabase.";
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-violet-500/15 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold text-white drop-shadow-[0_0_20px_rgba(139,92,246,0.2)]">
            Coach dashboard
          </h1>
          <p className="mt-2 text-sm text-violet-200/65">
            Unlock with the coach password to add strats, upload images, and manage
            your library. Browse stays read-only for everyone.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <CoachDashboard
          initialAgents={agents}
          initialMaps={maps}
          catalogError={catalogError}
        />
      </div>
    </main>
  );
}
