const DEFAULT_AGENT_THEME_COLOR = "#a78bfa";

export function normalizeAgentThemeColor(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_AGENT_THEME_COLOR;
  const c = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1]!;
    const g = c[2]!;
    const b = c[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DEFAULT_AGENT_THEME_COLOR;
}

export { DEFAULT_AGENT_THEME_COLOR };
