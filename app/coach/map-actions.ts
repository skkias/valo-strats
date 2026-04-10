"use server";

import { revalidatePath } from "next/cache";
import { assertCoachGate } from "@/lib/coach-gate-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { MapImageTransform, MapOverlayShape } from "@/types/catalog";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createMapAction(input: {
  name: string;
  slug?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    await assertCoachGate();
    const name = input.name.trim();
    if (!name) return { error: "Name is required." };
    const slug = slugify(input.slug ?? name);
    if (!slug) return { error: "Invalid slug." };
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("maps")
      .insert({
        name,
        slug,
        sort_order: 999,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/maps");
    return { id: data?.id as string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create map." };
  }
}

export type MapUpdatePayload = {
  name?: string;
  reference_image_url?: string | null;
  image_transform?: MapImageTransform;
  view_box?: string;
  path_atk?: string | null;
  path_def?: string | null;
  extra_paths?: MapOverlayShape[];
};

export async function updateMapAction(
  id: string,
  payload: MapUpdatePayload,
): Promise<{ error?: string }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const row: Record<string, unknown> = {};
    if (payload.name !== undefined) row.name = payload.name;
    if (payload.reference_image_url !== undefined)
      row.reference_image_url = payload.reference_image_url;
    if (payload.image_transform !== undefined)
      row.image_transform = payload.image_transform;
    if (payload.view_box !== undefined) row.view_box = payload.view_box;
    if (payload.path_atk !== undefined) row.path_atk = payload.path_atk;
    if (payload.path_def !== undefined) row.path_def = payload.path_def;
    if (payload.extra_paths !== undefined) row.extra_paths = payload.extra_paths;
    const { error } = await supabase.from("maps").update(row).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/maps");
    revalidatePath(`/coach/maps/${id}`);
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update map." };
  }
}

export async function deleteMapAction(id: string): Promise<{ error?: string }> {
  try {
    await assertCoachGate();
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase.from("maps").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/coach");
    revalidatePath("/coach/maps");
    revalidatePath("/");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete map." };
  }
}

export async function uploadMapReferenceImageAction(
  mapId: string,
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
        : `map-${Date.now()}.bin`;
    const safe = name.replace(/[^\w.-]/g, "_");
    const path = `coach/maps/${mapId}/ref-${Date.now()}-${safe}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const contentType =
      file instanceof File && file.type ? file.type : "application/octet-stream";
    const { error } = await supabase.storage
      .from("strat-images")
      .upload(path, buf, { contentType, upsert: true });
    if (error) return { error: error.message };
    const {
      data: { publicUrl },
    } = supabase.storage.from("strat-images").getPublicUrl(path);
    const up = await updateMapAction(mapId, { reference_image_url: publicUrl });
    if (up.error) return { error: up.error };
    return { url: publicUrl };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}
