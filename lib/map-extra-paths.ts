import type { MapOverlayKind, MapOverlayShape } from "@/types/catalog";
import type { MapPoint } from "@/lib/map-path";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeExtraPaths(raw: unknown): MapOverlayShape[] {
  if (!Array.isArray(raw)) return [];
  const out: MapOverlayShape[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : newId();
    let kind: MapOverlayKind | null = null;
    if (o.kind === "obstacle" || o.kind === "elevation") kind = o.kind;
    if (!kind) continue;
    const pts = Array.isArray(o.points) ? o.points : [];
    const points: MapPoint[] = [];
    for (const pt of pts) {
      if (!pt || typeof pt !== "object") continue;
      const px = (pt as { x?: unknown }).x;
      const py = (pt as { y?: unknown }).y;
      if (typeof px === "number" && typeof py === "number") {
        points.push({ x: px, y: py });
      }
    }
    out.push({ id, kind, points });
  }
  return out;
}
