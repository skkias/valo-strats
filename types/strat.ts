export type StratSide = "atk" | "def";

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
}

export type StratInsert = Omit<Strat, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
