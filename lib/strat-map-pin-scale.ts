/** Persisted coach preference: scales agent + ability pins on the strat map. */
export const COACH_MAP_PIN_SCALE_STORAGE_KEY = "valo-strats:coachMapPinScale";

/** Base radius as a fraction of map viewBox width (100% pin scale baseline). */
export const STRAT_AGENT_TOKEN_VB_FRAC = 0.007;

/** Agent label font size vs viewBox width. */
export const STRAT_AGENT_LABEL_VB_FRAC = 0.013;

/** Ability fallback circle radius vs viewBox width. */
export const STRAT_ABILITY_PIN_VB_FRAC = 0.01;

/** Ability slot label font vs viewBox width. */
export const STRAT_ABILITY_LABEL_VB_FRAC = 0.011;

export const COACH_MAP_PIN_SCALE_DEFAULT = 1;

export const COACH_MAP_PIN_SCALE_MIN = 0.65;

export const COACH_MAP_PIN_SCALE_MAX = 1.4;

export function clampCoachMapPinScale(n: number): number {
  if (!Number.isFinite(n)) return COACH_MAP_PIN_SCALE_DEFAULT;
  return Math.min(
    COACH_MAP_PIN_SCALE_MAX,
    Math.max(COACH_MAP_PIN_SCALE_MIN, n),
  );
}

function parseStored(raw: string | null): number {
  if (raw == null || raw === "") return COACH_MAP_PIN_SCALE_DEFAULT;
  const n = Number.parseFloat(raw);
  return clampCoachMapPinScale(n);
}

/** Safe on server and before hydration (returns default). */
export function readCoachMapPinScale(): number {
  if (typeof window === "undefined") return COACH_MAP_PIN_SCALE_DEFAULT;
  try {
    return parseStored(window.localStorage.getItem(COACH_MAP_PIN_SCALE_STORAGE_KEY));
  } catch {
    return COACH_MAP_PIN_SCALE_DEFAULT;
  }
}

export function writeCoachMapPinScale(scale: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COACH_MAP_PIN_SCALE_STORAGE_KEY,
      String(clampCoachMapPinScale(scale)),
    );
    window.dispatchEvent(new Event("valo-strats:coach-map-pin-scale"));
  } catch {
    /* ignore quota / private mode */
  }
}

export function stratAgentTokenDimensions(
  vbWidth: number,
  pinScale: number,
): { tokenR: number; fontAgent: number } {
  const s = clampCoachMapPinScale(pinScale);
  return {
    tokenR: vbWidth * STRAT_AGENT_TOKEN_VB_FRAC * s,
    fontAgent: Math.max(8, vbWidth * STRAT_AGENT_LABEL_VB_FRAC * s),
  };
}

export function stratAbilityPinDimensions(
  vbWidth: number,
  pinScale: number,
): { abilityR: number; fontAbility: number } {
  const s = clampCoachMapPinScale(pinScale);
  return {
    abilityR: vbWidth * STRAT_ABILITY_PIN_VB_FRAC * s,
    fontAbility: Math.max(8, vbWidth * STRAT_ABILITY_LABEL_VB_FRAC * s),
  };
}
