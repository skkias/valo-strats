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
  map: string;
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
