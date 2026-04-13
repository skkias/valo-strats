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
import {
  abilityMetaForSlot,
  fetchValorantAbilityUiBySlug,
  type ValorantAbilityUiMeta,
} from "@/lib/valorant-api-abilities";
import {
  BLUEPRINT_CANVAS_SIZE,
  blueprintStratSizingReadout,
  STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO,
} from "@/lib/agent-ability-blueprint-scale";
import type { GameMap } from "@/types/catalog";
import { AbilityBlueprintMapPreview } from "@/components/coach/AbilityBlueprintMapPreview";
import { BlueprintGeometryFields } from "@/components/coach/BlueprintGeometryFields";
import { BlueprintPlacementPreview } from "@/components/coach/BlueprintPlacementPreview";
import { BlueprintShapeHandles } from "@/components/coach/BlueprintShapeHandles";
import {
  clampBlueprintPoint,
  snapBlueprintPoint,
} from "@/lib/blueprint-canvas-snap";
import { viewBoxRectFromMap } from "@/lib/strat-map-display";
import {
  blueprintStratAnchor,
  defaultStratPlacementForShape,
  effectiveStratPlacementMode,
} from "@/lib/strat-blueprint-anchor";
import type { StratPlacementMode } from "@/types/agent-ability";

const VB = BLUEPRINT_CANVAS_SIZE;
const VB_STR = `0 0 ${VB} ${VB}`;

const SLOT_VALUES: AgentAbilitySlot[] = ["q", "e", "c", "x"];

function slotSelectLabel(
  bySlug: Record<string, ValorantAbilityUiMeta[]> | null,
  agentSlug: string,
  slot: AgentAbilitySlot,
): string {
  const meta = bySlug ? abilityMetaForSlot(bySlug, agentSlug, slot) : undefined;
  const key = slot.toUpperCase();
  if (meta?.displayName) return `${meta.displayName} (${key})`;
  return key;
}

function slotCompactLabel(
  bySlug: Record<string, ValorantAbilityUiMeta[]> | null,
  agentSlug: string,
  slot: AgentAbilitySlot,
): string {
  const meta = bySlug ? abilityMetaForSlot(bySlug, agentSlug, slot) : undefined;
  return meta?.displayName ?? slot.toUpperCase();
}

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
    {
      value: "movement",
      label: "Movement range",
      hint: "Teleport / dash max vector (A→B)",
    },
  ];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildGeometry(
  kind: AgentAbilityShapeKind,
  pts: MapPoint[],
): AgentAbilityGeometry | null {
  if (pts.length === 0) return null;
  if (kind === "point" && pts[0]) {
    const p = pts[0]!;
    return { kind: "point", ...clampBlueprintPoint(p) };
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
  if (kind === "movement" && pts.length >= 2) {
    const a = pts[0]!;
    const b = pts[1]!;
    return {
      kind: "movement",
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
    };
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
    return { kind: "polyline", points: pts.map(clampBlueprintPoint) };
  }
  if (kind === "polygon" && pts.length >= 3) {
    return { kind: "polygon", points: pts.map(clampBlueprintPoint) };
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

/** Point blueprint in editor: Valorant API icon when available. */
function PointBlueprintEditorPreview({
  x,
  y,
  stroke,
  displayIconUrl,
  dimmed,
}: {
  x: number;
  y: number;
  stroke: string;
  displayIconUrl?: string | null;
  dimmed?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const sw = VB * 0.004;
  const op = dimmed ? 0.35 : 0.95;
  const size = VB * 0.038;
  const half = size / 2;
  const showImg =
    typeof displayIconUrl === "string" &&
    displayIconUrl.startsWith("http") &&
    !imgFailed;

  return (
    <g opacity={op}>
      {showImg ? (
        <>
          <image
            href={displayIconUrl}
            x={x - half}
            y={y - half}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            onError={() => setImgFailed(true)}
          />
          <circle
            cx={x}
            cy={y}
            r={half * 1.06}
            fill="none"
            stroke={stroke}
            strokeWidth={sw * 0.9}
          />
          <circle
            cx={x}
            cy={y}
            r={half * 1.06}
            fill="none"
            stroke="#fff"
            strokeWidth={sw * 0.45}
          />
        </>
      ) : (
        <circle
          cx={x}
          cy={y}
          r={VB * 0.018}
          fill={stroke}
          stroke="#fff"
          strokeWidth={sw}
        />
      )}
    </g>
  );
}

function AbilityShapePreview({
  b,
  dimmed,
  displayIconUrl,
}: {
  b: AgentAbilityBlueprint;
  dimmed?: boolean;
  /** Valorant API `displayIcon` for point shapes. */
  displayIconUrl?: string | null;
}) {
  const g = b.geometry;
  const stroke = b.color;
  const fill = `${b.color}33`;
  const sw = VB * 0.004;
  const op = dimmed ? 0.35 : 0.95;

  switch (g.kind) {
    case "point":
      return (
        <PointBlueprintEditorPreview
          x={g.x}
          y={g.y}
          stroke={stroke}
          displayIconUrl={displayIconUrl}
          dimmed={dimmed}
        />
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
    case "movement": {
      const m = g;
      return (
        <g opacity={op}>
          <line
            x1={m.ax}
            y1={m.ay}
            x2={m.bx}
            y2={m.by}
            stroke={stroke}
            strokeWidth={sw * 2}
            strokeLinecap="round"
            strokeDasharray={`${VB * 0.02} ${VB * 0.014}`}
          />
          <circle cx={m.ax} cy={m.ay} r={VB * 0.014} fill={stroke} stroke="#fff" strokeWidth={sw} />
          <circle
            cx={m.bx}
            cy={m.by}
            r={VB * 0.011}
            fill={`${b.color}55`}
            stroke={stroke}
            strokeWidth={sw * 0.85}
          />
        </g>
      );
    }
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
    case "movement":
      return "Click start (from), then end (max range).";
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
    case "movement":
      return 2;
    case "cone":
    case "arc":
      return 3;
    default:
      return 999;
  }
}

/** Short status line for the placement bar (rubber-band shows the rest). */
function placementProgressLine(
  kind: AgentAbilityShapeKind,
  pointsLen: number,
): string {
  if (kind === "polyline" || kind === "polygon") {
    if (pointsLen === 0) return "Path — click to start";
    return `${pointsLen} point${pointsLen === 1 ? "" : "s"} — add more, or finish`;
  }
  const need = pointsDoneCount(kind);
  const next = pointsLen + 1;
  const labels: Record<
    AgentAbilityShapeKind,
    [string, string, string?]
  > = {
    point: ["Place utility land", "", ""],
    circle: ["1/2 — smoke center", "2/2 — edge for radius", ""],
    ray: ["1/2 — line start", "2/2 — line end", ""],
    cone: ["1/3 — apex", "2/3 — left edge", "3/3 — right edge"],
    polyline: ["", "", ""],
    polygon: ["", "", ""],
    rectangle: ["1/2 — one corner", "2/2 — opposite corner", ""],
    arc: ["1/3 — arc center", "2/3 — radius & start", "3/3 — arc direction"],
    movement: ["1/2 — range from", "2/2 — range to", ""],
  };
  const row = labels[kind];
  const line =
    pointsLen === 0 ? row[0] : pointsLen === 1 ? row[1] : row[2] ?? row[1];
  if (!line) return `Step ${next}/${need}`;
  if (line.includes("/")) return line;
  return `${line} (${next}/${need})`;
}

export function AgentAbilityEditor({
  agent,
  maps,
}: {
  agent: Agent;
  maps: GameMap[];
}) {
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

  const [valorantUiBySlug, setValorantUiBySlug] = useState<
    Record<string, ValorantAbilityUiMeta[]> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchValorantAbilityUiBySlug()
      .then((m) => {
        if (!cancelled) setValorantUiBySlug(m);
      })
      .catch(() => {
        if (!cancelled) setValorantUiBySlug({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [draftSlot, setDraftSlot] = useState<AgentAbilitySlot>("q");
  const [draftName, setDraftName] = useState("");
  const [draftShape, setDraftShape] = useState<AgentAbilityShapeKind>("circle");
  const [draftColor, setDraftColor] = useState("#a78bfa");
  const [previewMapId, setPreviewMapId] = useState<string | null>(
    maps[0]?.id ?? null,
  );

  /** 0 = snap off; otherwise grid units in blueprint space. */
  const [snapStep, setSnapStep] = useState<number>(25);
  const [cursorBp, setCursorBp] = useState<MapPoint | null>(null);

  const applySnap = useCallback(
    (p: MapPoint): MapPoint => {
      const c = clampBlueprintPoint(p);
      return snapStep > 0 ? snapBlueprintPoint(c, snapStep) : c;
    },
    [snapStep],
  );

  useEffect(() => {
    if (!valorantUiBySlug) return;
    const meta = abilityMetaForSlot(valorantUiBySlug, agent.slug, draftSlot);
    setDraftName(meta?.displayName ?? "");
  }, [draftSlot, valorantUiBySlug, agent.slug]);

  const previewMap = useMemo(() => {
    if (maps.length === 0) return null;
    const pick = previewMapId
      ? maps.find((m) => m.id === previewMapId)
      : null;
    return pick ?? maps[0] ?? null;
  }, [maps, previewMapId]);

  const selected = useMemo(
    () => abilities.find((a) => a.id === selectedId) ?? null,
    [abilities, selectedId],
  );

  useEffect(() => {
    if (selectedId && !abilities.some((a) => a.id === selectedId)) {
      setSelectedId(abilities[0]?.id ?? null);
    }
  }, [abilities, selectedId]);

  const startPlacement = useCallback(() => {
    const name = draftName.trim() || "Ability";
    setCursorBp(null);
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
    setCursorBp(null);
  }, []);

  useEffect(() => {
    if (!placement) return;
    const polyPlacement =
      placement.shapeKind === "polyline" || placement.shapeKind === "polygon";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPlacement();
        return;
      }
      if (e.key === "Backspace" && polyPlacement) {
        e.preventDefault();
        setPlacement((prev) => {
          if (!prev || prev.points.length === 0) return prev;
          return { ...prev, points: prev.points.slice(0, -1) };
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement, cancelPlacement]);

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
        stratPlacementMode: defaultStratPlacementForShape(placement.shapeKind),
      };
      setAbilities((a) => [...a, next]);
      setSelectedId(next.id);
      setPlacement(null);
      setCursorBp(null);
    },
    [placement],
  );

  const onSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!placement || !svgRef.current) return;
      if (e.button !== 0) return;
      const raw = clientToSvgPoint(svgRef.current, e.clientX, e.clientY);
      const p = applySnap({ x: raw.x, y: raw.y });
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
    [placement, commitPlacement, applySnap],
  );

  function removeAbility(id: string) {
    setAbilities((a) => a.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const updateSelectedGeometry = useCallback(
    (geo: AgentAbilityGeometry) => {
      if (!selectedId) return;
      setAbilities((list) =>
        list.map((b) =>
          b.id === selectedId
            ? { ...b, geometry: geo, shapeKind: geo.kind }
            : b,
        ),
      );
    },
    [selectedId],
  );

  const updateSelectedBlueprintMeta = useCallback(
    (patch: Partial<Pick<AgentAbilityBlueprint, "origin" | "stratPlacementMode">>) => {
      if (!selectedId) return;
      setAbilities((list) =>
        list.map((b) => {
          if (b.id !== selectedId) return b;
          const n = { ...b };
          if ("origin" in patch) {
            if (patch.origin === undefined) delete n.origin;
            else n.origin = patch.origin;
          }
          if ("stratPlacementMode" in patch) {
            if (patch.stratPlacementMode === undefined) {
              delete n.stratPlacementMode;
            } else {
              n.stratPlacementMode = patch.stratPlacementMode;
            }
          }
          return n;
        }),
      );
    },
    [selectedId],
  );

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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-800/30 bg-slate-950/55 px-3 py-2 text-xs text-violet-200/90">
            <span className="text-violet-400/90">
              Snap to grid (easier to match in-game proportions by eye)
            </span>
            <select
              value={snapStep}
              onChange={(e) => setSnapStep(Number(e.target.value))}
              disabled={!!placement}
              className="input-field max-w-[11rem] py-1.5 text-xs"
              aria-label="Blueprint snap grid"
            >
              <option value={0}>Off — freehand</option>
              <option value={10}>10 units (fine)</option>
              <option value={25}>25 units (balanced)</option>
              <option value={50}>50 units (chunky)</option>
            </select>
          </div>
          <p className="text-xs leading-relaxed text-violet-400/70">
            The canvas shows <strong className="text-violet-200/85">one ability at a time</strong>
            — the one selected in the list. After you save a shape, select it and{" "}
            <strong className="text-violet-200/85">drag the colored dots</strong> to resize and
            move. While placing a new shape, move the pointer to preview before you click.
          </p>
          <div className="overflow-hidden rounded-xl border border-violet-500/25 bg-slate-950/80">
            <svg
              ref={svgRef}
              viewBox={VB_STR}
              className="h-auto w-full max-h-[min(70dvh,720px)] cursor-crosshair touch-none select-none"
              onClick={onSvgClick}
              onPointerMove={(e) => {
                if (!placement || !svgRef.current) return;
                const raw = clientToSvgPoint(svgRef.current, e.clientX, e.clientY);
                setCursorBp(applySnap({ x: raw.x, y: raw.y }));
              }}
              onPointerLeave={() => setCursorBp(null)}
              role="presentation"
            >
              <rect width={VB} height={VB} fill="rgb(15,23,42)" />
              <g pointerEvents="none" opacity={0.55}>
                {Array.from({ length: 11 }, (_, i) => (
                  <line
                    key={`gv-${i}`}
                    x1={i * 100}
                    y1={0}
                    x2={i * 100}
                    y2={VB}
                    stroke={
                      i % 5 === 0
                        ? "rgba(148,163,184,0.22)"
                        : "rgba(148,163,184,0.1)"
                    }
                    strokeWidth={i % 5 === 0 ? 1.2 : 0.55}
                  />
                ))}
                {Array.from({ length: 11 }, (_, i) => (
                  <line
                    key={`gh-${i}`}
                    x1={0}
                    y1={i * 100}
                    x2={VB}
                    y2={i * 100}
                    stroke={
                      i % 5 === 0
                        ? "rgba(148,163,184,0.22)"
                        : "rgba(148,163,184,0.1)"
                    }
                    strokeWidth={i % 5 === 0 ? 1.2 : 0.55}
                  />
                ))}
              </g>
              <text
                x={VB / 2}
                y={36}
                textAnchor="middle"
                fill="rgba(148,163,184,0.55)"
                style={{ fontSize: VB * 0.022, fontFamily: "system-ui" }}
              >
                Blueprint space {VB}×{VB} units — major grid 100 · full canvas edge ={" "}
                {STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO * 100}% of map width (linear)
              </text>
              {selected && !placement ? (
                <g
                  pointerEvents="auto"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <AbilityShapePreview
                    b={selected}
                    displayIconUrl={
                      selected.shapeKind === "point"
                        ? abilityMetaForSlot(
                            valorantUiBySlug ?? {},
                            agent.slug,
                            selected.slot,
                          )?.displayIcon ?? null
                        : null
                    }
                  />
                  {(() => {
                    const { x, y } = blueprintStratAnchor(selected);
                    const w = VB * 0.024;
                    return (
                      <g pointerEvents="none" opacity={0.95}>
                        <line
                          x1={x - w}
                          y1={y}
                          x2={x + w}
                          y2={y}
                          stroke="rgb(250, 204, 21)"
                          strokeWidth={VB * 0.003}
                        />
                        <line
                          x1={x}
                          y1={y - w}
                          x2={x}
                          y2={y + w}
                          stroke="rgb(250, 204, 21)"
                          strokeWidth={VB * 0.003}
                        />
                        <circle
                          cx={x}
                          cy={y}
                          r={VB * 0.006}
                          fill="rgb(250, 204, 21)"
                          stroke="rgb(15,23,42)"
                          strokeWidth={VB * 0.0015}
                        />
                      </g>
                    );
                  })()}
                </g>
              ) : null}
              <BlueprintPlacementPreview
                placement={placement}
                cursorBp={cursorBp}
                vb={VB}
                pointPreviewIconUrl={
                  placement?.shapeKind === "point"
                    ? abilityMetaForSlot(
                        valorantUiBySlug ?? {},
                        agent.slug,
                        placement.slot,
                      )?.displayIcon ?? null
                    : null
                }
              />
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
                    pointerEvents="none"
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
              {selected && !placement ? (
                <BlueprintShapeHandles
                  blueprint={selected}
                  vb={VB}
                  svgRef={svgRef}
                  snapStep={snapStep}
                  onChange={updateSelectedGeometry}
                />
              ) : null}
            </svg>
          </div>
          {placement ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-800/40 bg-violet-950/25 px-3 py-2 text-sm text-violet-100/90">
              <span className="min-w-0 flex-1">
                <strong>{placement.name}</strong> ·{" "}
                {slotCompactLabel(valorantUiBySlug, agent.slug, placement.slot)} ·{" "}
                {placement.shapeKind}
                <span className="mt-1 block text-xs font-normal text-violet-300/85">
                  {placementProgressLine(placement.shapeKind, placement.points.length)} ·{" "}
                  {placementHint(placement.shapeKind)}
                </span>
              </span>
              {(placement.shapeKind === "polyline" ||
                placement.shapeKind === "polygon") && (
                <>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    disabled={placement.points.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlacement((prev) =>
                        prev && prev.points.length
                          ? { ...prev, points: prev.points.slice(0, -1) }
                          : prev,
                      );
                    }}
                  >
                    Undo point
                  </button>
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
              Click the canvas after “Start placement”. Select a saved ability to edit it on
              the canvas (only that one is drawn). Keys:{" "}
              <kbd className="rounded border border-violet-700/50 bg-slate-900 px-1">Esc</kbd>{" "}
              cancel placement,{" "}
              <kbd className="rounded border border-violet-700/50 bg-slate-900 px-1">
                Backspace
              </kbd>{" "}
              removes last path point.
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
              {SLOT_VALUES.map((slot) => (
                <option
                  key={slot}
                  value={slot}
                  title={
                    abilityMetaForSlot(
                      valorantUiBySlug ?? {},
                      agent.slug,
                      slot,
                    )?.description ?? undefined
                  }
                >
                  {slotSelectLabel(valorantUiBySlug, agent.slug, slot)}
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
                    <span className="text-xs text-violet-400/80">
                      {slotCompactLabel(valorantUiBySlug, agent.slug, b.slot)}
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
              <div className="mt-3 space-y-3 border-t border-violet-800/35 pt-3">
                <p className="text-[11px] text-violet-400/75">
                  Edit coordinates in{" "}
                  <strong className="text-violet-200/90">blueprint units</strong> (0–
                  {VB}). On strats, the{" "}
                  <strong className="text-violet-200/90">{BLUEPRINT_CANVAS_SIZE} bp</strong>{" "}
                  canvas edge maps to{" "}
                  {STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO * 100}% of map view width;
                  larger shapes in bp render larger on the map (linear scale).
                </p>
                {(() => {
                  const { bboxMaxSide, targetPercentOfMapWidth } =
                    blueprintStratSizingReadout(selected);
                  const w = previewMap
                    ? viewBoxRectFromMap(previewMap).width
                    : null;
                  const perBp =
                    w != null
                      ? (STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO * w) /
                        BLUEPRINT_CANVAS_SIZE
                      : null;
                  return (
                    <p className="rounded-md border border-violet-800/40 bg-slate-950/50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-violet-200/90">
                      BBox max side: {bboxMaxSide.toFixed(3)} bp →{" "}
                      {perBp != null
                        ? (bboxMaxSide * perBp).toFixed(2)
                        : "—"}{" "}
                      map units ({BLUEPRINT_CANVAS_SIZE} bp = {targetPercentOfMapWidth}% of
                      map width).
                      {perBp != null && previewMap && w != null ? (
                        <>
                          {" "}
                          Preview{" "}
                          <span className="text-violet-100/95">{previewMap.name}</span>
                          :{" "}
                          <strong className="text-violet-50/95">
                            {perBp.toFixed(4)}
                          </strong>{" "}
                          map units per 1 bp unit.
                        </>
                      ) : null}
                    </p>
                  );
                })()}
                <div className="space-y-2 rounded-md border border-amber-900/35 bg-slate-950/45 p-2.5">
                  <h4 className="text-[11px] font-semibold text-amber-100/90">
                    Strat map anchor
                  </h4>
                  <p className="text-[10px] leading-snug text-violet-400/80">
                    Yellow cross = where the pin sits and rotation pivot. Default is the
                    shape&apos;s bbox center; set origin below to move the pivot in blueprint
                    space (e.g. cone tip, rectangle corner).
                  </p>
                  {(() => {
                    const a = blueprintStratAnchor(selected);
                    const ox = selected.origin?.x ?? a.x;
                    const oy = selected.origin?.y ?? a.y;
                    const mode = effectiveStratPlacementMode(selected);
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-[10px] text-violet-400/90">
                            Origin X (bp)
                            <input
                              type="number"
                              step="any"
                              value={Math.round(ox * 1000) / 1000}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v)) {
                                  updateSelectedBlueprintMeta({
                                    origin: { x: v, y: oy },
                                  });
                                }
                              }}
                              className="input-field mt-0.5 w-full font-mono text-xs"
                            />
                          </label>
                          <label className="block text-[10px] text-violet-400/90">
                            Origin Y (bp)
                            <input
                              type="number"
                              step="any"
                              value={Math.round(oy * 1000) / 1000}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v)) {
                                  updateSelectedBlueprintMeta({
                                    origin: { x: ox, y: v },
                                  });
                                }
                              }}
                              className="input-field mt-0.5 w-full font-mono text-xs"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary w-full py-1 text-[11px]"
                          onClick={() => updateSelectedBlueprintMeta({ origin: undefined })}
                        >
                          Reset origin to bbox center
                        </button>
                        <label className="block text-[10px] text-violet-400/90">
                          Placement on strats
                          <select
                            value={mode}
                            onChange={(e) =>
                              updateSelectedBlueprintMeta({
                                stratPlacementMode: e.target
                                  .value as StratPlacementMode,
                              })
                            }
                            className="input-field mt-0.5 w-full text-xs"
                          >
                            <option value="center">
                              One click — pin at anchor (no facing)
                            </option>
                            <option value="origin_direction">
                              Two clicks — origin, then aim direction
                            </option>
                          </select>
                        </label>
                      </>
                    );
                  })()}
                </div>
                <BlueprintGeometryFields
                  geometry={selected.geometry}
                  onChange={updateSelectedGeometry}
                />
              </div>
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

      <div className="rounded-xl border border-emerald-900/35 bg-slate-950/50 p-4">
        <h3 className="text-sm font-semibold text-emerald-100/95">
          Map preview (same scale as strat designer)
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-violet-300/65">
          Overlay the selected blueprint on a real map. Same linear scale as strat pins: the{" "}
          {BLUEPRINT_CANVAS_SIZE} bp canvas spans{" "}
          {STRAT_BLUEPRINT_BBOX_TO_MAP_WIDTH_RATIO * 100}% of map width. The blueprint is
          anchored at the yellow pivot (origin); use{" "}
          <strong className="text-violet-200/85">Rotate test</strong> to preview facing.
        </p>
        {maps.length === 0 ? (
          <p className="mt-3 text-sm text-amber-200/80">
            No maps in the database — add maps under Coach → Maps to use this preview.
          </p>
        ) : (
          <>
            <label className="label mt-3 block" htmlFor="ab-preview-map">
              Preview map
            </label>
            <select
              id="ab-preview-map"
              value={previewMap?.id ?? ""}
              onChange={(e) => setPreviewMapId(e.target.value || null)}
              className="input-field mt-1 max-w-md"
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {previewMap ? (
              <div className="mt-4">
                <AbilityBlueprintMapPreview
                  gameMap={previewMap}
                  blueprint={selected}
                  abilityDisplayIconUrl={
                    selected?.shapeKind === "point"
                      ? abilityMetaForSlot(
                          valorantUiBySlug ?? {},
                          agent.slug,
                          selected.slot,
                        )?.displayIcon ?? null
                      : null
                  }
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
