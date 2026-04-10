/** Parse SVG `viewBox` string `"minX minY width height"`. */
export function parseViewBox(vb: string): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  const p = vb
    .trim()
    .split(/[\s,]+/)
    .map((x) => parseFloat(x));
  if (
    p.length >= 4 &&
    p.every((n) => Number.isFinite(n)) &&
    (p[2] ?? 0) > 0 &&
    (p[3] ?? 0) > 0
  ) {
    return { minX: p[0], minY: p[1], width: p[2], height: p[3] };
  }
  return { minX: 0, minY: 0, width: 1000, height: 1000 };
}
