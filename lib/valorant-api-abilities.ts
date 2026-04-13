import type { AgentAbilitySlot } from "@/types/agent-ability";
import type { StratPlacedAbility } from "@/types/strat";

/** Valorant API ability slot names → our Q/E/C/X keys. */
export type ValorantApiAbilitySlot =
  | "Ability1"
  | "Ability2"
  | "Grenade"
  | "Ultimate"
  | "Passive";

export interface ValorantAbilityUiMeta {
  slot: StratPlacedAbility["slot"];
  displayName: string;
  description: string;
  displayIcon: string | null;
}

function mapApiSlotToGame(
  slot: string,
): StratPlacedAbility["slot"] | null {
  switch (slot) {
    case "Ability1":
      return "q";
    case "Ability2":
      return "e";
    case "Grenade":
      return "c";
    case "Ultimate":
      return "x";
    default:
      return null;
  }
}

/** Match API roster keys to our `agents.slug` (e.g. KAY/O → kayo). */
export function valorantDisplayNameToSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

let cache: Record<string, ValorantAbilityUiMeta[]> | null = null;
let inflight: Promise<Record<string, ValorantAbilityUiMeta[]>> | null = null;

function abilityCatalogUrl(): string {
  if (typeof window !== "undefined") return "/api/valorant/abilities";
  return "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US";
}

/**
 * Fetches playable agents from Valorant API and maps abilities to Q/E/C/X with
 * display names and descriptions. Cached in-memory for the session.
 */
export async function fetchValorantAbilityUiBySlug(): Promise<
  Record<string, ValorantAbilityUiMeta[]>
> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    let res = await fetch(abilityCatalogUrl(), { cache: "force-cache" });
    if (!res.ok && typeof window !== "undefined") {
      // Fallback to direct upstream if API route is unavailable.
      res = await fetch(
        "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US",
        { cache: "force-cache" },
      );
    }
    if (!res.ok) throw new Error(`Valorant API: ${res.status}`);
    const json: {
      data: Array<{
        isPlayableCharacter?: boolean;
        displayName: string;
        abilities?: Array<{
          slot: string;
          displayName: string;
          description: string;
          displayIcon: string | null;
        }>;
      }>;
    } = await res.json();

    const out: Record<string, ValorantAbilityUiMeta[]> = {};

    for (const agent of json.data ?? []) {
      if (!agent.isPlayableCharacter) continue;
      const slug = valorantDisplayNameToSlug(agent.displayName);
      const list: ValorantAbilityUiMeta[] = [];
      for (const ab of agent.abilities ?? []) {
        const gameSlot = mapApiSlotToGame(ab.slot);
        if (!gameSlot) continue;
        list.push({
          slot: gameSlot,
          displayName: ab.displayName ?? gameSlot.toUpperCase(),
          description: (ab.description ?? "").trim(),
          displayIcon:
            typeof ab.displayIcon === "string" && ab.displayIcon.startsWith("http")
              ? ab.displayIcon
              : null,
        });
      }
      out[slug] = list;
    }

    cache = out;
    return out;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function abilityMetaForSlot(
  bySlug: Record<string, ValorantAbilityUiMeta[]>,
  agentSlug: string,
  slot: AgentAbilitySlot,
): ValorantAbilityUiMeta | undefined {
  return bySlug[agentSlug]?.find((a) => a.slot === slot);
}
