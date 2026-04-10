import type { CSSProperties } from "react";

/**
 * Defaults for the /docs viewer. Override with DOCS_THEME_* env vars (server-side; no NEXT_PUBLIC_ needed).
 * Restart the dev server after changing .env.
 * Palette aligned with the main app (deep indigo / violet “esports” dark theme).
 */
export const DOCS_THEME_DEFAULTS = {
  accent: "#8b5cf6",
  bgPage: "#0b0618",
  surface: "rgba(49, 46, 129, 0.38)",
  surfaceStrong: "rgba(15, 23, 42, 0.88)",
  border: "rgba(109, 40, 217, 0.35)",
  borderStrong: "rgba(167, 139, 250, 0.35)",
  text: "#ddd6fe",
  textHeading: "#f5f3ff",
  textMuted: "rgba(196, 181, 253, 0.72)",
  textFaint: "rgba(167, 139, 250, 0.45)",
  codeBg: "rgba(30, 27, 75, 0.85)",
  codeText: "#c084fc",
  quoteBorder: "rgba(139, 92, 246, 0.55)",
  folderIcon: "#c084fc",
  proseMaxWidth: "42rem",
  layoutMaxWidth: "88rem",
  sidebarWidth: "18rem",
  radiusSm: "6",
  radiusMd: "10",
  radiusLg: "14",
  headingScale: "1",
} as const;

function pick(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim();
  return raw && raw.length > 0 ? raw : fallback;
}

function pickPx(envKey: string, fallbackRaw: string): string {
  const raw = process.env[envKey]?.trim();
  const base = raw && raw.length > 0 ? raw : fallbackRaw;
  if (/^\d+(\.\d+)?$/.test(base)) return `${base}px`;
  return base;
}

function pickUnitlessNumber(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim();
  const v = raw && raw.length > 0 ? raw : fallback;
  return /^\d+(\.\d+)?$/.test(v) ? v : fallback;
}

/**
 * Inline CSS custom properties for `.docs-theme-root` (injected in `app/docs/layout.tsx`).
 */
export function getDocsThemeCSSVariables(): CSSProperties {
  const d = DOCS_THEME_DEFAULTS;
  return {
    "--docs-accent": pick("DOCS_THEME_ACCENT", d.accent),
    "--docs-bg-page": pick("DOCS_THEME_BG_PAGE", d.bgPage),
    "--docs-surface": pick("DOCS_THEME_SURFACE", d.surface),
    "--docs-surface-strong": pick("DOCS_THEME_SURFACE_STRONG", d.surfaceStrong),
    "--docs-border": pick("DOCS_THEME_BORDER", d.border),
    "--docs-border-strong": pick("DOCS_THEME_BORDER_STRONG", d.borderStrong),
    "--docs-text": pick("DOCS_THEME_TEXT", d.text),
    "--docs-text-heading": pick("DOCS_THEME_TEXT_HEADING", d.textHeading),
    "--docs-text-muted": pick("DOCS_THEME_TEXT_MUTED", d.textMuted),
    "--docs-text-faint": pick("DOCS_THEME_TEXT_FAINT", d.textFaint),
    "--docs-code-bg": pick("DOCS_THEME_CODE_BG", d.codeBg),
    "--docs-code-text": pick("DOCS_THEME_CODE_TEXT", d.codeText),
    "--docs-quote-border": pick("DOCS_THEME_QUOTE_BORDER", d.quoteBorder),
    "--docs-folder-icon": pick("DOCS_THEME_FOLDER_ICON", d.folderIcon),
    "--docs-prose-max-w": pick("DOCS_PROSE_MAX_WIDTH", d.proseMaxWidth),
    "--docs-layout-max-w": pick("DOCS_LAYOUT_MAX_WIDTH", d.layoutMaxWidth),
    "--docs-sidebar-w": pick("DOCS_SIDEBAR_WIDTH", d.sidebarWidth),
    "--docs-radius-sm": pickPx("DOCS_RADIUS_SM", d.radiusSm),
    "--docs-radius-md": pickPx("DOCS_RADIUS_MD", d.radiusMd),
    "--docs-radius-lg": pickPx("DOCS_RADIUS_LG", d.radiusLg),
    "--docs-heading-scale": pickUnitlessNumber(
      "DOCS_HEADING_SCALE",
      d.headingScale,
    ),
    "--docs-font-heading": pick("DOCS_FONT_HEADING", "inherit"),
    "--docs-font-body": pick("DOCS_FONT_BODY", "inherit"),
  } as CSSProperties;
}
