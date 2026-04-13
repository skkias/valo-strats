"use client";

import dynamic from "next/dynamic";
import type { GameMap } from "@/types/catalog";
import type { MapOutlineRings } from "@/lib/map-path";

const MapShapeEditor = dynamic(
  () => import("@/components/coach/MapShapeEditor").then((m) => m.MapShapeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-violet-800/35 bg-slate-950/45 px-4 py-3 text-sm text-violet-200/80">
        Loading map editor…
      </div>
    ),
  },
);

export function MapShapeEditorShell({
  mapId,
  initial,
  initialOutlineRings,
}: {
  mapId: string;
  initial: GameMap;
  initialOutlineRings: MapOutlineRings;
}) {
  return (
    <MapShapeEditor
      key={mapId}
      mapId={mapId}
      initial={initial}
      initialOutlineRings={initialOutlineRings}
    />
  );
}
