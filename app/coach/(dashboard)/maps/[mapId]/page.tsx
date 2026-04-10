import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMapById } from "@/lib/catalog-queries";
import { initialOutlineRings } from "@/lib/map-initial-outline";
import { isValidUuid } from "@/lib/is-uuid";
import { MapShapeEditor } from "@/components/coach/MapShapeEditor";

type Props = { params: Promise<{ mapId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mapId } = await params;
  if (!isValidUuid(mapId)) {
    return { title: "Map shape" };
  }
  const map = await getMapById(mapId);
  return {
    title: map ? `${map.name} · Map shape` : "Map shape",
  };
}

export default async function CoachMapEditPage({ params }: Props) {
  const { mapId } = await params;
  if (!isValidUuid(mapId)) notFound();
  const map = await getMapById(mapId);
  if (!map) notFound();

  const outlineRingsInitial = initialOutlineRings(map);

  return (
    <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5">
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
