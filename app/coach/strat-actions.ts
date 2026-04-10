"use server";

import { revalidatePath } from "next/cache";
import { assertCoachGate } from "@/lib/coach-gate-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { Strat } from "@/types/strat";

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
    return { data: (data ?? []) as Strat[], error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to load strats",
    };
  }
}

type StratPayload = Omit<Strat, "id" | "created_at">;

export async function createStratAction(
  payload: StratPayload,
): Promise<{ error: string | null }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("strats").insert(payload);
    if (error) return { error: error.message };
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
    const { error } = await supabase.from("strats").update(payload).eq("id", id);
    if (error) return { error: error.message };
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
