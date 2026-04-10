import type { MapPoint } from "@/lib/map-path";

/** Row from `public.agents`. `slug` keys future ability / UI data. */
export interface Agent {
  id: string;
  slug: string;
  name: string;
  role: string;
  sort_order: number;
}

/** Pan/zoom in map editor viewBox coordinates (see `view_box`). */
export interface MapImageTransform {
  scale: number;
  tx: number;
  ty: number;
}

export type MapOverlayKind =
  | "obstacle"
  | "elevation"
  | "wall"
  /**
   * Polyline: higher vs lower ground along each segment (left of each p[i]→p[i+1]).
   */
  | "grade";

/** Polygons (`obstacle` | `elevation` | `wall`) or a grade polyline in viewBox space. */
export interface MapOverlayShape {
  id: string;
  kind: MapOverlayKind;
  points: MapPoint[];
  /**
   * For `grade` only: +1 = higher ground to the left of each segment direction,
   * -1 = higher to the right. Ignored for polygon kinds.
   */
  gradeHighSide?: 1 | -1;
}

/** Row from `public.maps` — reference art + vector outlines per side. */
export interface GameMap {
  id: string;
  created_at: string;
  slug: string;
  name: string;
  reference_image_url: string | null;
  image_transform: MapImageTransform;
  view_box: string;
  /**
   * Canonical attack-side outline as SVG path: outer ring plus optional holes
   * (`M…Z` per ring, `fill-rule: evenodd` when rendering). Defense mirrors attack.
   */
  path_atk: string | null;
  /** Auto-derived mirror of `path_atk`; kept for consumers / SQL. */
  path_def: string | null;
  /** Obstacles, elevation, walls, and grade lines (JSON in DB). */
  extra_paths: MapOverlayShape[];
  sort_order: number;
}
