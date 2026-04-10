import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
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
        <SiteHeader />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
