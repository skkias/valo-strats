import type { Strat } from "@/types/strat";
import { MapPin, Swords, Shield } from "lucide-react";

function DifficultyDots({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`Difficulty ${value} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-4 rounded-sm ${
            n <= value ? "bg-violet-500" : "bg-violet-900/50"
          }`}
        />
      ))}
    </div>
  );
}

function displayAgent(slug: string, names: Record<string, string>) {
  return names[slug] ?? slug;
}

export function StratCard({
  strat,
  agentNamesBySlug = {},
  agentPortraitsBySlug = {},
  onOpen,
}: {
  strat: Strat;
  agentNamesBySlug?: Record<string, string>;
  /** Optional face-card image URLs keyed by agent slug (from coach / DB). */
  agentPortraitsBySlug?: Record<string, string>;
  onOpen: (s: Strat) => void;
}) {
  const excerpt =
    strat.description.length > 140
      ? `${strat.description.slice(0, 140)}…`
      : strat.description;

  return (
    <button
      type="button"
      onClick={() => onOpen(strat)}
      className="group flex w-full flex-col gap-3 rounded-xl border border-violet-500/20 bg-slate-950/50 p-4 text-left shadow-lg shadow-violet-950/20 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-violet-950/25 hover:shadow-violet-500/10"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-100 group-hover:text-white">
            {strat.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-violet-300/55">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {strat.map}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                strat.side === "atk"
                  ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/25"
                  : "bg-sky-500/15 text-sky-300"
              }`}
            >
              {strat.side === "atk" ? (
                <Swords className="h-3 w-3" aria-hidden />
              ) : (
                <Shield className="h-3 w-3" aria-hidden />
              )}
              {strat.side === "atk" ? "Attack" : "Defense"}
            </span>
          </p>
        </div>
        <DifficultyDots value={strat.difficulty} />
      </div>
      <p className="text-sm leading-relaxed text-violet-200/70">{excerpt}</p>
      {strat.agents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {strat.agents.slice(0, 6).map((a) => {
            const portrait = agentPortraitsBySlug[a];
            return (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-800/40 bg-violet-950/40 py-0.5 pl-0.5 pr-2 text-xs text-violet-200/90"
              >
                {portrait ? (
                  <img
                    src={portrait}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <span className="pr-0.5">
                  {displayAgent(a, agentNamesBySlug)}
                </span>
              </span>
            );
          })}
          {strat.agents.length > 6 && (
            <span className="text-xs text-violet-400/60">
              +{strat.agents.length - 6}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
