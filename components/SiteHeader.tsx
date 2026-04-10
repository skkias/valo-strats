"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-violet-500/15 bg-slate-950/75 backdrop-blur-md">
      <div className="overflow-x-auto [scrollbar-gutter:stable]">
        <div className="flex h-14 w-max min-w-full flex-nowrap items-center gap-3 px-4 sm:gap-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold tracking-tight text-white drop-shadow-[0_0_18px_rgba(167,139,250,0.35)] transition hover:text-violet-300"
          >
            Valo Strats
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
    </header>
  );
}
