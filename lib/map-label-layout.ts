import type { MapLabelTextAnchor } from "@/types/catalog";

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
