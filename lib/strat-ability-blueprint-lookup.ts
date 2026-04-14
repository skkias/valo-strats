import type { Agent } from "@/types/catalog";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import type { StratPlacedAbility } from "@/types/strat";
import { normalizeAgentAbilityBlueprint } from "@/lib/agent-abilities-normalize";
import { normalizeAgentThemeColor } from "@/lib/agent-theme-color";

/** Saved coach blueprint for a placed ability (key slot or custom + blueprint id). */
export function agentBlueprintForSlot(
  agents: Agent[],
  agentSlug: string,
  slot: StratPlacedAbility["slot"],
  /** Required when `slot === "custom"`. */
  abilityBlueprintId?: string | null,
): AgentAbilityBlueprint | undefined {
  const a = agents.find((x) => x.slug === agentSlug);
  if (!a?.abilities_blueprint) return undefined;
  const theme = normalizeAgentThemeColor(a?.theme_color);
  let bp: AgentAbilityBlueprint | undefined;
  if (slot === "custom") {
    const id = typeof abilityBlueprintId === "string" ? abilityBlueprintId.trim() : "";
    if (!id) return undefined;
    bp = a.abilities_blueprint.find((b) => b.id === id && b.slot === "custom");
  } else {
    bp = a.abilities_blueprint.find((b) => b.slot === slot);
  }
  if (!bp) return undefined;
  /** Ensures point-mark options (symbol stroke, invert, etc.) match coach normalization everywhere. */
  const normalized = normalizeAgentAbilityBlueprint(bp);
  const merged = normalized ?? bp;
  return { ...merged, color: theme };
}
