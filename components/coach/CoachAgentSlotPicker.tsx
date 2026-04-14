"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent } from "@/types/catalog";

/**
 * Strat editor: pick one catalog agent via a button that opens a portrait grid (4 columns, A–Z).
 */
export function CoachAgentSlotPicker({
  slotIndex,
  value,
  agents,
  disabled,
  required,
  onChange,
}: {
  slotIndex: number;
  value: string;
  agents: Agent[];
  disabled?: boolean;
  required?: boolean;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sortedAgents = useMemo(
    () =>
      [...agents].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [agents],
  );

  const selected = useMemo(
    () => agents.find((a) => a.slug === value),
    [agents, value],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative min-w-0" ref={rootRef}>
      {required ? (
        <input
          type="text"
          required
          value={value}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      ) : null}
      <span className="sr-only" id={`coach-agent-slot-${slotIndex}-label`}>
        Agent {slotIndex + 1}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`coach-agent-slot-${slotIndex}-label`}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg border border-violet-800/50 bg-slate-950/60 px-2 py-2 text-left text-sm text-slate-100 transition outline-none ring-violet-500/0 focus:border-violet-500/70 focus:ring-2 focus:ring-violet-500/25 disabled:cursor-not-allowed disabled:opacity-45 ${
          open ? "border-violet-500/55 ring-2 ring-violet-500/20" : ""
        }`}
      >
        {selected ? (
          <>
            {selected.portrait_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog URLs from coach
              <img
                src={selected.portrait_url}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-violet-700/40"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-950/80 text-xs font-bold text-violet-100 ring-1 ring-violet-700/40">
                {selected.name.slice(0, 1)}
              </div>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">
              {selected.name}
            </span>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-violet-600/45 bg-slate-950/80 text-[10px] text-violet-500/70">
              ?
            </div>
            <span className="min-w-0 flex-1 truncate text-violet-400/70">
              Choose agent…
            </span>
          </>
        )}
        <span
          className={`shrink-0 text-violet-400/60 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[min(70dvh,440px)] w-[min(100%,288px)] overflow-y-auto overscroll-contain rounded-xl border border-violet-700/50 bg-slate-950 p-2 shadow-2xl shadow-violet-950/50 sm:w-[288px]"
          role="listbox"
          aria-label={`Choose agent for slot ${slotIndex + 1}`}
        >
          <div className="grid grid-cols-4 gap-2">
            {!required ? (
              <button
                type="button"
                role="option"
                aria-selected={value === ""}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition hover:border-violet-500/50 hover:bg-violet-950/40 ${
                  value === ""
                    ? "border-cyan-500/60 bg-cyan-950/30 ring-1 ring-cyan-500/35"
                    : "border-violet-800/45 bg-slate-950/70"
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-violet-600/50 text-[10px] text-violet-500/80">
                  —
                </div>
                <span className="line-clamp-2 w-full text-[8px] font-medium leading-tight text-violet-300/85">
                  Empty
                </span>
              </button>
            ) : null}
            {sortedAgents.map((a) => {
              const on = a.slug === value;
              return (
                <button
                  key={a.slug}
                  type="button"
                  role="option"
                  aria-selected={on}
                  title={a.name}
                  onClick={() => {
                    onChange(a.slug);
                    setOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition hover:border-violet-500/50 hover:bg-violet-950/40 ${
                    on
                      ? "border-cyan-500/60 bg-cyan-950/30 ring-1 ring-cyan-500/35"
                      : "border-violet-800/45 bg-slate-950/70"
                  }`}
                >
                  {a.portrait_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.portrait_url}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover ring-1 ring-violet-800/40"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-950/80 text-xs font-bold text-violet-100 ring-1 ring-violet-800/40">
                      {a.name.slice(0, 1)}
                    </div>
                  )}
                  <span className="line-clamp-2 w-full text-[8px] font-medium leading-tight text-violet-200/90">
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
