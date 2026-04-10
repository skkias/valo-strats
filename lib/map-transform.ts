import type { MapImageTransform } from "@/types/catalog";

const DEFAULT_TRANSFORM: MapImageTransform = { scale: 1, tx: 0, ty: 0 };

export function normalizeMapTransform(
  raw: unknown,
): MapImageTransform {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TRANSFORM };
  const o = raw as Record<string, unknown>;
  const scale = typeof o.scale === "number" && Number.isFinite(o.scale) ? o.scale : 1;
  const tx = typeof o.tx === "number" && Number.isFinite(o.tx) ? o.tx : 0;
  const ty = typeof o.ty === "number" && Number.isFinite(o.ty) ? o.ty : 0;
  return { scale, tx, ty };
}

export function defaultMapTransform(): MapImageTransform {
  return { ...DEFAULT_TRANSFORM };
}
