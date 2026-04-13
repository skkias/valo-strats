import type {
  StratPlacedAbility,
  StratPlacedAgent,
  StratStageLayerVisibility,
  StratStage,
  StratStageTransition,
  StratVisionConeWidth,
} from "@/types/strat";
import {
  DEFAULT_STRAT_STAGE_LAYER_VISIBILITY,
  normalizeStratStageLayerVisibility,
} from "@/lib/strat-stage-layer-visibility";
import { normalizeStratDoorOpenByOverlayId } from "@/lib/strat-stage-door-states";

const TRANSITIONS: StratStageTransition[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
];

const ABILITY_SLOTS: StratPlacedAbility["slot"][] = ["q", "e", "c", "x"];
const VISION_CONE_WIDTHS: StratVisionConeWidth[] = ["wide", "thin"];

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `st-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyStratStage(index: number): StratStage {
  return {
    id: newId(),
    title: `Stage ${index + 1}`,
    notes: "",
    agents: [],
    abilities: [],
    mapLayerVisibility: { ...DEFAULT_STRAT_STAGE_LAYER_VISIBILITY },
    doorOpenByOverlayId: {},
    transition: "fade",
    transitionMs: 450,
  };
}

export function defaultStratStages(): StratStage[] {
  return [createEmptyStratStage(0)];
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function normalizeTransition(raw: unknown): StratStageTransition {
  return typeof raw === "string" && TRANSITIONS.includes(raw as StratStageTransition)
    ? (raw as StratStageTransition)
    : "fade";
}

function normalizeAgent(raw: unknown): StratPlacedAgent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  const agentSlug =
    typeof o.agentSlug === "string"
      ? o.agentSlug
      : typeof o.agent_slug === "string"
        ? o.agent_slug
        : "";
  if (!agentSlug) return null;
  const x = isFiniteNum(o.x) ? o.x : 0;
  const y = isFiniteNum(o.y) ? o.y : 0;
  const widthRaw = o.visionConeWidth ?? o.vision_cone_width;
  const visionConeWidth =
    typeof widthRaw === "string" &&
    VISION_CONE_WIDTHS.includes(widthRaw as StratVisionConeWidth)
      ? (widthRaw as StratVisionConeWidth)
      : undefined;
  const rotRaw = o.visionConeRotationDeg ?? o.vision_cone_rotation_deg;
  const visionConeRotationDeg = isFiniteNum(rotRaw) ? rotRaw : undefined;
  const out: StratPlacedAgent = { id, agentSlug, x, y };
  if (visionConeWidth) {
    out.visionConeWidth = visionConeWidth;
    out.visionConeRotationDeg = visionConeRotationDeg ?? 0;
  }
  return out;
}

function normalizeAbility(raw: unknown): StratPlacedAbility | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  const agentSlug =
    typeof o.agentSlug === "string"
      ? o.agentSlug
      : typeof o.agent_slug === "string"
        ? o.agent_slug
        : "";
  const slotRaw = o.slot;
  const slot =
    typeof slotRaw === "string" && ABILITY_SLOTS.includes(slotRaw as StratPlacedAbility["slot"])
      ? (slotRaw as StratPlacedAbility["slot"])
      : null;
  if (!agentSlug || !slot) return null;
  const x = isFiniteNum(o.x) ? o.x : 0;
  const y = isFiniteNum(o.y) ? o.y : 0;
  const rotRaw = o.rotationDeg ?? o.rotation_deg;
  const rotationDeg = isFiniteNum(rotRaw) ? rotRaw : undefined;
  const out: StratPlacedAbility = { id, agentSlug, slot, x, y };
  if (rotationDeg !== undefined) out.rotationDeg = rotationDeg;
  return out;
}

function normalizeStage(raw: unknown, index: number): StratStage {
  if (!raw || typeof raw !== "object") return createEmptyStratStage(index);
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : newId();
  const title =
    typeof o.title === "string" && o.title.trim()
      ? o.title.trim()
      : `Stage ${index + 1}`;
  const notes = typeof o.notes === "string" ? o.notes : "";
  const agentsIn = Array.isArray(o.agents) ? o.agents : [];
  const abilitiesIn = Array.isArray(o.abilities) ? o.abilities : [];
  const agentsRaw = agentsIn
    .map(normalizeAgent)
    .filter((x): x is StratPlacedAgent => x != null);
  const seenSlugs = new Set<string>();
  const agents: StratPlacedAgent[] = [];
  for (const a of agentsRaw) {
    if (seenSlugs.has(a.agentSlug)) continue;
    seenSlugs.add(a.agentSlug);
    agents.push(a);
  }
  const abilities = abilitiesIn
    .map(normalizeAbility)
    .filter((x): x is StratPlacedAbility => x != null);
  const transition = normalizeTransition(o.transition);
  const mapLayerVisibility: StratStageLayerVisibility =
    normalizeStratStageLayerVisibility(
      o.mapLayerVisibility ?? o.map_layer_visibility,
    );
  const doorOpenByOverlayId = normalizeStratDoorOpenByOverlayId(
    o.doorOpenByOverlayId ?? o.door_open_by_overlay_id,
  );
  const transitionMsRaw = o.transitionMs ?? o.transition_ms;
  const transitionMs =
    typeof transitionMsRaw === "number" &&
    Number.isFinite(transitionMsRaw) &&
    transitionMsRaw >= 0
      ? Math.min(4000, Math.max(0, Math.round(transitionMsRaw)))
      : 450;

  const stage: StratStage = {
    id,
    title,
    notes,
    agents,
    abilities,
    mapLayerVisibility,
    transition,
    transitionMs,
  };
  if (Object.keys(doorOpenByOverlayId).length > 0) {
    stage.doorOpenByOverlayId = doorOpenByOverlayId;
  }
  return stage;
}

/** Safe for DB rows and API payloads. */
export function normalizeStratStages(raw: unknown): StratStage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultStratStages();
  }
  return raw.map((s, i) => normalizeStage(s, i));
}
