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

/** Top↔bottom under reflection across the horizontal midline (defense mirror); left/right unchanged. */
export function legacyTextAnchorAfterHorizontalMidlineFlip(
  a: MapLabelTextAnchor,
): MapLabelTextAnchor {
  switch (a) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    default:
      return a;
  }
}

/** Reflection across horizontal midline: negate SVG rotation (y-down). */
export function labelRotationAfterHorizontalMidlineFlip(deg: number): number {
  return normalizeLabelRotationDeg(-normalizeLabelRotationDeg(deg));
}

/** Left↔right, top↔bottom — exact inverse offset under point reflection through viewBox center. */
export function legacyTextAnchorAfterViewBoxCenterFlip(
  a: MapLabelTextAnchor,
): MapLabelTextAnchor {
  switch (a) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    default:
      return a;
  }
}

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
 * `text_anchor`, and `text_rotation_deg`.
 *
 * For the **unrotated** text origin, `legacyTextAnchorAfterViewBoxCenterFlip` is exact:
 * if `tp = mapLabel(anchor, A)` then `flip(tp) = mapLabel(legacy(anchor), flip(A))`.
 * We verify numerically and fall back to least-squares only if float drift breaks that.
 *
 * **Rotation:** map flip is 180° about the view center; stored `text_rotation_deg` is
 * updated with +180° (readable range), matching world orientation after the flip.
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

  const legacy = legacyTextAnchorAfterViewBoxCenterFlip(l.text_anchor);
  const tpLegacy = mapLabelTextSvgProps(legacy, {
    px: aF.x,
    py: aF.y,
    ...layoutArgs,
  });
  const legacyErr =
    (tpLegacy.x - tpF.x) ** 2 + (tpLegacy.y - tpF.y) ** 2;
  const tol = Math.max(fs * fs * 1e-10, 1e-12);

  let text_anchor: MapLabelTextAnchor =
    legacyErr <= tol
      ? legacy
      : inferTextAnchorFromFlippedGeometry(
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

/**
 * After reflection across the horizontal midline (`path_def` vs `path_atk`), update label
 * anchor position, `text_anchor`, and `text_rotation_deg`.
 */
export function transformLocationLabelForHorizontalMidlineFlip(
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

  const midY = vb.minY + vb.height / 2;
  const flipY = (y: number) => 2 * midY - y;

  const tp = mapLabelTextSvgProps(l.text_anchor, {
    px: l.x,
    py: l.y,
    ...layoutArgs,
  });

  const tpF = { x: tp.x, y: flipY(tp.y) };
  const aF = { x: l.x, y: flipY(l.y) };

  const legacy = legacyTextAnchorAfterHorizontalMidlineFlip(l.text_anchor);
  const tpLegacy = mapLabelTextSvgProps(legacy, {
    px: aF.x,
    py: aF.y,
    ...layoutArgs,
  });
  const legacyErr =
    (tpLegacy.x - tpF.x) ** 2 + (tpLegacy.y - tpF.y) ** 2;
  const tol = Math.max(fs * fs * 1e-10, 1e-12);

  let text_anchor: MapLabelTextAnchor =
    legacyErr <= tol
      ? legacy
      : inferTextAnchorFromFlippedGeometry(
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
    text_rotation_deg: labelRotationAfterHorizontalMidlineFlip(
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
