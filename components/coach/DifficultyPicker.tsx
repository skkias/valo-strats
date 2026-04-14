"use client";

const LEVELS = [1, 2, 3] as const;
type Level = (typeof LEVELS)[number];

const COPY: Record<Level, { title: string; hint: string }> = {
  1: { title: "Easy", hint: "Default / simple" },
  2: { title: "Medium", hint: "Some coordination" },
  3: { title: "Hard", hint: "Tight execution" },
};

function clampDifficulty(n: unknown): Level {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x) || x < 1) return 1;
  if (x > 3) return 3;
  return x as Level;
}

/**
 * Three-way strat difficulty: segmented control with labels (replaces plain number input).
 */
export function DifficultyPicker({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: number | string;
  onChange: (level: Level) => void;
  disabled?: boolean;
  /** Optional id of the visible label element (accessibility). */
  labelledBy?: string;
}) {
  const current = clampDifficulty(value);

  return (
    <div
      className="w-full min-w-0"
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : "Strat difficulty"}
    >
      <div className="flex min-w-0 max-w-full gap-2 rounded-xl border border-violet-800/45 bg-slate-950/70 p-2 shadow-inner shadow-violet-950/30 sm:p-2.5">
        {LEVELS.map((n) => {
          const selected = current === n;
          const { title, hint } = COPY[n];
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`flex min-h-13 min-w-0 flex-1 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition focus-visible:ring-2 focus-visible:ring-violet-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 ${
                selected
                  ? "bg-linear-to-b from-violet-600/45 to-violet-800/35 text-white shadow-md shadow-violet-950/40 ring-1 ring-violet-400/35"
                  : "text-violet-200/75 hover:bg-violet-950/55 hover:text-violet-100"
              }`}
            >
              <span className="flex items-baseline gap-1">
                <span className="font-mono text-lg font-bold tabular-nums leading-none">
                  {n}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    selected ? "text-violet-100/90" : "text-violet-400/75"
                  }`}
                >
                  {title}
                </span>
              </span>
              <span
                className={`mt-0.5 line-clamp-1 text-[9px] leading-tight ${
                  selected ? "text-violet-200/75" : "text-violet-500/70"
                }`}
              >
                {hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
