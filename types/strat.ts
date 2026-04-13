export type StratSide = "atk" | "def";

/** How the map panel animates when advancing from this stage to the next. */
export type StratStageTransition = "none" | "fade" | "slide-left" | "slide-right";

export interface StratPlacedAgent {
  id: string;
  agentSlug: string;
  x: number;
  y: number;
}

export interface StratPlacedAbility {
  id: string;
  agentSlug: string;
  /** Valorant-style ability slots (keyboard row). */
  slot: "q" | "e" | "c" | "x";
  x: number;
  y: number;
  /**
   * Rotation in degrees: blueprint +X axis aligns with this heading on the map (origin placement).
   * Omitted → 0.
   */
  rotationDeg?: number;
}

export interface StratStage {
  id: string;
  title: string;
  notes: string;
  agents: StratPlacedAgent[];
  abilities: StratPlacedAbility[];
  /** Saved map layer filters for this stage (viewer + coach). */
  mapLayerVisibility?: StratStageLayerVisibility;
  /** Used when leaving this stage for the next (ignored on the last stage). */
  transition: StratStageTransition;
  transitionMs: number;
}

export interface StratStageLayerVisibility {
  territoryOutline: boolean;
  labels: boolean;
  spawnAtk: boolean;
  spawnDef: boolean;
  floorLower: boolean;
  floorUpper: boolean;
  obstacle: boolean;
  elevation: boolean;
  wall: boolean;
  plant_site: boolean;
  grade: boolean;
  breakable_doorway: boolean;
  toggle_door: boolean;
  rope: boolean;
  spawn_barrier: boolean;
}

export interface StratImage {
  url: string;
  label?: string;
}

export interface StratStep {
  text: string;
}

export interface StratRole {
  agent: string;
  desc: string;
}

/** Row shape from `public.strats` (matches Supabase schema). */
export interface Strat {
  id: string;
  created_at: string;
  title: string;
  /** Denormalized display name; keep in sync with `maps.name` when `map_id` is set. */
  map: string;
  /** FK to `public.maps` for layout / vector data; optional for legacy rows. */
  map_id: string | null;
  side: StratSide;
  agents: string[];
  difficulty: number;
  description: string;
  steps: StratStep[];
  roles: StratRole[];
  notes: string;
  images: StratImage[];
  tags: string[];
  /**
   * Timed beats on the map: agent positions and ability callouts per stage.
   * Stored as JSON in `strats.strat_stages`.
   */
  strat_stages: StratStage[];
}

export type StratInsert = Omit<Strat, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
