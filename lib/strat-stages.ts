import type {
  StratPlacedAbility,
  StratPlacedAgent,
  StratStage,
  StratStageTransition,
} from "@/types/strat";

const TRANSITIONS: StratStageTransition[] = [
  "none",
  "fade",
  "slide-left",
  "slide-right",
];

const ABILITY_SLOTS: StratPlacedAbility["slot"][] = ["q", "e", "c", "x"];

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
  return { id, agentSlug, x, y };
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
  return { id, agentSlug, slot, x, y };
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
  const agents = agentsIn
    .map(normalizeAgent)
    .filter((x): x is StratPlacedAgent => x != null);
  const abilities = abilitiesIn
    .map(normalizeAbility)
    .filter((x): x is StratPlacedAbility => x != null);
  const transition = normalizeTransition(o.transition);
  const transitionMsRaw = o.transitionMs ?? o.transition_ms;
  const transitionMs =
    typeof transitionMsRaw === "number" &&
    Number.isFinite(transitionMsRaw) &&
    transitionMsRaw >= 0
      ? Math.min(4000, Math.max(0, Math.round(transitionMsRaw)))
      : 450;

  return {
    id,
    title,
    notes,
    agents,
    abilities,
    transition,
    transitionMs,
  };
}

/** Safe for DB rows and API payloads. */
export function normalizeStratStages(raw: unknown): StratStage[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return defaultStratStages();
  }
  return raw.map((s, i) => normalizeStage(s, i));
}
