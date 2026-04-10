import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Agent, GameMap } from "@/types/catalog";
import { normalizeMapTransform } from "@/lib/map-transform";
import { normalizeExtraPaths } from "@/lib/map-extra-paths";

export async function listAgents(): Promise<Agent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, slug, name, role, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Agent[];
}

export async function listMaps(): Promise<GameMap[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("maps")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(row as GameMap),
      image_transform: normalizeMapTransform(r.image_transform),
      extra_paths: normalizeExtraPaths(r.extra_paths),
    };
  });
}

export async function getMapById(id: string): Promise<GameMap | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("maps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...(data as GameMap),
    image_transform: normalizeMapTransform(r.image_transform),
    extra_paths: normalizeExtraPaths(r.extra_paths),
  };
}
