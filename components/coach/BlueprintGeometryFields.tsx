"use client";

import type { ReactNode } from "react";
import type { AgentAbilityGeometry } from "@/types/agent-ability";
import type { MapPoint } from "@/lib/map-path";
import {
  BLUEPRINT_CANVAS_SIZE,
  BLUEPRINT_EDITOR_COORD_MAX,
  BLUEPRINT_GEOMETRY_LENGTH_MAX,
} from "@/lib/agent-ability-blueprint-scale";

function clampCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n * 1000) / 1000;
  return Math.min(BLUEPRINT_CANVAS_SIZE, Math.max(0, r));
}

function clampCoordExtended(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n * 1000) / 1000;
  return Math.min(BLUEPRINT_EDITOR_COORD_MAX, Math.max(0, r));
}

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return 6;
  const r = Math.round(n * 1000) / 1000;
  return Math.min(BLUEPRINT_GEOMETRY_LENGTH_MAX, Math.max(6, r));
}

function fieldCls(): string {
  return "input-field mt-0.5 w-full font-mono text-xs tabular-nums";
}

function Row({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
  );
}

export function BlueprintGeometryFields({
  geometry,
  onChange,
}: {
  geometry: AgentAbilityGeometry;
  onChange: (g: AgentAbilityGeometry) => void;
}) {
  const g = geometry;

  switch (g.kind) {
    case "point":
      return (
        <Row>
          <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
            x (0–{BLUEPRINT_CANVAS_SIZE})
            <input
              type="number"
              min={0}
              max={BLUEPRINT_CANVAS_SIZE}
              step="any"
              value={g.x}
              onChange={(e) =>
                onChange({
                  kind: "point",
                  x: clampCoord(Number.parseFloat(e.target.value)),
                  y: g.y,
                })
              }
              className={fieldCls()}
            />
          </label>
          <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
            y (0–{BLUEPRINT_CANVAS_SIZE})
            <input
              type="number"
              min={0}
              max={BLUEPRINT_CANVAS_SIZE}
              step="any"
              value={g.y}
              onChange={(e) =>
                onChange({
                  kind: "point",
                  x: g.x,
                  y: clampCoord(Number.parseFloat(e.target.value)),
                })
              }
              className={fieldCls()}
            />
          </label>
        </Row>
      );
    case "circle":
      return (
        <>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              cx
              <input
                type="number"
                min={0}
                max={BLUEPRINT_CANVAS_SIZE}
                step="any"
                value={g.cx}
                onChange={(e) =>
                  onChange({
                    kind: "circle",
                    cx: clampCoord(Number.parseFloat(e.target.value)),
                    cy: g.cy,
                    r: g.r,
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              cy
              <input
                type="number"
                min={0}
                max={BLUEPRINT_CANVAS_SIZE}
                step="any"
                value={g.cy}
                onChange={(e) =>
                  onChange({
                    kind: "circle",
                    cx: g.cx,
                    cy: clampCoord(Number.parseFloat(e.target.value)),
                    r: g.r,
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
              r (6–{BLUEPRINT_GEOMETRY_LENGTH_MAX} blueprint units)
              <input
                type="number"
                min={6}
                max={BLUEPRINT_GEOMETRY_LENGTH_MAX}
                step="any"
                value={g.r}
                onChange={(e) =>
                  onChange({
                    kind: "circle",
                    cx: g.cx,
                    cy: g.cy,
                    r: clampRadius(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
        </>
      );
    case "ray":
      return (
        <>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-violet-500/80">
            Segment start
          </p>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              x1
              <input
                type="number"
                step="any"
                value={g.x1}
                onChange={(e) =>
                  onChange({
                    ...g,
                    x1: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              y1
              <input
                type="number"
                step="any"
                value={g.y1}
                onChange={(e) =>
                  onChange({
                    ...g,
                    y1: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
          <p className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-violet-500/80">
            Segment end
          </p>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              x2
              <input
                type="number"
                step="any"
                value={g.x2}
                onChange={(e) =>
                  onChange({
                    ...g,
                    x2: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              y2
              <input
                type="number"
                step="any"
                value={g.y2}
                onChange={(e) =>
                  onChange({
                    ...g,
                    y2: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block text-[11px] text-violet-400/90">
              Path shape
              <select
                value={g.curve ? "curved" : "straight"}
                onChange={(e) => {
                  const mode = e.target.value;
                  if (mode === "curved") {
                    onChange({
                      ...g,
                      curve: {
                        cx: (g.x1 + g.x2) / 2,
                        cy: (g.y1 + g.y2) / 2,
                      },
                    });
                  } else {
                    const { curve: _c, ...rest } = g;
                    onChange(rest);
                  }
                }}
                className={fieldCls()}
              >
                <option value="straight">Straight</option>
                <option value="curved">Curved</option>
              </select>
            </label>
            <label className="block text-[11px] text-violet-400/90">
              Wall state (Viper)
              <select
                value={g.wallState ?? "up"}
                onChange={(e) =>
                  onChange({
                    ...g,
                    wallState: e.target.value === "down" ? "down" : "up",
                  })
                }
                className={fieldCls()}
              >
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
          </div>
          {g.curve ? (
            <>
              <p className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-violet-500/80">
                Curve control
              </p>
              <Row>
                <label className="block text-[11px] text-violet-400/90">
                  cx
                  <input
                    type="number"
                    step="any"
                    value={g.curve.cx}
                    onChange={(e) =>
                      onChange({
                        ...g,
                        curve: {
                          cx: clampCoord(Number.parseFloat(e.target.value)),
                          cy: g.curve?.cy ?? (g.y1 + g.y2) / 2,
                        },
                      })
                    }
                    className={fieldCls()}
                  />
                </label>
                <label className="block text-[11px] text-violet-400/90">
                  cy
                  <input
                    type="number"
                    step="any"
                    value={g.curve.cy}
                    onChange={(e) =>
                      onChange({
                        ...g,
                        curve: {
                          cx: g.curve?.cx ?? (g.x1 + g.x2) / 2,
                          cy: clampCoord(Number.parseFloat(e.target.value)),
                        },
                      })
                    }
                    className={fieldCls()}
                  />
                </label>
              </Row>
            </>
          ) : null}
        </>
      );
    case "movement":
      return (
        <>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-violet-500/80">
            From (start)
          </p>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              ax
              <input
                type="number"
                step="any"
                value={g.ax}
                onChange={(e) =>
                  onChange({
                    kind: g.kind,
                    ax: clampCoord(Number.parseFloat(e.target.value)),
                    ay: g.ay,
                    bx: g.bx,
                    by: g.by,
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              ay
              <input
                type="number"
                step="any"
                value={g.ay}
                onChange={(e) =>
                  onChange({
                    kind: g.kind,
                    ax: g.ax,
                    ay: clampCoord(Number.parseFloat(e.target.value)),
                    bx: g.bx,
                    by: g.by,
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
          <p className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-violet-500/80">
            To (max range)
          </p>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              bx
              <input
                type="number"
                step="any"
                value={g.bx}
                onChange={(e) =>
                  onChange({
                    kind: g.kind,
                    ax: g.ax,
                    ay: g.ay,
                    bx: clampCoordExtended(Number.parseFloat(e.target.value)),
                    by: g.by,
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              by
              <input
                type="number"
                step="any"
                value={g.by}
                onChange={(e) =>
                  onChange({
                    kind: g.kind,
                    ax: g.ax,
                    ay: g.ay,
                    bx: g.bx,
                    by: clampCoordExtended(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
        </>
      );
    case "ricochet": {
      const dist = Math.hypot(g.bx - g.ax, g.by - g.ay);
      const clampedDist = Math.max(
        24,
        Math.min(BLUEPRINT_GEOMETRY_LENGTH_MAX, dist),
      );
      return (
        <div className="space-y-2">
          <p className="text-[11px] leading-snug text-violet-400/90">
            Ricochet path uses a fixed local origin and follows agent-facing rotation on the
            strat map. Adjust travel distance only.
          </p>
          <label className="block text-[11px] text-violet-400/90">
            Max travel distance (blueprint units)
            <input
              type="number"
              min={24}
              max={BLUEPRINT_GEOMETRY_LENGTH_MAX}
              step="any"
              value={Math.round(clampedDist * 1000) / 1000}
              onChange={(e) => {
                const next = Math.max(
                  24,
                  Math.min(
                    BLUEPRINT_GEOMETRY_LENGTH_MAX,
                    Number.parseFloat(e.target.value) || clampedDist,
                  ),
                );
                onChange({
                  kind: "ricochet",
                  ax: 500,
                  ay: 500,
                  bx: 500 + next,
                  by: 500,
                });
              }}
              className={fieldCls()}
            />
          </label>
        </div>
      );
    }
    case "cone":
      return (
        <>
          {(
            [
              ["ox", "oy", "Apex"],
              ["lx", "ly", "Left"],
              ["rx", "ry", "Right"],
            ] as const
          ).map(([xk, yk, title]) => (
            <div key={title} className="mb-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-violet-500/80">
                {title}
              </p>
              <Row>
                <label className="block text-[11px] text-violet-400/90">
                  {xk}
                  <input
                    type="number"
                    step="any"
                    value={g[xk]}
                    onChange={(e) =>
                      onChange({
                        ...g,
                        [xk]: clampCoord(Number.parseFloat(e.target.value)),
                      })
                    }
                    className={fieldCls()}
                  />
                </label>
                <label className="block text-[11px] text-violet-400/90">
                  {yk}
                  <input
                    type="number"
                    step="any"
                    value={g[yk]}
                    onChange={(e) =>
                      onChange({
                        ...g,
                        [yk]: clampCoord(Number.parseFloat(e.target.value)),
                      })
                    }
                    className={fieldCls()}
                  />
                </label>
              </Row>
            </div>
          ))}
        </>
      );
    case "polyline":
    case "polygon": {
      const pts = g.points;
      const setPt = (i: number, p: MapPoint) => {
        const next = pts.map((q, j) => (j === i ? p : q));
        onChange({ kind: g.kind, points: next });
      };
      const addPoint = () => {
        const last = pts[pts.length - 1] ?? { x: 500, y: 500 };
        onChange({
          kind: g.kind,
          points: [...pts, { x: clampCoord(last.x), y: clampCoord(last.y) }],
        });
      };
      const removePoint = (i: number) => {
        const minLen = g.kind === "polyline" ? 2 : 3;
        if (pts.length <= minLen) return;
        onChange({
          kind: g.kind,
          points: pts.filter((_, j) => j !== i),
        });
      };
      return (
        <div className="space-y-2">
          {pts.map((p, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-2 rounded-md border border-violet-800/35 bg-slate-950/40 px-2 py-1.5"
            >
              <span className="w-8 shrink-0 text-[10px] text-violet-500/90">
                #{i + 1}
              </span>
              <label className="min-w-[100px] flex-1 text-[11px] text-violet-400/90">
                x
                <input
                  type="number"
                  step="any"
                  value={p.x}
                  onChange={(e) =>
                    setPt(i, {
                      x: clampCoord(Number.parseFloat(e.target.value)),
                      y: p.y,
                    })
                  }
                  className={fieldCls()}
                />
              </label>
              <label className="min-w-[100px] flex-1 text-[11px] text-violet-400/90">
                y
                <input
                  type="number"
                  step="any"
                  value={p.y}
                  onChange={(e) =>
                    setPt(i, {
                      x: p.x,
                      y: clampCoord(Number.parseFloat(e.target.value)),
                    })
                  }
                  className={fieldCls()}
                />
              </label>
              <button
                type="button"
                className="btn-secondary shrink-0 px-2 py-1 text-[10px]"
                onClick={() => removePoint(i)}
                disabled={
                  pts.length <= (g.kind === "polyline" ? 2 : 3)
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary w-full py-1 text-xs"
            onClick={addPoint}
          >
            Add vertex
          </button>
        </div>
      );
    }
    case "rectangle":
      return (
        <>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              x (min corner)
              <input
                type="number"
                step="any"
                value={g.x}
                onChange={(e) =>
                  onChange({
                    ...g,
                    x: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              y (min corner)
              <input
                type="number"
                step="any"
                value={g.y}
                onChange={(e) =>
                  onChange({
                    ...g,
                    y: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              width
              <input
                type="number"
                min={1}
                max={BLUEPRINT_GEOMETRY_LENGTH_MAX}
                step="any"
                value={g.w}
                onChange={(e) =>
                  onChange({
                    ...g,
                    w: Math.min(
                      BLUEPRINT_GEOMETRY_LENGTH_MAX,
                      Math.max(1, Number.parseFloat(e.target.value) || 1),
                    ),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              height
              <input
                type="number"
                min={1}
                max={BLUEPRINT_GEOMETRY_LENGTH_MAX}
                step="any"
                value={g.h}
                onChange={(e) =>
                  onChange({
                    ...g,
                    h: Math.min(
                      BLUEPRINT_GEOMETRY_LENGTH_MAX,
                      Math.max(1, Number.parseFloat(e.target.value) || 1),
                    ),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
          <label className="mt-2 block text-[11px] text-violet-400/90">
            rotation (deg)
            <input
              type="number"
              step="any"
              value={g.rotationDeg ?? 0}
              onChange={(e) =>
                onChange({
                  ...g,
                  rotationDeg: Number.parseFloat(e.target.value) || 0,
                })
              }
              className={fieldCls()}
            />
          </label>
        </>
      );
    case "arc":
      return (
        <>
          <Row>
            <label className="block text-[11px] text-violet-400/90">
              cx
              <input
                type="number"
                step="any"
                value={g.cx}
                onChange={(e) =>
                  onChange({
                    ...g,
                    cx: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90">
              cy
              <input
                type="number"
                step="any"
                value={g.cy}
                onChange={(e) =>
                  onChange({
                    ...g,
                    cy: clampCoord(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
              r (6–{BLUEPRINT_GEOMETRY_LENGTH_MAX})
              <input
                type="number"
                min={6}
                max={BLUEPRINT_GEOMETRY_LENGTH_MAX}
                step="any"
                value={g.r}
                onChange={(e) =>
                  onChange({
                    ...g,
                    r: clampRadius(Number.parseFloat(e.target.value)),
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
          <Row>
            <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
              startDeg
              <input
                type="number"
                step="any"
                value={g.startDeg}
                onChange={(e) =>
                  onChange({
                    ...g,
                    startDeg: Number.parseFloat(e.target.value) || 0,
                  })
                }
                className={fieldCls()}
              />
            </label>
            <label className="block text-[11px] text-violet-400/90 sm:col-span-2">
              sweepDeg
              <input
                type="number"
                step="any"
                value={g.sweepDeg}
                onChange={(e) =>
                  onChange({
                    ...g,
                    sweepDeg: Number.parseFloat(e.target.value) || 0,
                  })
                }
                className={fieldCls()}
              />
            </label>
          </Row>
        </>
      );
    default:
      return null;
  }
}
