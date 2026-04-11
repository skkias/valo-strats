"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import type { Agent } from "@/types/catalog";
import type {
  AgentAbilityBlueprint,
  AgentAbilityGeometry,
  AgentAbilityShapeKind,
  AgentAbilitySlot,
} from "@/types/agent-ability";
import {
  saveAgentAbilitiesBlueprintAction,
  saveAgentPortraitUrlAction,
} from "@/app/coach/agent-actions";
import type { MapPoint } from "@/lib/map-path";
import { clientToSvgPoint } from "@/lib/svg-coords";

const VB = 1000;
const VB_STR = `0 0 ${VB} ${VB}`;

const SLOT_OPTIONS: { value: AgentAbilitySlot; label: string }[] = [
  { value: "q", label: "Q" },
  { value: "e", label: "E" },
  { value: "c", label: "C" },
  { value: "x", label: "X" },
];

const SHAPE_OPTIONS: { value: AgentAbilityShapeKind; label: string; hint: string }[] =
  [
    { value: "point", label: "Point", hint: "Single land / ping" },
    { value: "circle", label: "Circle", hint: "Smoke, orb radius" },
    { value: "ray", label: "Ray / line", hint: "Tripwire, laser" },
    { value: "cone", label: "Cone / wedge", hint: "Flash, vision cone" },
    { value: "polyline", label: "Polyline", hint: "Dart path, wall chain" },
    { value: "polygon", label: "Polygon zone", hint: "Trap field, floor" },
    { value: "rectangle", label: "Rectangle", hint: "Aligned box" },
    { value: "arc", label: "Arc", hint: "Shock arc, curved utility" },
  ];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(p: MapPoint): MapPoint {
  return {
    x: Math.min(VB, Math.max(0, p.x)),
    y: Math.min(VB, Math.max(0, p.y)),
  };
}

function buildGeometry(
  kind: AgentAbilityShapeKind,
  pts: MapPoint[],
): AgentAbilityGeometry | null {
  if (pts.length === 0) return null;
  if (kind === "point" && pts[0]) {
    const p = pts[0]!;
    return { kind: "point", ...clamp(p) };
  }
  if (kind === "circle" && pts.length >= 2) {
    const c = pts[0]!;
    const rim = pts[1]!;
    const r = Math.hypot(rim.x - c.x, rim.y - c.y);
    return {
      kind: "circle",
      cx: c.x,
      cy: c.y,
      r: Math.max(6, Math.min(500, r)),
    };
  }
  if (kind === "ray" && pts.length >= 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    return { kind: "ray", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (kind === "cone" && pts.length >= 3) {
    const o = pts[0]!;
    const l = pts[1]!;
    const r = pts[2]!;
    return {
      kind: "cone",
      ox: o.x,
      oy: o.y,
      lx: l.x,
      ly: l.y,
      rx: r.x,
      ry: r.y,
    };
  }
  if (kind === "polyline" && pts.length >= 2) {
    return { kind: "polyline", points: pts.map(clamp) };
  }
  if (kind === "polygon" && pts.length >= 3) {
    return { kind: "polygon", points: pts.map(clamp) };
  }
  if (kind === "rectangle" && pts.length >= 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return { kind: "rectangle", x, y, w, h, rotationDeg: 0 };
  }
  if (kind === "arc" && pts.length >= 3) {
    const c = pts[0]!;
    const p1 = pts[1]!;
    const p2 = pts[2]!;
    const r = Math.hypot(p1.x - c.x, p1.y - c.y);
    const startDeg = (Math.atan2(p1.y - c.y, p1.x - c.x) * 180) / Math.PI;
    const endDeg = (Math.atan2(p2.y - c.y, p2.x - c.x) * 180) / Math.PI;
    let sweepDeg = endDeg - startDeg;
    if (sweepDeg > 180) sweepDeg -= 360;
    if (sweepDeg < -180) sweepDeg += 360;
    return {
      kind: "arc",
      cx: c.x,
      cy: c.y,
      r: Math.max(6, Math.min(500, r)),
      startDeg,
      sweepDeg,
    };
  }
  return null;
}

function arcPathD(g: Extract<AgentAbilityGeometry, { kind: "arc" }>): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const { cx, cy, r, startDeg, sweepDeg } = g;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(startDeg + sweepDeg));
  const y2 = cy + r * Math.sin(rad(startDeg + sweepDeg));
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweepFlag = sweepDeg >= 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`;
}

function AbilityShapePreview({
  b,
  dimmed,
}: {
  b: AgentAbilityBlueprint;
  dimmed?: boolean;
}) {
  const g = b.geometry;
  const stroke = b.color;
  const fill = `${b.color}33`;
  const sw = VB * 0.004;
  const op = dimmed ? 0.35 : 0.95;

  switch (g.kind) {
    case "point":
      return (
        <g opacity={op}>
          <circle cx={g.x} cy={g.y} r={VB * 0.018} fill={stroke} stroke="#fff" strokeWidth={sw} />
        </g>
      );
    case "circle":
      return (
        <g opacity={op}>
          <circle
            cx={g.cx}
            cy={g.cy}
            r={g.r}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        </g>
      );
    case "ray":
      return (
        <g opacity={op}>
          <line
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke={stroke}
            strokeWidth={sw * 1.8}
            strokeLinecap="round"
          />
        </g>
      );
    case "cone":
      return (
        <g opacity={op}>
          <polygon
            points={`${g.ox},${g.oy} ${g.lx},${g.ly} ${g.rx},${g.ry}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </g>
      );
    case "polyline": {
      const d = g.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      return (
        <g opacity={op}>
          <path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={sw * 1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    }
    case "polygon":
      return (
        <g opacity={op}>
          <polygon
            points={g.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </g>
      );
    case "rectangle":
      return (
        <g opacity={op}>
          <rect
            x={g.x}
            y={g.y}
            width={g.w}
            height={g.h}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            transform={
              g.rotationDeg
                ? `rotate(${g.rotationDeg},${g.x + g.w / 2},${g.y + g.h / 2})`
                : undefined
            }
          />
        </g>
      );
    case "arc":
      return (
        <g opacity={op}>
          <path
            d={arcPathD(g)}
            fill="none"
            stroke={stroke}
            strokeWidth={sw * 1.8}
            strokeLinecap="round"
          />
        </g>
      );
    default:
      return null;
  }
}

type Placement = {
  slot: AgentAbilitySlot;
  name: string;
  shapeKind: AgentAbilityShapeKind;
  color: string;
  points: MapPoint[];
};

function placementHint(kind: AgentAbilityShapeKind): string {
  switch (kind) {
    case "point":
      return "Click once for the point.";
    case "circle":
      return "Click center, then edge (sets radius).";
    case "ray":
      return "Click start, then end of the segment.";
    case "cone":
      return "Click apex, left edge, right edge (triangle).";
    case "polyline":
      return "Click to add vertices. Press Done when finished (≥2 points).";
    case "polygon":
      return "Click vertices. Press Close when finished (≥3 points).";
    case "rectangle":
      return "Click two opposite corners.";
    case "arc":
      return "Click center, a point on the arc (radius), then end direction.";
    default:
      return "";
  }
}

function pointsDoneCount(kind: AgentAbilityShapeKind): number {
  switch (kind) {
    case "point":
      return 1;
    case "circle":
    case "ray":
    case "rectangle":
      return 2;
    case "cone":
    case "arc":
      return 3;
    default:
      return 999;
  }
}

export function AgentAbilityEditor({ agent }: { agent: Agent }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const initial = agent.abilities_blueprint ?? [];
  const [abilities, setAbilities] = useState<AgentAbilityBlueprint[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [portraitUrl, setPortraitUrl] = useState(agent.portrait_url ?? "");
  const [portraitSaving, setPortraitSaving] = useState(false);

  useEffect(() => {
    setPortraitUrl(agent.portrait_url ?? "");
  }, [agent.id, agent.portrait_url]);

  const [draftSlot, setDraftSlot] = useState<AgentAbilitySlot>("q");
  const [draftName, setDraftName] = useState("");
  const [draftShape, setDraftShape] = useState<AgentAbilityShapeKind>("circle");
  const [draftColor, setDraftColor] = useState("#a78bfa");

  const selected = useMemo(
    () => abilities.find((a) => a.id === selectedId) ?? null,
    [abilities, selectedId],
  );

  const startPlacement = useCallback(() => {
    const name = draftName.trim() || "Ability";
    setPlacement({
      slot: draftSlot,
      name,
      shapeKind: draftShape,
      color: draftColor,
      points: [],
    });
    setBanner(null);
  }, [draftSlot, draftName, draftShape, draftColor]);

  const cancelPlacement = useCallback(() => {
    setPlacement(null);
  }, []);

  const commitPlacement = useCallback(
    (pts: MapPoint[], forcePolyDone?: boolean) => {
      if (!placement) return;
      const kind = placement.shapeKind;
      let geo: AgentAbilityGeometry | null = null;
      if (kind === "polyline") {
        if (pts.length < 2 || !forcePolyDone) return;
        geo = buildGeometry("polyline", pts);
      } else if (kind === "polygon") {
        if (pts.length < 3 || !forcePolyDone) return;
        geo = buildGeometry("polygon", pts);
      } else {
        const need = pointsDoneCount(kind);
        if (pts.length < need) return;
        geo = buildGeometry(kind, pts.slice(0, need));
      }
      if (!geo) return;
      const next: AgentAbilityBlueprint = {
        id: newId(),
        slot: placement.slot,
        name: placement.name,
        shapeKind: placement.shapeKind,
        color: placement.color,
        geometry: geo,
      };
      setAbilities((a) => [...a, next]);
      setSelectedId(next.id);
      setPlacement(null);
    },
    [placement],
  );

  const onSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placement || !svgRef.current) return;
      if (e.button !== 0) return;
      const raw = clientToSvgPoint(svgRef.current, e.clientX, e.clientY);
      const p = clamp({ x: raw.x, y: raw.y });
      const kind = placement.shapeKind;
      const nextPts = [...placement.points, p];

      if (kind === "polyline" || kind === "polygon") {
        setPlacement({ ...placement, points: nextPts });
        return;
      }

      const need = pointsDoneCount(kind);
      if (nextPts.length >= need) {
        commitPlacement(nextPts);
      } else {
        setPlacement({ ...placement, points: nextPts });
      }
    },
    [placement, commitPlacement],
  );

  function removeAbility(id: string) {
    setAbilities((a) => a.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  async function onSave() {
    setSaving(true);
    setBanner(null);
    const { error } = await saveAgentAbilitiesBlueprintAction(agent.id, abilities);
    setSaving(false);
    if (error) setBanner(error);
    else setBanner("Saved ability blueprints.");
  }

  async function onSavePortrait() {
    setPortraitSaving(true);
    setBanner(null);
    const { error } = await saveAgentPortraitUrlAction(
      agent.id,
      portraitUrl.trim() || null,
      agent.slug,
    );
    setPortraitSaving(false);
    if (error) setBanner(error);
    else setBanner("Saved portrait URL.");
  }

  async function onClearPortrait() {
    setPortraitSaving(true);
    setBanner(null);
    const { error } = await saveAgentPortraitUrlAction(
      agent.id,
      null,
      agent.slug,
    );
    setPortraitSaving(false);
    if (error) setBanner(error);
    else {
      setPortraitUrl("");
      setBanner("Cleared portrait URL.");
    }
  }

  return (
    <div className="space-y-6">
      {banner && (
        <p className="rounded-lg border border-violet-800/45 bg-slate-950/60 px-4 py-2 text-sm text-slate-200">
          {banner}
        </p>
      )}

      <div className="rounded-xl border border-fuchsia-900/35 bg-slate-950/50 p-4">
        <h2 className="text-sm font-semibold text-fuchsia-100/95">
          Face card (portrait)
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-violet-300/65">
          This app does not ship agent artwork. Add a public{" "}
          <strong className="text-violet-200/90">https://</strong> URL to a
          square image you are allowed to host—e.g. your own renders, team
          graphics, or assets from Riot&apos;s official VALORANT{" "}
          <span className="whitespace-nowrap">press / media kit</span> (follow
          their license). You can also upload to Supabase Storage or another CDN
          and paste the link here.
        </p>
        <label className="label mt-3 block" htmlFor="agent-portrait-url">
          Portrait image URL
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="agent-portrait-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={portraitUrl}
            onChange={(e) => setPortraitUrl(e.target.value)}
            className="input-field min-w-0 flex-1 font-mono text-xs"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void onSavePortrait()}
              disabled={portraitSaving}
              className="btn-primary whitespace-nowrap px-3 py-2 text-sm"
            >
              {portraitSaving ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : (
                "Save portrait"
              )}
            </button>
            <button
              type="button"
              onClick={() => void onClearPortrait()}
              disabled={portraitSaving}
              className="btn-secondary whitespace-nowrap px-3 py-2 text-sm"
            >
              Clear
            </button>
          </div>
        </div>
        {portraitUrl.trim().startsWith("https://") ? (
          <div className="mt-3 flex items-start gap-3">
            <img
              src={portraitUrl.trim()}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg border border-violet-700/40 object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <p className="text-[11px] text-violet-400/55">
              Preview only. If the image is blocked (hotlinking), try hosting on
              your Supabase bucket or another CDN.
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-violet-500/25 bg-slate-950/80">
            <svg
              ref={svgRef}
              viewBox={VB_STR}
              className="h-auto w-full max-h-[min(70dvh,720px)] cursor-crosshair touch-none select-none"
              onClick={onSvgClick}
              role="presentation"
            >
              <rect width={VB} height={VB} fill="rgb(15,23,42)" />
              <text
                x={VB / 2}
                y={36}
                textAnchor="middle"
                fill="rgba(148,163,184,0.55)"
                style={{ fontSize: VB * 0.022, fontFamily: "system-ui" }}
              >
                Ability blueprint (normalized {VB}×{VB}) — not map-bound
              </text>
              {abilities.map((b) => (
                <g
                  key={b.id}
                  pointerEvents={placement ? "none" : "auto"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(b.id);
                  }}
                  style={{ cursor: placement ? "default" : "pointer" }}
                >
                  <AbilityShapePreview b={b} dimmed={selectedId !== b.id} />
                </g>
              ))}
              {placement &&
                placement.points.map((p, i) => (
                  <circle
                    key={`d-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={VB * 0.012}
                    fill="rgb(250,250,250)"
                    stroke="rgb(167,139,250)"
                    strokeWidth={VB * 0.003}
                  />
                ))}
              {placement && placement.shapeKind === "polyline" && placement.points.length >= 2 ? (
                <path
                  d={placement.points
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke="rgba(167,139,250,0.6)"
                  strokeWidth={VB * 0.004}
                  strokeDasharray="12 8"
                  pointerEvents="none"
                />
              ) : null}
              {placement && placement.shapeKind === "polygon" && placement.points.length >= 2 ? (
                <polygon
                  points={placement.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(167,139,250,0.12)"
                  stroke="rgba(167,139,250,0.55)"
                  strokeWidth={VB * 0.003}
                  strokeDasharray="10 6"
                  pointerEvents="none"
                />
              ) : null}
            </svg>
          </div>
          {placement ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-800/40 bg-violet-950/25 px-3 py-2 text-sm text-violet-100/90">
              <span>
                Placing: <strong>{placement.name}</strong> ({placement.shapeKind}) —{" "}
                {placementHint(placement.shapeKind)}
              </span>
              {(placement.shapeKind === "polyline" ||
                placement.shapeKind === "polygon") && (
                <>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      commitPlacement(placement.points, true);
                    }}
                    disabled={
                      placement.shapeKind === "polyline"
                        ? placement.points.length < 2
                        : placement.points.length < 3
                    }
                  >
                    {placement.shapeKind === "polyline" ? "Done" : "Close polygon"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    onClick={cancelPlacement}
                  >
                    Cancel
                  </button>
                </>
              )}
              {placement.shapeKind !== "polyline" &&
                placement.shapeKind !== "polygon" && (
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    onClick={cancelPlacement}
                  >
                    Cancel
                  </button>
                )}
            </div>
          ) : (
            <p className="text-xs text-violet-400/55">
              Click the canvas after pressing “Start placement”. Select a saved shape in the list to highlight it.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-xl border border-violet-500/20 bg-slate-950/50 p-4">
          <h3 className="text-sm font-semibold text-white">Define new ability</h3>
          <div className="space-y-2">
            <label className="label" htmlFor="ab-slot">
              Slot
            </label>
            <select
              id="ab-slot"
              value={draftSlot}
              onChange={(e) => setDraftSlot(e.target.value as AgentAbilitySlot)}
              className="input-field"
              disabled={!!placement}
            >
              {SLOT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label" htmlFor="ab-name">
              Name
            </label>
            <input
              id="ab-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="input-field"
              placeholder="e.g. Cyber cage"
              disabled={!!placement}
            />
          </div>
          <div className="space-y-2">
            <label className="label" htmlFor="ab-shape">
              Shape type
            </label>
            <select
              id="ab-shape"
              value={draftShape}
              onChange={(e) =>
                setDraftShape(e.target.value as AgentAbilityShapeKind)
              }
              className="input-field"
              disabled={!!placement}
            >
              {SHAPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="label" htmlFor="ab-color">
              Color
            </label>
            <input
              id="ab-color"
              type="color"
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
              className="h-10 w-full cursor-pointer rounded border border-violet-800/50 bg-slate-950"
              disabled={!!placement}
            />
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={startPlacement}
            disabled={!!placement}
          >
            Start placement
          </button>

          <div className="border-t border-violet-800/35 pt-4">
            <h3 className="text-sm font-semibold text-white">Saved ({abilities.length})</h3>
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-sm">
              {abilities.map((b) => (
                <li
                  key={b.id}
                  className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
                    selectedId === b.id ? "bg-violet-600/25" : "hover:bg-slate-900/60"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-violet-100/90"
                    onClick={() => setSelectedId(b.id)}
                  >
                    <span className="font-mono text-xs text-violet-400/80">
                      {b.slot.toUpperCase()}
                    </span>{" "}
                    {b.name}{" "}
                    <span className="text-violet-500/60">({b.shapeKind})</span>
                  </button>
                  <button
                    type="button"
                    title="Remove"
                    className="shrink-0 text-violet-500/50 hover:text-fuchsia-300"
                    onClick={() => removeAbility(b.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <p className="mt-2 text-[11px] leading-relaxed text-violet-400/55">
                Selected geometry: <code className="text-violet-300/80">{selected.geometry.kind}</code>. Remove and place again to change shape.
              </p>
            )}
          </div>

          <button
            type="button"
            className="btn-primary inline-flex w-full items-center justify-center gap-2"
            onClick={() => void onSave()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save to agent
          </button>
        </div>
      </div>
    </div>
  );
}
