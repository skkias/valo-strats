import type { Agent } from "@/types/catalog";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import type { StratPlacedAbility } from "@/types/strat";
import { normalizeAgentThemeColor } from "@/lib/agent-theme-color";

/** Saved coach blueprint for an agent slot, if any. */
export function agentBlueprintForSlot(
  agents: Agent[],
  agentSlug: string,
  slot: StratPlacedAbility["slot"],
): AgentAbilityBlueprint | undefined {
  const a = agents.find((x) => x.slug === agentSlug);
  const bp = a?.abilities_blueprint?.find((b) => b.slot === slot);
  if (!bp) return undefined;
  const theme = normalizeAgentThemeColor(a?.theme_color);
  return { ...bp, color: theme };
}
