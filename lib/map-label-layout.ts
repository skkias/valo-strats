import type {
  MapLabelTextAnchor,
  MapLocationLabel,
} from "@/types/catalog";
import type { ViewBoxRect } from "@/lib/map-path";

/** Normalize degrees to (-180, 180], same convention as stored `text_rotation_deg`. */
export function normalizeLabelRotationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Rotation after point reflection through the viewBox center (same as Swap sides).
 * Adds 180° to world orientation; near-upside-down values collapse to 0° for readability.
 */
export function labelRotationAfterViewBoxCenterPointFlip(deg: number): number {
  let r = normalizeLabelRotationDeg(
    normalizeLabelRotationDeg(deg) + 180,
  );
  if (Math.abs(r) >= 179) r = 0;
  return r;
}

/**
 * @deprecated Prefer {@link transformLocationLabelForViewBoxCenterFlip} — negation
 * did not preserve the text origin for rotated labels. Kept for any legacy callers.
 */
export function labelRotationAfterCenterFlip(deg: number): number {
  let r = normalizeLabelRotationDeg(-normalizeLabelRotationDeg(deg));
  if (Math.abs(r) >= 179) r = 0;
  return r;
}

const ANCHOR_CANDIDATES: MapLabelTextAnchor[] = [
  "left",
  "right",
  "top",
  "bottom",
];

function inferTextAnchorFromFlippedGeometry(
  ax: number,
  ay: number,
  tpX: number,
  tpY: number,
  args: {
    pinR: number;
    fs: number;
    isPin: boolean;
    textOnlyGap: number;
  },
): MapLabelTextAnchor {
  let best: MapLabelTextAnchor = "right";
  let bestErr = Infinity;
  for (const a of ANCHOR_CANDIDATES) {
    const p = mapLabelTextSvgProps(a, { px: ax, py: ay, ...args });
    const err = (p.x - tpX) ** 2 + (p.y - tpY) ** 2;
    if (err < bestErr) {
      bestErr = err;
      best = a;
    }
  }
  return best;
}

/**
 * After point reflection through the viewBox center (Swap sides), update anchor `(x,y)`,
 * `text_anchor`, and `text_rotation_deg` so the label text **origin** (before `rotate()`)
 * matches the reflected position — needed for ±90° text, where swapping anchor enum alone
 * jumped the text to the mirror side of the pin.
 */
export function transformLocationLabelForViewBoxCenterFlip(
  vb: ViewBoxRect,
  vbWidth: number,
  l: MapLocationLabel,
): Pick<MapLocationLabel, "x" | "y" | "text_anchor" | "text_rotation_deg"> {
  const fs = vbWidth * 0.026 * l.size;
  const pinR = vbWidth * 0.014 * l.size * 0.55;
  const textOnlyGap = Math.max(
    fs * 0.35,
    vbWidth * 0.014 * l.size * 0.45,
  );
  const isPin = l.style === "pin";
  const layoutArgs = { pinR, fs, isPin, textOnlyGap };

  const tp = mapLabelTextSvgProps(l.text_anchor, {
    px: l.x,
    py: l.y,
    ...layoutArgs,
  });

  const midX = vb.minX + vb.width / 2;
  const midY = vb.minY + vb.height / 2;
  const flip = (x: number, y: number) => ({
    x: 2 * midX - x,
    y: 2 * midY - y,
  });

  const tpF = flip(tp.x, tp.y);
  const aF = flip(l.x, l.y);

  const text_anchor = inferTextAnchorFromFlippedGeometry(
    aF.x,
    aF.y,
    tpF.x,
    tpF.y,
    layoutArgs,
  );

  return {
    x: aF.x,
    y: aF.y,
    text_anchor,
    text_rotation_deg: labelRotationAfterViewBoxCenterPointFlip(
      l.text_rotation_deg ?? 0,
    ),
  };
}

export type MapLabelTextSvgProps = {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  dominantBaseline: "auto" | "middle" | "hanging" | "central";
};

/**
 * SVG `<text>` position and alignment for a label relative to its anchor point.
 * `pinR` is the rendered pin radius; `fs` is the label font size in user units.
 */
export function mapLabelTextSvgProps(
  anchor: MapLabelTextAnchor,
  args: {
    px: number;
    py: number;
    pinR: number;
    fs: number;
    isPin: boolean;
    /** Gap from point for text-only labels (user units). */
    textOnlyGap: number;
  },
): MapLabelTextSvgProps {
  const { px, py, pinR, fs, isPin, textOnlyGap } = args;
  const dist = isPin ? pinR * 1.25 : textOnlyGap;

  switch (anchor) {
    case "left":
      return {
        x: px - dist,
        y: py,
        textAnchor: "end",
        dominantBaseline: "middle",
      };
    case "top":
      return {
        x: px,
        y: py - dist - fs * 0.5,
        textAnchor: "middle",
        dominantBaseline: "middle",
      };
    case "bottom":
      return {
        x: px,
        y: py + dist + fs * 0.5,
        textAnchor: "middle",
        dominantBaseline: "middle",
      };
    case "right":
    default:
      return {
        x: px + dist,
        y: py,
        textAnchor: "start",
        dominantBaseline: "middle",
      };
  }
}
