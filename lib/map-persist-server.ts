import "server-only";

import { revalidatePath } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase-service";
import type { MapUpdatePayload } from "@/types/catalog";

/**
 * Writes coach map editor fields to Supabase. Used by the REST route (primary)
 * and optionally by the server action wrapper.
 */
export async function persistMapUpdate(
  id: string,
  payload: MapUpdatePayload,
): Promise<{ error?: string }> {
  const supabase = createServiceSupabaseClient();
  const row: Record<string, unknown> = {};
  if (payload.name !== undefined) row.name = payload.name;
  if (payload.reference_image_url !== undefined) {
    row.reference_image_url = payload.reference_image_url;
  }
  if (payload.image_transform !== undefined) {
    row.image_transform = payload.image_transform;
  }
  if (payload.view_box !== undefined) row.view_box = payload.view_box;
  if (payload.path_atk !== undefined) row.path_atk = payload.path_atk;
  if (payload.path_def !== undefined) row.path_def = payload.path_def;
  if (payload.extra_paths !== undefined) {
    row.extra_paths = JSON.parse(
      JSON.stringify(payload.extra_paths),
    ) as unknown;
  }
  if (payload.extra_paths_def !== undefined) {
    row.extra_paths_def =
      payload.extra_paths_def === null
        ? null
        : (JSON.parse(
            JSON.stringify(payload.extra_paths_def),
          ) as unknown);
  }
  if (payload.editor_meta !== undefined) {
    row.editor_meta = JSON.parse(
      JSON.stringify(payload.editor_meta),
    ) as unknown;
  }
  if (Object.keys(row).length === 0) {
    return { error: "Nothing to save (empty payload)." };
  }

  const { data: updated, error } = await supabase
    .from("maps")
    .update(row)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const bits = [error.message, error.details, error.hint].filter(Boolean);
    return { error: bits.join(" — ") };
  }
  if (!updated) {
    return {
      error:
        "No row was updated for this map id. If the map loads but save always fails, confirm Vercel env SUPABASE_SERVICE_ROLE_KEY is the service_role JWT (not the anon key) and that migrations adding extra_paths / editor_meta have been applied.",
    };
  }
  revalidatePath("/coach");
  revalidatePath("/coach/maps");
  revalidatePath(`/coach/maps/${id}`);
  revalidatePath("/");
  return {};
}
