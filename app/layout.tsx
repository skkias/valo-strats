import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Valo Strats",
  description: "Team Valorant strategies — visuals and round plans in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}
    >
      <body className="flex h-dvh max-h-dvh flex-col overflow-hidden text-slate-100">
        <header className="sticky top-0 z-40 shrink-0 border-b border-violet-500/15 bg-slate-950/75 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-white drop-shadow-[0_0_18px_rgba(167,139,250,0.35)] transition hover:text-violet-300"
            >
              Valo Strats
            </Link>
            <nav className="flex items-center gap-6 text-sm">
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
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
