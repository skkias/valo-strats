import type { MapLabelTextAnchor } from "@/types/catalog";

/** Normalize degrees to (-180, 180], same convention as stored `text_rotation_deg`. */
export function normalizeLabelRotationDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * After a 180° map flip (point reflection through the viewBox center), update
 * label rotation so text stays readable: vertical tilts negate (90° ↔ -90°),
 * horizontal stays horizontal. Pure ±180° (upside-down) collapses to 0°.
 * Pair with swapped `text_anchor` and flipped anchor `(x,y)`.
 */
export function labelRotationAfterCenterFlip(deg: number): number {
  let r = normalizeLabelRotationDeg(-normalizeLabelRotationDeg(deg));
  if (Math.abs(r) >= 179) r = 0;
  return r;
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
