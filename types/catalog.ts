import type { MapPoint } from "@/lib/map-path";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";

/** Row from `public.agents`. `slug` keys future ability / UI data. */
export interface Agent {
  id: string;
  slug: string;
  name: string;
  role: string;
  sort_order: number;
  /**
   * Optional HTTPS URL to a square portrait (“face card”) for UI.
   * Set manually under Coach → Agents (not bundled with the app).
   */
  portrait_url?: string | null;
  /** Coach-drawn ability shapes (lineup-style); optional until migration applied. */
  abilities_blueprint?: AgentAbilityBlueprint[];
}

/** Pan/zoom in map editor viewBox coordinates (see `view_box`). */
export interface MapImageTransform {
  scale: number;
  tx: number;
  ty: number;
}

/**
 * Vertical level for overlays on the same 2D minimap (e.g. ground vs raised site).
 * Shapes can overlap in x/y; upper draws above lower.
 */
export type MapFloorId = "lower" | "upper";

export type MapOverlayKind =
  | "obstacle"
  | "elevation"
  | "wall"
  /**
   * Polyline: higher vs lower ground along each segment (left of each p[i]→p[i+1]).
   */
  | "grade"
  /** Open polyline along a breakable doorway / destructible opening. */
  | "breakable_doorway"
  /**
   * Open polyline for a door width; use `door_is_open` for swing vs closed slab.
   */
  | "toggle_door"
  /**
   * Rope / zipline (e.g. Fracture): open polyline; `enter` / `exit` are the endpoints
   * (kept in sync with first/last vertex when saving).
   */
  | "rope"
  /** Open polyline for round-start spawn barriers. */
  | "spawn_barrier"
  /** Closed polygon: bomb plant zone / plantable site outline. */
  | "plant_site";

/** Circle overlay in viewBox space (`r` in user units). */
export type MapOverlayCircle = { cx: number; cy: number; r: number };

/**
 * Polygons (`obstacle` | `elevation` | `wall` | `plant_site`), polylines (`grade` | door kinds),
 * or sampled circles in viewBox space.
 */
export interface MapOverlayShape {
  id: string;
  kind: MapOverlayKind;
  /** Which vertical level this shape belongs to (default lower). */
  floor?: MapFloorId;
  points: MapPoint[];
  /**
   * When set, the overlay is a circle (polygon kinds render as `<circle>`;
   * `grade` uses a closed loop sampled from the circle). Ignored if empty points-only polyline.
   */
  circle?: MapOverlayCircle | null;
  /**
   * For `grade` only: +1 = higher ground to the left of each segment direction,
   * -1 = higher to the right. Ignored for polygon kinds.
   */
  gradeHighSide?: 1 | -1;
  /** For `toggle_door` only: visual open (dashed) vs closed (solid) door along the polyline. */
  door_is_open?: boolean;
  /** For `rope` only: start / grab point (first vertex). */
  enter?: MapPoint;
  /** For `rope` only: end / landing point (last vertex). */
  exit?: MapPoint;
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
  /**
   * Rotation of the text in degrees, SVG-style (positive = clockwise; 0 = horizontal).
   * Use ±90 for text along vertical hallways.
   */
  text_rotation_deg: number;
}

export interface MapEditorMeta {
  show_reference_image: boolean;
  /**
   * Uniform scale of all vector geometry (outlines, overlays, spawns, labels, strat
   * pins) about the viewBox center. Reference image uses `image_transform` only — use
   * this to align traced shapes to bitmap scale. Default 1.
   */
  map_geometry_scale?: number;
  /**
   * When true, the purple outline (`path_atk`) is treated as defense territory and
   * the mirrored cyan shape (`path_def`) as attack for strats and labels.
   */
  side_meaning_inverted?: boolean;
  /**
   * Floor used for new overlays and emphasized in the editor (default lower).
   */
  active_floor?: MapFloorId;
  /**
   * When true, overlays on the non-active floor stay visible but dimmed.
   * When false, only the active floor’s overlays are shown.
   */
  ghost_other_floor?: boolean;
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
