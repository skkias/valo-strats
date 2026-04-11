import type { Strat } from "@/types/strat";
import { normalizeStratStages } from "@/lib/strat-stages";

/** Ensures newer columns default safely when older rows omit them. */
export function normalizeStratRow(raw: Strat & { map_id?: string | null }): Strat {
  return {
    ...raw,
    map_id: raw.map_id ?? null,
    agents: Array.isArray(raw.agents) ? raw.agents : [],
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    roles: Array.isArray(raw.roles) ? raw.roles : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    strat_stages: normalizeStratStages(
      (raw as Strat & { strat_stages?: unknown }).strat_stages,
    ),
  };
}
