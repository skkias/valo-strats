import type { MapOverlayShape } from "@/types/catalog";

/**
 * Per-stage door state keyed by map overlay `id`.
 * `true` = open / passable (vision passes); `false` = closed / blocks LOS.
 */
export type StratDoorOpenByOverlayId = Record<string, boolean>;

export function normalizeStratDoorOpenByOverlayId(
  raw: unknown,
): StratDoorOpenByOverlayId {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: StratDoorOpenByOverlayId = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof k !== "string" || !k) continue;
    if (v === true) out[k] = true;
    else if (v === false) out[k] = false;
  }
  return out;
}

/** Map default before any strat-stage override. */
export function catalogDefaultDoorOpen(sh: MapOverlayShape): boolean {
  if (sh.kind === "toggle_door") return sh.door_is_open === true;
  return false;
}

/**
 * Resolved open state for vision + map rendering.
 * - Toggle door: stage override, else map catalog `door_is_open`.
 * - Breakable doorway: stage override, else default **closed** (intact wall).
 */
export function effectiveDoorIsOpen(
  sh: MapOverlayShape,
  doorOpenByOverlayId: StratDoorOpenByOverlayId | undefined,
): boolean {
  const id = sh.id;
  if (doorOpenByOverlayId && id in doorOpenByOverlayId) {
    return doorOpenByOverlayId[id] === true;
  }
  if (sh.kind === "toggle_door" || sh.kind === "breakable_doorway") {
    return catalogDefaultDoorOpen(sh);
  }
  return false;
}

/** Apply resolved `door_is_open` for viewer/editor SVG (both door kinds). */
export function overlayWithResolvedDoorState(
  sh: MapOverlayShape,
  doorOpenByOverlayId: StratDoorOpenByOverlayId | undefined,
): MapOverlayShape {
  if (sh.kind !== "toggle_door" && sh.kind !== "breakable_doorway") return sh;
  return {
    ...sh,
    door_is_open: effectiveDoorIsOpen(sh, doorOpenByOverlayId),
  };
}
