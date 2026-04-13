import type {
  StratPlacedAbility,
  StratPlacedAgent,
  StratStage,
} from "@/types/strat";

/**
 * Picks which agent token an "attach to agent" ability should follow.
 * Prefers the currently selected token when it matches `agentSlug`.
 */
export function resolveStratAttachAgent(
  stage: StratStage,
  agentSlug: string,
  selectedAgentId: string | null,
): StratPlacedAgent | null {
  const match = stage.agents.filter((a) => a.agentSlug === agentSlug);
  if (match.length === 0) return null;
  if (selectedAgentId) {
    const pick = match.find((a) => a.id === selectedAgentId);
    if (pick) return pick;
  }
  return match[0] ?? null;
}

/** Map pin position in strat storage space (attack-side coords). */
export function resolvedPlacedAbilityStoredPosition(
  ab: StratPlacedAbility,
  agents: StratPlacedAgent[],
): { x: number; y: number } {
  if (!ab.attachedToAgentId) return { x: ab.x, y: ab.y };
  const ag = agents.find((a) => a.id === ab.attachedToAgentId);
  if (!ag) return { x: ab.x, y: ab.y };
  return { x: ag.x, y: ag.y };
}
