import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Agent, GameMap } from "@/types/catalog";
import { normalizeAgentAbilitiesBlueprint } from "@/lib/agent-abilities-normalize";
import { normalizeMapTransform } from "@/lib/map-transform";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import { normalizeExtraPaths } from "@/lib/map-extra-paths";
import { normalizeAgentThemeColor } from "@/lib/agent-theme-color";

export async function listAgents(): Promise<Agent[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, slug, name, role, sort_order, portrait_url, theme_color, abilities_blueprint")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const rawBp = r.abilities_blueprint ?? r.abilitiesBlueprint;
    return {
      ...(row as Agent),
      theme_color: normalizeAgentThemeColor(r.theme_color),
      abilities_blueprint: normalizeAgentAbilitiesBlueprint(rawBp),
    };
  });
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
    const extraRaw = r.extra_paths ?? r.extraPaths;
    const extraDefRaw = r.extra_paths_def ?? r.extraPathsDef;
    return {
      ...(row as GameMap),
      image_transform: normalizeMapTransform(r.image_transform),
      extra_paths: normalizeExtraPaths(extraRaw),
      extra_paths_def:
        extraDefRaw === null || extraDefRaw === undefined
          ? null
          : normalizeExtraPaths(extraDefRaw),
      editor_meta: normalizeEditorMeta(r.editor_meta),
    };
  });
}

export async function getAgentBySlug(slug: string): Promise<Agent | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const rawBp = r.abilities_blueprint ?? r.abilitiesBlueprint;
  return {
    ...(data as Agent),
    theme_color: normalizeAgentThemeColor(r.theme_color),
    abilities_blueprint: normalizeAgentAbilitiesBlueprint(rawBp),
  };
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
  const extraRaw = r.extra_paths ?? r.extraPaths;
  const extraDefRaw = r.extra_paths_def ?? r.extraPathsDef;
  return {
    ...(data as GameMap),
    image_transform: normalizeMapTransform(r.image_transform),
    extra_paths: normalizeExtraPaths(extraRaw),
    extra_paths_def:
      extraDefRaw === null || extraDefRaw === undefined
        ? null
        : normalizeExtraPaths(extraDefRaw),
    editor_meta: normalizeEditorMeta(r.editor_meta),
  };
}
