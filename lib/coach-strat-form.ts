import type {
  Strat,
  StratImage,
  StratRole,
  StratSide,
  StratStage,
} from "@/types/strat";
import type { GameMap } from "@/types/catalog";
import { defaultStratStages } from "@/lib/strat-stages";

const EMPTY_SLOTS: [string, string, string, string, string] = ["", "", "", "", ""];

export type CoachStratFormState = {
  title: string;
  map_id: string;
  side: StratSide;
  agentSlots: [string, string, string, string, string];
  difficulty: string;
  description: string;
  steps: string;
  roles: string;
  notes: string;
  tags: string;
  images: StratImage[];
  stratStages: StratStage[];
};

export type MapStratGroup = {
  key: string;
  label: string;
  sort: number;
  strats: Strat[];
};

export function parseRoles(text: string): StratRole[] {
  return text.split("\n").reduce<StratRole[]>((acc, line) => {
    const t = line.trim();
    if (!t) return acc;
    const pipe = t.indexOf("|");
    if (pipe !== -1) {
      acc.push({
        agent: t.slice(0, pipe).trim(),
        desc: t.slice(pipe + 1).trim(),
      });
      return acc;
    }
    const dash = t.indexOf(" - ");
    if (dash !== -1) {
      acc.push({
        agent: t.slice(0, dash).trim(),
        desc: t.slice(dash + 3).trim(),
      });
      return acc;
    }
    acc.push({ agent: t, desc: "" });
    return acc;
  }, []);
}

export function emptyCoachForm(): CoachStratFormState {
  return {
    title: "",
    map_id: "",
    side: "atk",
    agentSlots: [...EMPTY_SLOTS] as [string, string, string, string, string],
    difficulty: "2",
    description: "",
    steps: "",
    roles: "",
    notes: "",
    tags: "",
    images: [{ url: "", label: "" }],
    stratStages: defaultStratStages(),
  };
}

export function resolveMapIdForStrat(s: Strat, maps: GameMap[]): string {
  if (s.map_id) return s.map_id;
  const t = s.map.trim().toLowerCase();
  return maps.find((m) => m.name === s.map || m.slug === t)?.id ?? "";
}

export function slotsFromStratAgents(
  agents: string[],
): [string, string, string, string, string] {
  const out = [...EMPTY_SLOTS] as [string, string, string, string, string];
  for (let i = 0; i < 5; i++) out[i] = agents[i] ?? "";
  return out;
}

export function groupStratsByMap(strats: Strat[], maps: GameMap[]): MapStratGroup[] {
  const orderById = new Map(maps.map((m, i) => [m.id, i]));
  const buckets = new Map<string, MapStratGroup>();

  for (const s of strats) {
    const resolvedId = s.map_id ?? resolveMapIdForStrat(s, maps);
    const meta = resolvedId ? maps.find((m) => m.id === resolvedId) : undefined;
    const key = meta?.id ?? `legacy:${(s.map || "unknown").toLowerCase()}`;
    const label = meta?.name ?? (s.map || "Unknown map");
    const sort = meta ? (orderById.get(meta.id) ?? 500) : 600;
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, sort, strats: [] });
    }
    buckets.get(key)!.strats.push(s);
  }
  for (const g of buckets.values()) {
    g.strats.sort((a, b) => a.title.localeCompare(b.title));
  }
  return [...buckets.values()].sort(
    (a, b) => a.sort - b.sort || a.label.localeCompare(b.label),
  );
}
