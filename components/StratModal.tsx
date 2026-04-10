"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import type { Strat } from "@/types/strat";
import {
  X,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Swords,
  Shield,
} from "lucide-react";

export function StratModal({
  strat,
  onClose,
}: {
  strat: Strat | null;
  onClose: () => void;
}) {
  const images = strat?.images?.filter((i) => i.url) ?? [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!strat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [strat, onClose]);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (images.length === 0) return;
      setIndex((i) => (i + dir + images.length) % images.length);
    },
    [images.length],
  );

  if (!strat) return null;

  const current = images[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="strat-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-violet-500/25 bg-slate-950/95 shadow-2xl shadow-violet-950/40 ring-1 ring-violet-500/10">
        <div className="flex items-start justify-between gap-4 border-b border-violet-500/15 p-5">
          <div>
            <h2
              id="strat-modal-title"
              className="text-xl font-semibold text-white"
            >
              {strat.title}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-violet-200/65">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {strat.map}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  strat.side === "atk"
                    ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/20"
                    : "bg-sky-500/15 text-sky-300"
                }`}
              >
                {strat.side === "atk" ? (
                  <Swords className="h-3.5 w-3.5" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                {strat.side === "atk" ? "Attack" : "Defense"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-violet-300/70 transition hover:bg-violet-950/80 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
          {images.length > 0 && current && (
            <div className="relative aspect-video w-full bg-black">
              <Image
                src={current.url}
                alt={current.label || strat.title}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 48rem"
                priority
              />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                  <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-zinc-300">
                    {current.label && (
                      <span className="rounded bg-black/60 px-2 py-1">
                        {current.label}
                      </span>
                    )}
                    <span className="ml-2 text-zinc-500">
                      {index + 1} / {images.length}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-6 p-5">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                Summary
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-200/90">
                {strat.description}
              </p>
            </section>

            {strat.steps.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                  Round plan
                </h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-200/90">
                  {strat.steps.map((s, i) => (
                    <li
                      key={i}
                      className="leading-relaxed [&_strong]:text-violet-200"
                      dangerouslySetInnerHTML={{ __html: s.text }}
                    />
                  ))}
                </ol>
              </section>
            )}

            {strat.roles.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                  Roles
                </h3>
                <ul className="mt-3 space-y-2">
                  {strat.roles.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-violet-500/20 bg-violet-950/25 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-violet-200">
                        {r.agent}
                      </span>
                      <span className="text-violet-400/45"> — </span>
                      <span className="text-slate-200/85">{r.desc}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {strat.notes && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-400/55">
                  Coach notes
                </h3>
                <p className="mt-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-950/20 p-3 text-sm text-fuchsia-100/90">
                  {strat.notes}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
