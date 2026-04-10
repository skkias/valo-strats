import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMapById } from "@/lib/catalog-queries";
import { initialOutlineRings } from "@/lib/map-initial-outline";
import { MapShapeEditor } from "@/components/coach/MapShapeEditor";

type Props = { params: Promise<{ mapId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mapId } = await params;
  const map = await getMapById(mapId);
  return {
    title: map ? `${map.name} · Map shape` : "Map shape",
  };
}

export default async function CoachMapEditPage({ params }: Props) {
  const { mapId } = await params;
  const map = await getMapById(mapId);
  if (!map) notFound();

  const outlineRingsInitial = initialOutlineRings(map);

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-violet-500/15 px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
          <Link
            href="/coach/maps"
            className="text-sm text-violet-300/70 hover:text-white"
          >
            ← All maps
          </Link>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <MapShapeEditor
          key={mapId}
          mapId={mapId}
          initial={map}
          initialOutlineRings={outlineRingsInitial}
        />
      </div>
    </main>
  );
}
