"use server";

import { revalidatePath } from "next/cache";
import { assertCoachGate } from "@/lib/coach-gate-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { Strat } from "@/types/strat";
import { normalizeStratRow } from "@/lib/strat-normalize";
import { normalizeStratStages } from "@/lib/strat-stages";

export async function listStratsForCoach(): Promise<{
  data: Strat[] | null;
  error: string | null;
}> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("strats")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return { data: null, error: error.message };
    const rows = (data ?? []).map((r) =>
      normalizeStratRow(r as Strat & { map_id?: string | null }),
    );
    return { data: rows, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to load strats",
    };
  }
}

type StratPayload = Omit<Strat, "id" | "created_at">;

async function prepareStratRow(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  payload: StratPayload,
): Promise<{ row: StratPayload; error: string | null }> {
  const agents = payload.agents ?? [];
  if (agents.length !== 5) {
    return { row: payload, error: "Select exactly five agents." };
  }
  if (new Set(agents).size !== 5) {
    return { row: payload, error: "Agents must all be different." };
  }
  const { data: agentRows, error: agentErr } = await supabase
    .from("agents")
    .select("slug")
    .in("slug", agents);
  if (agentErr) return { row: payload, error: agentErr.message };
  if (!agentRows || agentRows.length !== 5) {
    return { row: payload, error: "One or more agent slugs are invalid." };
  }

  const mapId = payload.map_id;
  if (!mapId) {
    return { row: payload, error: "Choose a map from the list." };
  }
  const { data: mapRow, error: mapErr } = await supabase
    .from("maps")
    .select("name")
    .eq("id", mapId)
    .maybeSingle();
  if (mapErr) return { row: payload, error: mapErr.message };
  if (!mapRow?.name) {
    return { row: payload, error: "Selected map was not found." };
  }

  const row: StratPayload = {
    ...payload,
    map: mapRow.name,
    map_id: mapId,
    agents,
    strat_stages: normalizeStratStages(payload.strat_stages),
  };
  return { row, error: null };
}

export async function createStratAction(
  payload: StratPayload,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { row, error } = await prepareStratRow(supabase, payload);
    if (error) return { error };
    const { error: ins } = await supabase.from("strats").insert(row);
    if (ins) return { error: ins.message };
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create strat",
    };
  }
}

export async function updateStratAction(
  id: string,
  payload: StratPayload,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { row, error } = await prepareStratRow(supabase, payload);
    if (error) return { error };
    const { error: up } = await supabase.from("strats").update(row).eq("id", id);
    if (up) return { error: up.message };
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update strat",
    };
  }
}

export async function deleteStratAction(
  id: string,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("strats").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/");
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to delete strat",
    };
  }
}

export async function uploadStratImageAction(
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  try {
    await assertCoachGate();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return { error: "No file uploaded." };
    }
    const supabase = createServiceSupabaseClient();
    const name =
      file instanceof File && file.name
        ? file.name
        : `upload-${Date.now()}.bin`;
    const path = `coach/${Date.now()}-${name.replace(/[^\w.-]/g, "_")}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const contentType =
      file instanceof File && file.type ? file.type : "application/octet-stream";
    const { error } = await supabase.storage
      .from("strat-images")
      .upload(path, buf, { contentType, upsert: false });
    if (error) return { error: error.message };
    const {
      data: { publicUrl },
    } = supabase.storage.from("strat-images").getPublicUrl(path);
    return { url: publicUrl };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}
