import type { StratPlacedAbility } from "@/types/strat";

export function abbrevAgentName(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
}

export function roleAccent(role: string): { fill: string; stroke: string } {
  const r = role.toLowerCase();
  if (r.includes("duelist"))
    return { fill: "rgba(251,113,133,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("initiator"))
    return { fill: "rgba(251,191,36,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("controller"))
    return { fill: "rgba(56,189,248,0.95)", stroke: "rgba(255,255,255,0.92)" };
  if (r.includes("sentinel"))
    return { fill: "rgba(148,163,184,0.95)", stroke: "rgba(255,255,255,0.92)" };
  return { fill: "rgba(167,139,250,0.95)", stroke: "rgba(255,255,255,0.92)" };
}

export function abilitySlotStyle(slot: StratPlacedAbility["slot"]): {
  fill: string;
  stroke: string;
} {
  switch (slot) {
    case "q":
      return { fill: "rgba(34,211,238,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "e":
      return { fill: "rgba(74,222,128,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "c":
      return { fill: "rgba(251,191,36,0.95)", stroke: "rgba(255,255,255,0.9)" };
    case "x":
      return { fill: "rgba(248,113,113,0.95)", stroke: "rgba(255,255,255,0.9)" };
    default:
      return { fill: "rgba(255,255,255,0.85)", stroke: "rgba(0,0,0,0.4)" };
  }
}

export function abilitySlotLabel(slot: StratPlacedAbility["slot"]): string {
  return slot.toUpperCase();
}
