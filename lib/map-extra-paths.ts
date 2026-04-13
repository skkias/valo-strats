import type {
  MapFloorId,
  MapOverlayCircle,
  MapOverlayKind,
  MapOverlayShape,
} from "@/types/catalog";
import type { MapPoint } from "@/lib/map-path";
import { circleToGradeClosedPoints } from "@/lib/map-overlay-geometry";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseMapPoint(raw: unknown): MapPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = asFiniteNumber(r.x);
  const y = asFiniteNumber(r.y);
  if (x === null || y === null) return null;
  return { x, y };
}

function parseFloor(raw: unknown): MapFloorId {
  return raw === "upper" ? "upper" : "lower";
}

function parseKind(raw: unknown): MapOverlayKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase();
  if (
    k === "obstacle" ||
    k === "elevation" ||
    k === "wall" ||
    k === "grade" ||
    k === "breakable_doorway" ||
    k === "toggle_door" ||
    k === "rope" ||
    k === "spawn_barrier" ||
    k === "plant_site"
  ) {
    return k;
  }
  return null;
}

/** Accepts jsonb array or a double-encoded JSON string (some clients store that). */
export function normalizeExtraPaths(raw: unknown): MapOverlayShape[] {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const out: MapOverlayShape[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : newId();
    const kind = parseKind(o.kind);
    if (!kind) continue;
    const floor = parseFloor(o.floor);
    const pts = Array.isArray(o.points) ? o.points : [];
    const points: MapPoint[] = [];
    for (const pt of pts) {
      if (!pt || typeof pt !== "object") continue;
      const px = asFiniteNumber((pt as { x?: unknown }).x);
      const py = asFiniteNumber((pt as { y?: unknown }).y);
      if (px !== null && py !== null) {
        points.push({ x: px, y: py });
      }
    }
    let overlayPoints: MapPoint[] = points;
    let ropeEnter: MapPoint | undefined;
    let ropeExit: MapPoint | undefined;
    if (kind === "rope") {
      const eIn = parseMapPoint(o.enter);
      const eOut = parseMapPoint(o.exit);
      if (points.length >= 2) {
        ropeEnter = points[0];
        ropeExit = points[points.length - 1];
      } else if (eIn && eOut) {
        overlayPoints = [eIn, eOut];
        ropeEnter = eIn;
        ropeExit = eOut;
      }
    }
    let gradeHighSide: 1 | -1 | undefined;
    if (kind === "grade") {
      const g = o.gradeHighSide;
      gradeHighSide = g === -1 ? -1 : 1;
    }
    let door_is_open: boolean | undefined;
    if (kind === "toggle_door") {
      door_is_open = o.door_is_open === true;
    }
    let circle: MapOverlayCircle | null = null;
    const cr = o.circle;
    if (cr && typeof cr === "object") {
      const crec = cr as Record<string, unknown>;
      const cx = asFiniteNumber(crec.cx);
      const cy = asFiniteNumber(crec.cy);
      const rad = asFiniteNumber(crec.r);
      if (
        cx !== null &&
        cy !== null &&
        rad !== null &&
        rad > 0
      ) {
        circle = { cx, cy, r: rad };
      }
    }
    if (circle) {
      if (kind === "grade") {
        out.push({
          id,
          kind,
          floor,
          points: circleToGradeClosedPoints(circle),
          circle,
          gradeHighSide,
        });
      } else {
        out.push({
          id,
          kind,
          floor,
          points: [],
          circle,
          gradeHighSide,
          ...(door_is_open !== undefined ? { door_is_open } : {}),
        });
      }
    } else {
      out.push({
        id,
        kind,
        floor,
        points: overlayPoints,
        gradeHighSide,
        ...(door_is_open !== undefined ? { door_is_open } : {}),
        ...(kind === "rope" && ropeEnter && ropeExit
          ? { enter: ropeEnter, exit: ropeExit }
          : {}),
      });
    }
  }
  return out;
}

/** Polyline vertices for rope / zipline overlays (prefers stored `points`, else `enter`→`exit`). */
export function ropePolylinePoints(sh: MapOverlayShape): MapPoint[] {
  if (sh.kind !== "rope") return sh.points;
  if (sh.points.length >= 2) return sh.points;
  if (sh.enter && sh.exit) return [sh.enter, sh.exit];
  return sh.points;
}
