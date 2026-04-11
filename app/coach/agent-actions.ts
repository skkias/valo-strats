"use server";

import { revalidatePath } from "next/cache";
import { assertCoachGate } from "@/lib/coach-gate-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import { normalizeAgentAbilitiesBlueprint } from "@/lib/agent-abilities-normalize";

export async function saveAgentAbilitiesBlueprintAction(
  agentId: string,
  blueprint: AgentAbilityBlueprint[],
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    if (!agentId?.trim()) {
      return { error: "Missing agent id." };
    }
    const normalized = normalizeAgentAbilitiesBlueprint(blueprint);
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
      .from("agents")
      .update({ abilities_blueprint: normalized })
      .eq("id", agentId);
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/agents");
    revalidatePath(`/coach/agents`);
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to save abilities.",
    };
  }
}
