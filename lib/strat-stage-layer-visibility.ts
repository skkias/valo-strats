import type { StratStageLayerVisibility } from "@/types/strat";

export const DEFAULT_STRAT_STAGE_LAYER_VISIBILITY: StratStageLayerVisibility = {
  territoryOutline: true,
  labels: false,
  spawnAtk: true,
  spawnDef: true,
  floorLower: true,
  floorUpper: true,
  obstacle: false,
  elevation: false,
  wall: true,
  plant_site: true,
  grade: true,
  breakable_doorway: true,
  toggle_door: true,
  rope: true,
  spawn_barrier: true,
};

export function normalizeStratStageLayerVisibility(
  raw: unknown,
): StratStageLayerVisibility {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_STRAT_STAGE_LAYER_VISIBILITY };
  }
  const o = raw as Record<string, unknown>;
  const d = DEFAULT_STRAT_STAGE_LAYER_VISIBILITY;
  return {
    territoryOutline:
      typeof o.territoryOutline === "boolean" ? o.territoryOutline : d.territoryOutline,
    labels: typeof o.labels === "boolean" ? o.labels : d.labels,
    spawnAtk: typeof o.spawnAtk === "boolean" ? o.spawnAtk : d.spawnAtk,
    spawnDef: typeof o.spawnDef === "boolean" ? o.spawnDef : d.spawnDef,
    floorLower: typeof o.floorLower === "boolean" ? o.floorLower : d.floorLower,
    floorUpper: typeof o.floorUpper === "boolean" ? o.floorUpper : d.floorUpper,
    obstacle: typeof o.obstacle === "boolean" ? o.obstacle : d.obstacle,
    elevation: typeof o.elevation === "boolean" ? o.elevation : d.elevation,
    wall: typeof o.wall === "boolean" ? o.wall : d.wall,
    plant_site: typeof o.plant_site === "boolean" ? o.plant_site : d.plant_site,
    grade: typeof o.grade === "boolean" ? o.grade : d.grade,
    breakable_doorway:
      typeof o.breakable_doorway === "boolean"
        ? o.breakable_doorway
        : d.breakable_doorway,
    toggle_door:
      typeof o.toggle_door === "boolean" ? o.toggle_door : d.toggle_door,
    rope: typeof o.rope === "boolean" ? o.rope : d.rope,
    spawn_barrier:
      typeof o.spawn_barrier === "boolean" ? o.spawn_barrier : d.spawn_barrier,
  };
}
