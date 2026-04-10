/** 2D point in map editor / SVG viewBox space. */
export type MapPoint = { x: number; y: number };

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
}

/** Build a closed SVG path from vertices (polygon). */
export function pointsToPathD(points: MapPoint[]): string | null {
  if (points.length < 3) return null;
  const [p0, ...rest] = points;
  const parts = [`M ${fmt(p0.x)} ${fmt(p0.y)}`];
  for (const p of rest) {
    parts.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** Outer boundary plus hole rings (attack-side viewBox space). */
export type MapOutlineRings = {
  outer: MapPoint[];
  holes: MapPoint[][];
};

/**
 * Split a stored SVG path into closed rings (subpaths separated by Z).
 * First ring is the outer boundary; additional rings are holes.
 */
export function parsePathToRings(path: string | null | undefined): MapPoint[][] {
  if (!path?.trim()) return [];
  const rings: MapPoint[][] = [];
  for (const chunk of path.trim().split(/[Zz]/)) {
    const t = chunk.trim();
    if (!t) continue;
    const pts = parsePathToPoints(t);
    if (pts.length >= 3) rings.push(pts);
  }
  return rings;
}

/** Compound path for SVG clip / fill (use `fillRule="evenodd"` on the element). */
export function ringsToPathD(outer: MapPoint[], holes: MapPoint[][]): string | null {
  const o = pointsToPathD(outer);
  if (!o) return null;
  const parts = [o];
  for (const h of holes) {
    const hd = pointsToPathD(h);
    if (hd) parts.push(hd);
  }
  return parts.join(" ");
}

export function parsePathToPoints(path: string | null | undefined): MapPoint[] {
  if (!path?.trim()) return [];
  const nums = path
    .replace(/[MLZz]/g, " ")
    .split(/[\s,]+/)
    .map((x) => parseFloat(x))
    .filter((n) => !Number.isNaN(n));
  const out: MapPoint[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i], y: nums[i + 1] });
  }
  return out;
}

export type ViewBoxRect = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

/**
 * Reflect points across the horizontal midline of the viewBox (mirror top ↔ bottom).
 * Matches “same shape flipped over the x-axis” through the map center in viewBox space.
 */
export function flipPointsOverHorizontalMidline(
  vb: ViewBoxRect,
  points: MapPoint[],
): MapPoint[] {
  const midY = vb.minY + vb.height / 2;
  return points.map((p) => ({ x: p.x, y: 2 * midY - p.y }));
}

/**
 * Reflect points across the vertical midline of the viewBox (mirror left ↔ right).
 */
export function flipPointsOverVerticalMidline(
  vb: ViewBoxRect,
  points: MapPoint[],
): MapPoint[] {
  const midX = vb.minX + vb.width / 2;
  return points.map((p) => ({ x: 2 * midX - p.x, y: p.y }));
}

/**
 * Reflect points through the center of the viewBox (flip over both axes:
 * same as vertical then horizontal mirror, or 180° rotation about the center).
 */
export function flipPointsThroughViewBoxCenter(
  vb: ViewBoxRect,
  points: MapPoint[],
): MapPoint[] {
  const midX = vb.minX + vb.width / 2;
  const midY = vb.minY + vb.height / 2;
  return points.map((p) => ({ x: 2 * midX - p.x, y: 2 * midY - p.y }));
}

/** Align selected vertices to the same x (vertical axis / column). */
export function alignPointsVertical(
  points: MapPoint[],
  indices: number[],
): MapPoint[] {
  if (indices.length < 2) return points;
  const xs = indices.map((i) => points[i]?.x).filter((x) => x !== undefined);
  if (xs.length < 2) return points;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const next = [...points];
  for (const i of indices) {
    if (next[i]) next[i] = { ...next[i], x: mx };
  }
  return next;
}

/** Align selected vertices to the same y (horizontal axis / row). */
export function alignPointsHorizontal(
  points: MapPoint[],
  indices: number[],
): MapPoint[] {
  if (indices.length < 2) return points;
  const ys = indices.map((i) => points[i]?.y).filter((y) => y !== undefined);
  if (ys.length < 2) return points;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const next = [...points];
  for (const i of indices) {
    if (next[i]) next[i] = { ...next[i], y: my };
  }
  return next;
}
