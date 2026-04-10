import type {
  MapEditorMeta,
  MapLabelTextAnchor,
  MapLocationLabel,
  MapLocationLabelStyle,
  MapSpawnMarker,
} from "@/types/catalog";

const DEFAULT_LABEL_STYLE: MapLocationLabelStyle = "pin";
const DEFAULT_LABEL_COLOR = "#e9d5ff";
const DEFAULT_LABEL_SIZE = 1;
const DEFAULT_LABEL_TEXT_ANCHOR: MapLabelTextAnchor = "right";

function clampLabelSize(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LABEL_SIZE;
  return Math.min(3, Math.max(0.35, n));
}

function normalizeLabelColor(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return DEFAULT_LABEL_COLOR;
}

function normalizeLabelStyle(raw: unknown): MapLocationLabelStyle {
  return raw === "text" ? "text" : "pin";
}

function normalizeLabelTextAnchor(raw: unknown): MapLabelTextAnchor {
  if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right") {
    return raw;
  }
  return DEFAULT_LABEL_TEXT_ANCHOR;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ann-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultEditorMeta(): MapEditorMeta {
  return {
    show_reference_image: true,
    spawn_markers: [],
    location_labels: [],
  };
}

export function normalizeEditorMeta(raw: unknown): MapEditorMeta {
  const d = defaultEditorMeta();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.show_reference_image === "boolean") {
    d.show_reference_image = o.show_reference_image;
  }
  const spawns: MapSpawnMarker[] = [];
  if (Array.isArray(o.spawn_markers)) {
    for (const x of o.spawn_markers) {
      if (!x || typeof x !== "object") continue;
      const m = x as Record<string, unknown>;
      let id = typeof m.id === "string" && m.id ? m.id : newId();
      const sx = m.x;
      const sy = m.y;
      const side = m.side === "def" ? "def" : "atk";
      if (typeof sx === "number" && typeof sy === "number") {
        spawns.push({ id, side, x: sx, y: sy });
      }
    }
  }
  d.spawn_markers = spawns;
  const labels: MapLocationLabel[] = [];
  if (Array.isArray(o.location_labels)) {
    for (const x of o.location_labels) {
      if (!x || typeof x !== "object") continue;
      const m = x as Record<string, unknown>;
      let id = typeof m.id === "string" && m.id ? m.id : newId();
      const text =
        typeof m.text === "string" && m.text.trim() ? m.text.trim() : "Label";
      const lx = m.x;
      const ly = m.y;
      if (typeof lx === "number" && typeof ly === "number") {
        labels.push({
          id,
          x: lx,
          y: ly,
          text,
          style: normalizeLabelStyle(m.style),
          color: normalizeLabelColor(m.color),
          size: clampLabelSize(m.size),
          text_anchor: normalizeLabelTextAnchor(m.text_anchor),
        });
      }
    }
  }
  d.location_labels = labels;
  return d;
}
