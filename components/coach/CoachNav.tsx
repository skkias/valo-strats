"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/coach", label: "Strats", match: (p: string) => p === "/coach" },
  {
    href: "/coach/maps",
    label: "Map shapes",
    match: (p: string) => p.startsWith("/coach/maps"),
  },
];

export function CoachNav() {
  const pathname = usePathname();
  return (
    <nav
      className="shrink-0 border-b border-violet-500/20 bg-slate-950/55 backdrop-blur-sm"
      aria-label="Coach sections"
    >
      <div className="mx-auto flex max-w-6xl gap-1 px-4 py-2">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
                  : "text-violet-200/70 hover:bg-violet-950/50 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
