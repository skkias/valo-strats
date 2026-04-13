import type { MapPoint } from "@/lib/map-path";

/** Keyboard row slots (Valorant-style). */
export type AgentAbilitySlot = "q" | "e" | "c" | "x";

/**
 * High-level shape category for minimap / blueprint drawing (ValoPlant-like).
 * - point: single placement (e.g. utility land)
 * - circle: smoke / orb radius
 * - ray: tripwire, laser, directional shot
 * - cone: vision / flash wedge
 * - polyline: dart path, wall segment chain
 * - polygon: trap floor, molly pool, site control zone
 * - rectangle: aligned box (resizable)
 * - arc: curved utility arc (Sova shock style)
 * - movement: teleport / dash max range (segment A→B in blueprint space)
 */
export type AgentAbilityShapeKind =
  | "point"
  | "circle"
  | "ray"
  | "cone"
  | "vision_cone_narrow"
  | "vision_cone_wide"
  | "polyline"
  | "polygon"
  | "rectangle"
  | "arc"
  | "movement";

export type AbilityTextureId =
  | "solid"
  | "diag_fwd"
  | "diag_back"
  | "crosshatch"
  | "grid"
  | "dots_small"
  | "dots_large"
  | "stripes_h"
  | "stripes_v"
  | "stripes_wide"
  | "zigzag"
  | "chevron"
  | "triangles"
  | "diamonds"
  | "bricks"
  | "weave"
  | "waves"
  | "rings"
  | "radial"
  | "pluses"
  | "confetti"
  | "stairs"
  | "honeycomb"
  | "sparse_cross";

/** How this blueprint is dropped on the strat map. */
export type StratPlacementMode = "center" | "origin_direction";

/** All coordinates are in blueprint canvas space (default viewBox 0 0 1000 1000). */
export type AgentAbilityGeometry =
  | { kind: "point"; x: number; y: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "ray"; x1: number; y1: number; x2: number; y2: number }
  /**
   * Triangular wedge from origin: apex → left boundary → right boundary.
   * Filled triangle matches “flash cone” / trip cone visuals.
   */
  | {
      kind: "cone";
      ox: number;
      oy: number;
      lx: number;
      ly: number;
      rx: number;
      ry: number;
    }
  | { kind: "polyline"; points: MapPoint[] }
  | { kind: "polygon"; points: MapPoint[] }
  | {
      kind: "rectangle";
      x: number;
      y: number;
      w: number;
      h: number;
      rotationDeg?: number;
    }
  | {
      kind: "arc";
      cx: number;
      cy: number;
      r: number;
      startDeg: number;
      sweepDeg: number;
    }
  /**
   * Movement / teleport range: segment from A to B (max displacement vector in blueprint space).
   */
  | { kind: "movement"; ax: number; ay: number; bx: number; by: number };

export interface AgentAbilityBlueprint {
  id: string;
  slot: AgentAbilitySlot;
  /** Short label, e.g. “Trapwire”, “Orb”. */
  name: string;
  shapeKind: AgentAbilityShapeKind;
  /** Stroke/fill accent (CSS color). */
  color: string;
  /** Optional texture/pattern fill used by map + editor previews. */
  textureId?: AbilityTextureId;
  /**
   * When true, texture tile phase is centered on the blueprint origin so radial/rings
   * textures emit from placement origin (e.g. half-rings from an edge anchor).
   */
  textureRadialFromOrigin?: boolean;
  geometry: AgentAbilityGeometry;
  /**
   * Blueprint-space pivot: this point is placed on the strat map; rotation turns around it.
   * Omitted → bbox center of `geometry`.
   */
  origin?: { x: number; y: number };
  /**
   * Strat placement: single click at center, or origin click + direction (second click).
   * Omitted → sensible default by shape (see `effectiveStratPlacementMode`).
   */
  stratPlacementMode?: StratPlacementMode;
  /**
   * Point shapes only: show Valorant API ability icon on the strat map when a URL exists.
   * `false` = always use the colored dot. Default / omitted = show icon when available.
   */
  pointIconShow?: boolean;
  /**
   * Point shapes only: multiplies the on-map icon size in blueprint space (default `1`).
   */
  pointIconScale?: number;
  /**
   * When true, this blueprint’s on-map geometry participates in vision-cone LOS
   * (token cones and blueprint vision wedges).
   */
  blocksVision?: boolean;
  /**
   * For enclosed shapes (circle, polygon, rectangle, arc wedge, cone) when `blocksVision`:
   * - `filled`: interior blocks LOS and invalidates vision origins inside the zone.
   * - `hollow`: only the boundary blocks; interior is see-through (e.g. smoke shell).
   */
  visionObstruction?: "filled" | "hollow";
}
