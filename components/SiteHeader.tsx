"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, Map as MapIcon, Users } from "lucide-react";
import { lockCoach } from "@/app/coach/actions";

const coachTabs = [
  { href: "/coach", label: "Strats", match: (p: string) => p === "/coach" },
  {
    href: "/coach/maps",
    label: "Map shapes",
    match: (p: string) => p.startsWith("/coach/maps"),
  },
];

function isCoachMapEditPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  return (
    parts.length === 3 &&
    parts[0] === "coach" &&
    parts[1] === "maps" &&
    parts[2].length > 0
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const showCoachTabs =
    pathname.startsWith("/coach") && !pathname.startsWith("/coach/login");
  const showMapBack = isCoachMapEditPath(pathname);
  const showCoachStratsBar = pathname === "/coach";

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-violet-500/15 bg-slate-950/75 backdrop-blur-md">
      <div className="overflow-x-auto [scrollbar-gutter:stable]">
        <div className="flex h-14 w-max min-w-full flex-nowrap items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold tracking-tight text-white drop-shadow-[0_0_18px_rgba(167,139,250,0.35)] transition hover:text-violet-300"
          >
            Hexecute
          </Link>

          <nav
            className="flex shrink-0 items-center gap-4 text-sm sm:gap-6"
            aria-label="Site"
          >
            <Link
              href="/"
              className="text-violet-200/65 transition hover:text-white"
            >
              Browse
            </Link>
            <Link
              href="/coach"
              className="text-violet-200/65 transition hover:text-white"
            >
              Coach
            </Link>
            <Link
              href="/docs"
              className="text-violet-200/65 transition hover:text-white"
            >
              Documentation
            </Link>
          </nav>

          {showCoachTabs && (
            <>
              <span
                className="h-6 w-px shrink-0 bg-violet-500/25"
                aria-hidden
              />
              <nav
                className="flex shrink-0 items-center gap-1"
                aria-label="Coach sections"
              >
                {coachTabs.map((t) => {
                  const active = t.match(pathname);
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                          : "text-violet-200/70 hover:bg-violet-950/50 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </nav>
            </>
          )}

          {showMapBack && (
            <>
              <span
                className="h-6 w-px shrink-0 bg-violet-500/25"
                aria-hidden
              />
              <Link
                href="/coach/maps"
                className="shrink-0 text-sm text-violet-300/70 transition hover:text-white"
              >
                ← All maps
              </Link>
            </>
          )}
        </div>
      </div>

      {showCoachStratsBar && (
        <div className="border-t border-violet-500/10 bg-slate-950/80 px-4 py-2 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-[1_1_12rem]">
              <p className="text-sm font-semibold leading-tight text-white">
                Coach dashboard
              </p>
              <p className="line-clamp-2 text-[11px] leading-snug text-violet-300/75 sm:line-clamp-1 sm:text-xs">
                Password unlock · edits publish to Browse after save.
              </p>
            </div>
            <nav
              className="ml-auto flex flex-wrap items-center gap-2"
              aria-label="Coach quick actions"
            >
              <Link
                href="/coach/maps"
                className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
              >
                <MapIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Map shapes
              </Link>
              <Link
                href="/coach/agents"
                className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
              >
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Agents
              </Link>
              <form action={lockCoach}>
                <button
                  type="submit"
                  className="btn-secondary inline-flex items-center gap-1.5 py-1.5 text-xs sm:text-sm"
                >
                  <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Lock
                </button>
              </form>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
