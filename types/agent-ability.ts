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
 */
export type AgentAbilityShapeKind =
  | "point"
  | "circle"
  | "ray"
  | "cone"
  | "polyline"
  | "polygon"
  | "rectangle"
  | "arc";

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
    };

export interface AgentAbilityBlueprint {
  id: string;
  slot: AgentAbilitySlot;
  /** Short label, e.g. “Trapwire”, “Orb”. */
  name: string;
  shapeKind: AgentAbilityShapeKind;
  /** Stroke/fill accent (CSS color). */
  color: string;
  geometry: AgentAbilityGeometry;
}
