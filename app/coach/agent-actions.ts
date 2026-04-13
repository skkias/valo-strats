"use server";

import { revalidatePath } from "next/cache";
import { assertCoachGate } from "@/lib/coach-gate-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import { normalizeAgentAbilitiesBlueprint } from "@/lib/agent-abilities-normalize";
import { normalizeAgentThemeColor } from "@/lib/agent-theme-color";

export async function saveAgentAbilitiesBlueprintAction(
  agentId: string,
  blueprint: AgentAbilityBlueprint[],
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    if (!agentId?.trim()) {
      return { error: "Missing agent id." };
    }
    const supabase = createServiceSupabaseClient();
    const { data: agentRow, error: agentErr } = await supabase
      .from("agents")
      .select("theme_color")
      .eq("id", agentId)
      .maybeSingle();
    if (agentErr) return { error: agentErr.message };
    const theme = normalizeAgentThemeColor(agentRow?.theme_color);
    const normalized = normalizeAgentAbilitiesBlueprint(blueprint).map((b) => ({
      ...b,
      color: theme,
    }));
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

export async function saveAgentPortraitUrlAction(
  agentId: string,
  portraitUrl: string | null,
  agentSlug?: string,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    if (!agentId?.trim()) {
      return { error: "Missing agent id." };
    }
    const trimmed = portraitUrl?.trim() ?? "";
    if (trimmed && !/^https:\/\//i.test(trimmed)) {
      return {
        error: "Portrait URL must be empty or start with https://",
      };
    }
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
      .from("agents")
      .update({ portrait_url: trimmed || null })
      .eq("id", agentId);
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/agents");
    if (agentSlug?.trim()) {
      revalidatePath(`/coach/agents/${agentSlug.trim()}`);
    }
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to save portrait URL.",
    };
  }
}

export async function saveAgentThemeColorAction(
  agentId: string,
  themeColor: string,
  agentSlug?: string,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    if (!agentId?.trim()) {
      return { error: "Missing agent id." };
    }
    const normalized = normalizeAgentThemeColor(themeColor);
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
      .from("agents")
      .update({ theme_color: normalized })
      .eq("id", agentId);
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/agents");
    if (agentSlug?.trim()) {
      revalidatePath(`/coach/agents/${agentSlug.trim()}`);
    }
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to save theme color.",
    };
  }
}
