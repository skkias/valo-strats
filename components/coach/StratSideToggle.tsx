"use client";

import type { StratSide } from "@/types/strat";
import { Swords, Shield } from "lucide-react";

/**
 * Attack / Defense as a physical-style toggle (replaces a two-option select).
 * Labels stack on the left; the switch stays on the right so narrow widths wrap text
 * instead of squeezing the control between side names.
 */
export function StratSideToggle({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: StratSide;
  onChange: (side: StratSide) => void;
  disabled?: boolean;
  labelledBy?: string;
}) {
  const isAttack = value === "atk";

  return (
    <div className="w-full min-w-0" role="group" aria-labelledby={labelledBy}>
      <div className="flex min-w-0 flex-row items-center gap-3 sm:gap-4">
        <div className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-1">
          <span
            className={`flex min-w-0 items-start gap-1.5 text-sm font-semibold transition ${
              isAttack ? "text-violet-100" : "text-violet-500/45"
            }`}
          >
            <Swords
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <span className="min-w-0 flex-1 wrap-break-word leading-snug">
              Attack
            </span>
          </span>
          <span
            className={`flex min-w-0 items-start gap-1.5 text-sm font-semibold transition ${
              !isAttack ? "text-sky-200" : "text-violet-500/45"
            }`}
          >
            <Shield
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <span className="min-w-0 flex-1 wrap-break-word leading-snug">
              Defense
            </span>
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={!isAttack}
          aria-label={
            isAttack
              ? "Side is Attack; switch to Defense"
              : "Side is Defense; switch to Attack"
          }
          disabled={disabled}
          onClick={() => onChange(isAttack ? "def" : "atk")}
          className={`relative inline-flex h-10 w-18 shrink-0 cursor-pointer rounded-full border px-1 transition focus-visible:ring-2 focus-visible:ring-violet-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 ${
            isAttack
              ? "border-violet-500/45 bg-violet-950/90"
              : "border-sky-500/40 bg-sky-950/60"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-1 left-1 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform duration-200 ease-out ${
              isAttack
                ? "translate-x-0 bg-violet-100 text-violet-950"
                : "translate-x-8 bg-sky-100 text-sky-950"
            }`}
          >
            {isAttack ? (
              <Swords className="h-3.5 w-3.5" />
            ) : (
              <Shield className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
