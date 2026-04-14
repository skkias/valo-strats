"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Agent } from "@/types/catalog";

const POPOUT_W = 288;
const POPOUT_MARGIN = 8;

/**
 * Strat editor: pick one catalog agent via a button that opens a portrait grid (4 columns, A–Z).
 * Popout is portaled to `document.body` with fixed positioning so coach layout overflow does not clip it.
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoutRef = useRef<HTMLDivElement>(null);
  const [popoutPos, setPopoutPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  const updatePopoutPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    let left = rect.left;
    if (left + POPOUT_W > window.innerWidth - POPOUT_MARGIN) {
      left = Math.max(
        POPOUT_MARGIN,
        Math.min(rect.right - POPOUT_W, window.innerWidth - POPOUT_W - POPOUT_MARGIN),
      );
    }
    left = Math.max(
      POPOUT_MARGIN,
      Math.min(left, window.innerWidth - POPOUT_W - POPOUT_MARGIN),
    );
    setPopoutPos({ top: rect.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open || disabled) return;
    updatePopoutPosition();
  }, [open, disabled, updatePopoutPosition, sortedAgents.length]);

  useEffect(() => {
    if (!open || disabled) return;
    window.addEventListener("resize", updatePopoutPosition);
    window.addEventListener("scroll", updatePopoutPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoutPosition);
      window.removeEventListener("scroll", updatePopoutPosition, true);
    };
  }, [open, disabled, updatePopoutPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popoutRef.current?.contains(t)) return;
      setOpen(false);
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

  const popout =
    open && !disabled && popoutPos != null ? (
      <div
        ref={popoutRef}
        className="fixed max-h-[min(70dvh,440px)] w-[min(100vw-16px,288px)] overflow-y-auto overscroll-contain rounded-xl border border-violet-700/50 bg-slate-950 p-2 shadow-2xl shadow-violet-950/50 sm:w-[288px]"
        style={{
          top: popoutPos.top,
          left: popoutPos.left,
          zIndex: 200,
        }}
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
    ) : null;

  return (
    <div className="relative min-w-0">
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
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`coach-agent-slot-${slotIndex}-label`}
        onClick={() => {
          if (disabled) return;
          setPopoutPos(null);
          setOpen((o) => !o);
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

      {typeof document !== "undefined" && popout != null
        ? createPortal(popout, document.body)
        : null}
    </div>
  );
}
