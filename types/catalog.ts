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
  /**
   * Reference image toggle, spawn pins, and text labels (attack-side viewBox coords).
   */
  editor_meta: MapEditorMeta;
  sort_order: number;
}

/** Spawn pins and callouts saved with the map (editor + future viewers). */
export interface MapSpawnMarker {
  id: string;
  side: "atk" | "def";
  x: number;
  y: number;
}

/** `pin` = anchor dot + text; `text` = text only (position is text anchor). */
export type MapLocationLabelStyle = "pin" | "text";

/** Where label text sits relative to the anchor point (attack-side coords). */
export type MapLabelTextAnchor = "top" | "bottom" | "left" | "right";

export interface MapLocationLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  style: MapLocationLabelStyle;
  /** Text and pin accent (CSS color string, e.g. hex). */
  color: string;
  /** Size multiplier relative to the map’s default label scale (≈0.35–3). */
  size: number;
  /** Placement of text relative to the point (default matches legacy: to the right). */
  text_anchor: MapLabelTextAnchor;
}

export interface MapEditorMeta {
  show_reference_image: boolean;
  spawn_markers: MapSpawnMarker[];
  location_labels: MapLocationLabel[];
}

/** Coach map editor → `public.maps` update (partial row). */
export type MapUpdatePayload = {
  name?: string;
  reference_image_url?: string | null;
  image_transform?: MapImageTransform;
  view_box?: string;
  path_atk?: string | null;
  path_def?: string | null;
  extra_paths?: MapOverlayShape[];
  editor_meta?: MapEditorMeta;
};
