"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GameMap,
  MapImageTransform,
  MapOverlayKind,
  MapOverlayShape,
} from "@/types/catalog";
import { defaultMapTransform } from "@/lib/map-transform";
import { parseViewBox } from "@/lib/view-box";
import {
  alignPointsHorizontal,
  alignPointsVertical,
  flipPointsOverHorizontalMidline,
  ringsToPathD,
  type MapPoint,
} from "@/lib/map-path";
import { normalizeExtraPaths } from "@/lib/map-extra-paths";
import {
  clampPointsToOutline,
  clampSegmentToOutlineRegion,
  pointInOutlineWithHoles,
} from "@/lib/polygon-contains";
import {
  updateMapAction,
  uploadMapReferenceImageAction,
} from "@/app/coach/map-actions";
import {
  BoxSelect,
  CircleSlash2,
  ImagePlus,
  Loader2,
  Mountain,
  Move,
  Octagon,
  Pencil,
  Plus,
  Save,
  Shield,
  Swords,
  Trash2,
  Undo2,
} from "lucide-react";

type Tool = "draw" | "edit";

type ActiveLayer =
  | { kind: "outline"; holeIndex: number | null }
  | { kind: "overlay"; id: string };

type Selection =
  | { kind: "outline"; holeIndex: number | null; indices: number[] }
  | { kind: "overlay"; shapeId: string; indices: number[] }
  | null;

type DragState = {
  pointerId: number;
  startSvg: MapPoint;
  snapshot: MapPoint[];
  layer: ActiveLayer;
  indices: number[];
};

/** Visible window into canvas space (does not change saved coordinates). */
type ViewRect = { minX: number; minY: number; width: number; height: number };

function previewOpenOrClosed(points: MapPoint[]): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  const [p0, ...rest] = points;
  const parts = [`M ${p0.x} ${p0.y}`];
  for (const p of rest) parts.push(`L ${p.x} ${p.y}`);
  if (points.length >= 3) parts.push("Z");
  return parts.join(" ");
}

function newShapeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): MapPoint {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function MapShapeEditor({
  mapId,
  initial,
  initialOutlineRings,
}: {
  mapId: string;
  initial: GameMap;
  /** Serialized from the server so initial state matches SSR after RSC payload round-trip. */
  initialOutlineRings: { outer: MapPoint[]; holes: MapPoint[][] };
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [refUrl, setRefUrl] = useState<string | null>(
    initial.reference_image_url,
  );
  const [transform, setTransform] = useState<MapImageTransform>(
    initial.image_transform ?? defaultMapTransform(),
  );
  const [viewBox, setViewBox] = useState(initial.view_box);
  const [outlineOuter, setOutlineOuter] = useState<MapPoint[]>(
    () => initialOutlineRings.outer,
  );
  const [outlineHoles, setOutlineHoles] = useState<MapPoint[][]>(
    () => initialOutlineRings.holes,
  );
  const [overlays, setOverlays] = useState<MapOverlayShape[]>(() =>
    normalizeExtraPaths(initial.extra_paths),
  );
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>({
    kind: "outline",
    holeIndex: null,
  });
  const [tool, setTool] = useState<Tool>("draw");
  const [selection, setSelection] = useState<Selection>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** null = show full canvas; otherwise zoom/pan window (editor-only, not saved). */
  const [viewport, setViewport] = useState<ViewRect | null>(null);

  const clipId = useId().replace(/:/g, "");
  const outlineRingsRef = useRef({ outer: outlineOuter, holes: outlineHoles });
  const vbRef = useRef(parseViewBox(initial.view_box));

  const vb = useMemo(() => parseViewBox(viewBox), [viewBox]);
  vbRef.current = vb;

  const displayVb = viewport ?? vb;
  const outlineReady = outlineOuter.length >= 3;

  const defOuter = useMemo(
    () =>
      flipPointsOverHorizontalMidline(
        {
          minX: vb.minX,
          minY: vb.minY,
          width: vb.width,
          height: vb.height,
        },
        outlineOuter,
      ),
    [outlineOuter, vb],
  );
  const defHoles = useMemo(
    () =>
      outlineHoles.map((h) =>
        flipPointsOverHorizontalMidline(
          {
            minX: vb.minX,
            minY: vb.minY,
            width: vb.width,
            height: vb.height,
          },
          h,
        ),
      ),
    [outlineHoles, vb],
  );

  const outlineAtkD = useMemo(() => {
    const closedHoles = outlineHoles.filter((h) => h.length >= 3);
    if (outlineOuter.length >= 3) {
      return ringsToPathD(outlineOuter, closedHoles);
    }
    return previewOpenOrClosed(outlineOuter);
  }, [outlineOuter, outlineHoles]);

  const outlineDefD = useMemo(() => {
    const closedHoles = defHoles.filter((h) => h.length >= 3);
    if (defOuter.length >= 3) {
      return ringsToPathD(defOuter, closedHoles);
    }
    return previewOpenOrClosed(defOuter);
  }, [defOuter, defHoles]);

  useEffect(() => {
    if (!refUrl) {
      queueMicrotask(() => setImgDims(null));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImgDims({ w: 1000, h: 1000 });
    img.src = refUrl;
  }, [refUrl]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it?.type.startsWith("image/")) {
          e.preventDefault();
          const f = it.getAsFile();
          if (!f) continue;
          const fd = new FormData();
          fd.set("file", f);
          void (async () => {
            setBanner(null);
            const res = await uploadMapReferenceImageAction(mapId, fd);
            if (res.error) setBanner(res.error);
            else if (res.url) setRefUrl(res.url);
          })();
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [mapId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      e.preventDefault();
      if (!selection || selection.indices.length === 0) return;
      const sorted = [...selection.indices].sort((a, b) => b - a);
      if (selection.kind === "outline") {
        const hi = selection.holeIndex;
        if (hi === null) {
          setOutlineOuter((pts) => {
            const next = [...pts];
            for (const i of sorted) next.splice(i, 1);
            return next;
          });
        } else {
          setOutlineHoles((holes) =>
            holes.map((ring, j) => {
              if (j !== hi) return ring;
              const next = [...ring];
              for (const i of sorted) next.splice(i, 1);
              return next;
            }),
          );
        }
      } else {
        const sid = selection.shapeId;
        setOverlays((list) =>
          list.map((s) => {
            if (s.id !== sid) return s;
            const next = [...s.points];
            for (const i of sorted) next.splice(i, 1);
            return { ...s, points: next };
          }),
        );
      }
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  useEffect(() => {
    outlineRingsRef.current = { outer: outlineOuter, holes: outlineHoles };
  }, [outlineOuter, outlineHoles]);

  useEffect(() => {
    setViewport(null);
  }, [viewBox]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = vbRef.current;
      const pt = clientToSvg(el, e.clientX, e.clientY);
      const zoomIn = e.deltaY < 0;
      setViewport((prev) => {
        const cur: ViewRect = prev ?? {
          minX: canvas.minX,
          minY: canvas.minY,
          width: canvas.width,
          height: canvas.height,
        };
        const scale = zoomIn ? 1 / 1.12 : 1.12;
        let newW = cur.width * scale;
        let newH = cur.height * scale;
        newW = Math.min(
          canvas.width,
          Math.max(canvas.width * 0.02, newW),
        );
        newH = Math.min(
          canvas.height,
          Math.max(canvas.height * 0.02, newH),
        );
        let nx = pt.x - (pt.x - cur.minX) * (newW / cur.width);
        let ny = pt.y - (pt.y - cur.minY) * (newH / cur.height);
        nx = Math.max(
          canvas.minX,
          Math.min(canvas.minX + canvas.width - newW, nx),
        );
        ny = Math.max(
          canvas.minY,
          Math.min(canvas.minY + canvas.height - newH, ny),
        );
        return { minX: nx, minY: ny, width: newW, height: newH };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (outlineOuter.length < 3) return;
    queueMicrotask(() => {
      setOverlays((prev) =>
        prev.map((s) => ({
          ...s,
          points: clampPointsToOutline(s.points, outlineOuter, outlineHoles),
        })),
      );
    });
  }, [outlineOuter, outlineHoles]);

  const imageLayout = useMemo(() => {
    const nw = imgDims?.w ?? vb.width;
    const nh = imgDims?.h ?? vb.height;
    const fit = Math.min(vb.width / nw, vb.height / nh);
    const s = fit * transform.scale;
    const drawW = nw * s;
    const drawH = nh * s;
    const x = (vb.width - drawW) / 2 + transform.tx;
    const y = (vb.height - drawH) / 2 + transform.ty;
    return { x, y, w: drawW, h: drawH };
  }, [imgDims, transform, vb]);

  const hitRadius = vb.width * 0.012;

  const getActivePoints = useCallback((): MapPoint[] => {
    if (activeLayer.kind === "outline") {
      if (activeLayer.holeIndex === null) return outlineOuter;
      return outlineHoles[activeLayer.holeIndex] ?? [];
    }
    const sh = overlays.find((o) => o.id === activeLayer.id);
    return sh?.points ?? [];
  }, [activeLayer, outlineOuter, outlineHoles, overlays]);

  const setActivePoints = useCallback(
    (updater: (prev: MapPoint[]) => MapPoint[]) => {
      if (activeLayer.kind === "outline") {
        if (activeLayer.holeIndex === null) {
          setOutlineOuter(updater);
          return;
        }
        const hi = activeLayer.holeIndex;
        setOutlineHoles((holes) =>
          holes.map((ring, j) => (j === hi ? updater(ring) : ring)),
        );
        return;
      }
      const id = activeLayer.id;
      setOverlays((list) =>
        list.map((s) => (s.id === id ? { ...s, points: updater(s.points) } : s)),
      );
    },
    [activeLayer],
  );

  const addPoint = useCallback(
    (p: MapPoint) => {
      if (activeLayer.kind !== "outline") {
        if (!outlineReady) {
          setBanner(
            "Draw the map outline first (at least three points) before placing obstacles or elevation.",
          );
          return;
        }
        if (!pointInOutlineWithHoles(p, outlineOuter, outlineHoles)) {
          setBanner(
            "Obstacles and elevation must sit inside the purple map outline (not in cutouts).",
          );
          return;
        }
      }
      setBanner(null);
      setActivePoints((prev) => [...prev, p]);
    },
    [activeLayer.kind, outlineReady, outlineOuter, outlineHoles, setActivePoints],
  );

  const onSvgPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const t = e.target as Element;
      if (t.tagName === "circle") return;
      if (tool === "edit") {
        setSelection(null);
        return;
      }
      if (tool !== "draw") return;
      const svg = svgRef.current;
      if (!svg) return;
      const p = clientToSvg(svg, e.clientX, e.clientY);
      addPoint(p);
    },
    [tool, addPoint],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onVertexPointerDown = useCallback(
    (
      e: React.PointerEvent,
      layer: ActiveLayer,
      pointIndex: number,
    ) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (tool !== "edit") return;
      const svg = svgRef.current;
      if (!svg) return;
      const startSvg = clientToSvg(svg, e.clientX, e.clientY);
      let indices: number[];
      const sameLayer =
        selection &&
        ((layer.kind === "outline" &&
          selection.kind === "outline" &&
          layer.holeIndex === selection.holeIndex) ||
          (layer.kind === "overlay" &&
            selection.kind === "overlay" &&
            selection.shapeId === layer.id));
      if (e.shiftKey && sameLayer && selection) {
        const has = selection.indices.includes(pointIndex);
        indices = has
          ? selection.indices.filter((i) => i !== pointIndex)
          : [...selection.indices, pointIndex];
      } else {
        indices = [pointIndex];
      }

      if (layer.kind === "outline") {
        setSelection({ kind: "outline", holeIndex: layer.holeIndex, indices });
        const ring =
          layer.holeIndex === null
            ? outlineOuter
            : outlineHoles[layer.holeIndex] ?? [];
        dragRef.current = {
          pointerId: e.pointerId,
          startSvg,
          snapshot: [...ring],
          layer,
          indices,
        };
      } else {
        const sh = overlays.find((o) => o.id === layer.id);
        if (!sh) return;
        setSelection({ kind: "overlay", shapeId: layer.id, indices });
        dragRef.current = {
          pointerId: e.pointerId,
          startSvg,
          snapshot: [...sh.points],
          layer,
          indices,
        };
      }
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [tool, selection, outlineOuter, outlineHoles, overlays],
  );

  const onVertexPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const svg = svgRef.current;
      if (!svg) return;
      const cur = clientToSvg(svg, e.clientX, e.clientY);
      const dx = cur.x - d.startSvg.x;
      const dy = cur.y - d.startSvg.y;
      if (d.layer.kind === "outline") {
        const hi = d.layer.holeIndex;
        if (hi === null) {
          setOutlineOuter(() => {
            const next = [...d.snapshot];
            for (const i of d.indices) {
              const base = d.snapshot[i];
              if (base) next[i] = { x: base.x + dx, y: base.y + dy };
            }
            return next;
          });
        } else {
          setOutlineHoles((holes) =>
            holes.map((ring, j) => {
              if (j !== hi) return ring;
              const next = [...d.snapshot];
              for (const i of d.indices) {
                const base = d.snapshot[i];
                if (base) next[i] = { x: base.x + dx, y: base.y + dy };
              }
              return next;
            }),
          );
        }
      } else {
        const id = d.layer.id;
        const { outer, holes } = outlineRingsRef.current;
        setOverlays((list) =>
          list.map((s) => {
            if (s.id !== id) return s;
            const next = [...d.snapshot];
            for (const i of d.indices) {
              const base = d.snapshot[i];
              if (!base) continue;
              const raw = { x: base.x + dx, y: base.y + dy };
              next[i] =
                outer.length >= 3
                  ? clampSegmentToOutlineRegion(base, raw, outer, holes)
                  : raw;
            }
            return { ...s, points: next };
          }),
        );
      }
    },
    [],
  );

  const onVertexPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
      endDrag();
    },
    [endDrag],
  );

  function activateOverlayVertexDrag(
    e: React.PointerEvent,
    sh: MapOverlayShape,
    i: number,
  ) {
    e.stopPropagation();
    if (tool !== "edit") return;
    const svg = svgRef.current;
    if (!svg) return;
    const startSvg = clientToSvg(svg, e.clientX, e.clientY);
    const layer: ActiveLayer = { kind: "overlay", id: sh.id };
    let indices: number[];
    const sameLayer =
      selection &&
      selection.kind === "overlay" &&
      selection.shapeId === sh.id;
    if (e.shiftKey && sameLayer && selection) {
      const has = selection.indices.includes(i);
      indices = has
        ? selection.indices.filter((idx) => idx !== i)
        : [...selection.indices, i];
    } else {
      indices = [i];
    }
    setActiveLayer(layer);
    setSelection({ kind: "overlay", shapeId: sh.id, indices });
    dragRef.current = {
      pointerId: e.pointerId,
      startSvg,
      snapshot: [...sh.points],
      layer,
      indices,
    };
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
  }

  function undoPoint() {
    setActivePoints((p) => p.slice(0, -1));
  }

  function clearActiveShape() {
    setActivePoints(() => []);
    setSelection(null);
  }

  function alignVertical() {
    if (!selection || selection.indices.length < 2) return;
    if (selection.kind === "outline") {
      const hi = selection.holeIndex;
      if (hi === null) {
        setOutlineOuter((pts) =>
          alignPointsVertical(pts, selection.indices),
        );
      } else {
        setOutlineHoles((holes) =>
          holes.map((ring, j) =>
            j === hi
              ? alignPointsVertical(ring, selection.indices)
              : ring,
          ),
        );
      }
    } else {
      const sid = selection.shapeId;
      const idx = selection.indices;
      setOverlays((list) =>
        list.map((s) =>
          s.id === sid
            ? {
                ...s,
                points: clampPointsToOutline(
                  alignPointsVertical(s.points, idx),
                  outlineOuter,
                  outlineHoles,
                ),
              }
            : s,
        ),
      );
    }
  }

  function alignHorizontal() {
    if (!selection || selection.indices.length < 2) return;
    if (selection.kind === "outline") {
      const hi = selection.holeIndex;
      if (hi === null) {
        setOutlineOuter((pts) =>
          alignPointsHorizontal(pts, selection.indices),
        );
      } else {
        setOutlineHoles((holes) =>
          holes.map((ring, j) =>
            j === hi
              ? alignPointsHorizontal(ring, selection.indices)
              : ring,
          ),
        );
      }
    } else {
      const sid = selection.shapeId;
      const idx = selection.indices;
      setOverlays((list) =>
        list.map((s) =>
          s.id === sid
            ? {
                ...s,
                points: clampPointsToOutline(
                  alignPointsHorizontal(s.points, idx),
                  outlineOuter,
                  outlineHoles,
                ),
              }
            : s,
        ),
      );
    }
  }

  function addOverlay(kind: MapOverlayKind) {
    if (!outlineReady) {
      setBanner(
        "Finish the map outline (three or more points) before adding obstacles or elevation.",
      );
      return;
    }
    const id = newShapeId();
    setOverlays((list) => [...list, { id, kind, points: [] }]);
    setActiveLayer({ kind: "overlay", id });
    setTool("draw");
    setSelection(null);
  }

  function removeOverlay(id: string) {
    setOverlays((list) => list.filter((s) => s.id !== id));
    if (activeLayer.kind === "overlay" && activeLayer.id === id) {
      setActiveLayer({ kind: "outline", holeIndex: null });
    }
    setSelection(null);
  }

  function addOutlineHole() {
    if (!outlineReady) {
      setBanner("Close the outer outline (≥3 points) before adding a hole.");
      return;
    }
    setBanner(null);
    const newIndex = outlineHoles.length;
    setOutlineHoles((h) => [...h, []]);
    setActiveLayer({ kind: "outline", holeIndex: newIndex });
    setTool("draw");
    setSelection(null);
  }

  function removeOutlineHole(index: number) {
    setOutlineHoles((h) => h.filter((_, j) => j !== index));
    setActiveLayer((prev) => {
      if (prev.kind !== "outline") return prev;
      if (prev.holeIndex === index) {
        return { kind: "outline", holeIndex: null };
      }
      if (prev.holeIndex !== null && prev.holeIndex > index) {
        return { kind: "outline", holeIndex: prev.holeIndex - 1 };
      }
      return prev;
    });
    setSelection(null);
  }

  async function handleSave() {
    setSaving(true);
    setBanner(null);
    const closedHoles = outlineHoles.filter((h) => h.length >= 3);
    const pathAtk = ringsToPathD(outlineOuter, closedHoles);
    const pathDef = ringsToPathD(
      defOuter,
      defHoles.filter((_, i) => (outlineHoles[i]?.length ?? 0) >= 3),
    );
    const sanitizedOverlays =
      outlineReady
        ? overlays.map((s) => ({
            ...s,
            points: clampPointsToOutline(s.points, outlineOuter, outlineHoles),
          }))
        : overlays;
    const res = await updateMapAction(mapId, {
      reference_image_url: refUrl,
      image_transform: transform,
      view_box: viewBox,
      path_atk: pathAtk,
      path_def: pathDef,
      extra_paths: sanitizedOverlays,
    });
    setSaving(false);
    if (res.error) setBanner(res.error);
    else setBanner("Map shape saved.");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBanner(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadMapReferenceImageAction(mapId, fd);
    if (res.error) setBanner(res.error);
    else if (res.url) setRefUrl(res.url);
  }

  const canAlign =
    selection &&
    selection.indices.length >= 2 &&
    ((selection.kind === "outline" &&
      activeLayer.kind === "outline" &&
      selection.holeIndex === activeLayer.holeIndex) ||
      (selection.kind === "overlay" &&
        activeLayer.kind === "overlay" &&
        selection.shapeId === activeLayer.id));

  const activeCount = getActivePoints().length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{initial.name}</h2>
          <p className="mt-1 text-sm text-violet-200/60">
            The cyan defense shape mirrors the purple attack outline. Add holes
            to cut out areas inside the outline. Obstacles and elevation sit in
            the playable ring (not in holes); they stay clipped as you edit. Use
            Edit to drag vertices, Shift+click to multi-select, and click passive
            overlay vertices on the canvas to select their layer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn-primary inline-flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save map
        </button>
      </div>

      {banner && (
        <p
          className="rounded-lg border border-violet-800/40 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
          role="status"
        >
          {banner}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-secondary inline-flex cursor-pointer items-center gap-2 text-sm">
              <ImagePlus className="h-4 w-4" />
              Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onFile(e)}
              />
            </label>
            <span className="text-xs text-violet-300/45">
              Or paste (Ctrl+V) anywhere on this page
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-violet-300/55">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-violet-800/40 px-2 py-0.5">
                <Swords className="h-3.5 w-3.5 text-violet-300" />
                Attack (editable)
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-sky-800/40 px-2 py-0.5">
                <Shield className="h-3.5 w-3.5 text-sky-300" />
                Defense (auto mirror)
              </span>
            </div>
            <span className="text-violet-300/40">
              Scroll wheel on the map to zoom (pointer over canvas).
            </span>
            {viewport && (
              <button
                type="button"
                onClick={() => setViewport(null)}
                className="rounded border border-violet-700/50 px-2 py-0.5 text-violet-200/80 hover:bg-violet-950/50 hover:text-white"
              >
                Reset zoom
              </button>
            )}
          </div>

          <div
            className="overflow-hidden rounded-xl border border-violet-500/25 bg-black/40"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <svg
              ref={svgRef}
              role="img"
              aria-label="Map reference and trace canvas"
              viewBox={`${displayVb.minX} ${displayVb.minY} ${displayVb.width} ${displayVb.height}`}
              className="h-[min(480px,70vh)] w-full cursor-crosshair touch-none bg-zinc-950"
              style={{ userSelect: tool === "edit" ? "none" : undefined }}
              onPointerDown={onSvgPointerDown}
            >
              {refUrl ? (
                <image
                  href={refUrl}
                  x={imageLayout.x}
                  y={imageLayout.y}
                  width={imageLayout.w}
                  height={imageLayout.h}
                  preserveAspectRatio="none"
                />
              ) : (
                <text
                  x={vb.width / 2}
                  y={vb.height / 2}
                  textAnchor="middle"
                  className="fill-violet-300/50 text-lg"
                >
                  Paste or upload a map image
                </text>
              )}

              {outlineDefD && (
                <path
                  d={outlineDefD}
                  fill="rgba(56,189,248,0.1)"
                  fillRule={outlineOuter.length >= 3 ? "evenodd" : undefined}
                  stroke="rgb(56,189,248)"
                  strokeWidth={vb.width * 0.003}
                  strokeLinejoin="round"
                  strokeDasharray="8 6"
                  pointerEvents="none"
                />
              )}
              {outlineAtkD && (
                <path
                  d={outlineAtkD}
                  fill="rgba(167,139,250,0.12)"
                  fillRule={outlineOuter.length >= 3 ? "evenodd" : undefined}
                  stroke="rgb(167,139,250)"
                  strokeWidth={vb.width * 0.004}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}
              {outlineHoles.map((h, hi) => {
                if (h.length >= 3 || h.length === 0) return null;
                const d = previewOpenOrClosed(h);
                if (!d) return null;
                return (
                  <path
                    key={`hole-inprogress-atk-${hi}`}
                    d={d}
                    fill="none"
                    stroke="rgb(244,114,182)"
                    strokeWidth={vb.width * 0.003}
                    strokeDasharray="6 4"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                );
              })}

              <defs>
                {outlineAtkD && outlineReady && (
                  <clipPath id={clipId}>
                    <path d={outlineAtkD} fillRule="evenodd" />
                  </clipPath>
                )}
              </defs>

              <g
                clipPath={
                  outlineAtkD && outlineReady ? `url(#${clipId})` : undefined
                }
              >
                {overlays.map((sh) => {
                  const d = previewOpenOrClosed(sh.points);
                  if (!d) return null;
                  const isOb = sh.kind === "obstacle";
                  return (
                    <path
                      key={sh.id}
                      d={d}
                      fill={
                        isOb
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(52,211,153,0.14)"
                      }
                      stroke={isOb ? "rgb(251,191,36)" : "rgb(52,211,153)"}
                      strokeWidth={vb.width * 0.003}
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                  );
                })}
              </g>

              {tool === "edit" &&
                outlineReady &&
                overlays.flatMap((sh) =>
                  sh.points.flatMap((p, i) => {
                    if (
                      activeLayer.kind === "overlay" &&
                      activeLayer.id === sh.id
                    ) {
                      return [];
                    }
                    return [
                      <circle
                        key={`ov-passive-${sh.id}-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={hitRadius * 0.55}
                        fill={
                          sh.kind === "obstacle"
                            ? "rgba(251,191,36,0.45)"
                            : "rgba(52,211,153,0.45)"
                        }
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth={vb.width * 0.001}
                        style={{ cursor: "pointer" }}
                        onPointerDown={(e) =>
                          activateOverlayVertexDrag(e, sh, i)
                        }
                      />,
                    ];
                  }),
                )}

              {activeLayer.kind === "outline" &&
                activeLayer.holeIndex === null &&
                outlineOuter.map((p, i) => {
                  const sel =
                    selection?.kind === "outline" &&
                    selection.holeIndex === null &&
                    selection.indices.includes(i);
                  return (
                    <circle
                      key={`o-outer-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={hitRadius}
                      fill={
                        sel ? "rgb(250,250,250)" : "rgb(196,181,253)"
                      }
                      fillOpacity={tool === "draw" ? 0.35 : 0.95}
                      stroke="white"
                      strokeWidth={vb.width * 0.0015}
                      style={{
                        cursor:
                          tool === "edit" ? "grab" : "crosshair",
                        pointerEvents: tool === "draw" ? "none" : "auto",
                      }}
                      onPointerDown={(e) =>
                        onVertexPointerDown(e, {
                          kind: "outline",
                          holeIndex: null,
                        }, i)
                      }
                      onPointerMove={onVertexPointerMove}
                      onPointerUp={onVertexPointerUp}
                      onPointerCancel={onVertexPointerUp}
                    />
                  );
                })}

              {activeLayer.kind === "outline" &&
                activeLayer.holeIndex !== null &&
                (outlineHoles[activeLayer.holeIndex] ?? []).map((p, i) => {
                  const hi = activeLayer.holeIndex;
                  const sel =
                    selection?.kind === "outline" &&
                    selection.holeIndex === hi &&
                    selection.indices.includes(i);
                  return (
                    <circle
                      key={`o-hole-${hi}-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={hitRadius}
                      fill={
                        sel ? "rgb(250,250,250)" : "rgb(244,114,182)"
                      }
                      fillOpacity={tool === "draw" ? 0.35 : 0.95}
                      stroke="white"
                      strokeWidth={vb.width * 0.0015}
                      style={{
                        cursor:
                          tool === "edit" ? "grab" : "crosshair",
                        pointerEvents: tool === "draw" ? "none" : "auto",
                      }}
                      onPointerDown={(e) =>
                        onVertexPointerDown(e, {
                          kind: "outline",
                          holeIndex: hi,
                        }, i)
                      }
                      onPointerMove={onVertexPointerMove}
                      onPointerUp={onVertexPointerUp}
                      onPointerCancel={onVertexPointerUp}
                    />
                  );
                })}

              {activeLayer.kind === "overlay" &&
                overlays
                  .find((s) => s.id === activeLayer.id)
                  ?.points.map((p, i) => {
                    const sel =
                      selection?.kind === "overlay" &&
                      selection.shapeId === activeLayer.id &&
                      selection.indices.includes(i);
                    return (
                      <circle
                        key={`ov-${activeLayer.id}-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={hitRadius}
                        fill={
                          sel ? "rgb(250,250,250)" : "rgb(253,224,71)"
                        }
                        fillOpacity={tool === "draw" ? 0.35 : 0.95}
                        stroke="white"
                        strokeWidth={vb.width * 0.0015}
                        style={{
                          cursor:
                            tool === "edit" ? "grab" : "crosshair",
                          pointerEvents: tool === "draw" ? "none" : "auto",
                        }}
                        onPointerDown={(e) =>
                          onVertexPointerDown(
                            e,
                            { kind: "overlay", id: activeLayer.id },
                            i,
                          )
                        }
                        onPointerMove={onVertexPointerMove}
                        onPointerUp={onVertexPointerUp}
                        onPointerCancel={onVertexPointerUp}
                      />
                    );
                  })}
            </svg>
          </div>
        </div>

        <aside className="space-y-4 rounded-xl border border-violet-500/20 bg-slate-950/50 p-4">
          <div>
            <span className="label">Tool</span>
            <div className="mt-2 flex rounded-lg border border-violet-800/50 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setTool("draw");
                  setSelection(null);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium ${
                  tool === "draw"
                    ? "bg-violet-600 text-white"
                    : "text-violet-200/70 hover:text-white"
                }`}
              >
                <Pencil className="h-4 w-4" />
                Draw
              </button>
              <button
                type="button"
                onClick={() => setTool("edit")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium ${
                  tool === "edit"
                    ? "bg-slate-600 text-white"
                    : "text-violet-200/70 hover:text-white"
                }`}
              >
                <Move className="h-4 w-4" />
                Edit
              </button>
            </div>
          </div>

          <div>
            <span className="label">Active layer</span>
            <div className="mt-2 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setActiveLayer({ kind: "outline", holeIndex: null });
                  setSelection(null);
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  activeLayer.kind === "outline" &&
                  activeLayer.holeIndex === null
                    ? "border-violet-500/60 bg-violet-950/50 text-white"
                    : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                }`}
              >
                <Swords className="h-4 w-4 shrink-0" />
                Outer boundary (attack)
              </button>
              {outlineHoles.map((hole, hi) => (
                <div
                  key={`hole-layer-${hi}`}
                  className={`flex items-center gap-1 ${
                    activeLayer.kind === "outline" &&
                    activeLayer.holeIndex === hi
                      ? "rounded-lg border border-pink-500/35 bg-pink-950/20 p-1"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLayer({ kind: "outline", holeIndex: hi });
                      setSelection(null);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                      activeLayer.kind === "outline" &&
                      activeLayer.holeIndex === hi
                        ? "border-transparent bg-transparent text-white"
                        : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                    }`}
                  >
                    <CircleSlash2 className="h-4 w-4 shrink-0 text-pink-300" />
                    <span className="truncate">Hole {hi + 1}</span>
                    <span className="font-mono text-xs text-violet-500">
                      {hole.length} pts
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Remove hole"
                    onClick={() => removeOutlineHole(hi)}
                    className="shrink-0 rounded p-2 text-fuchsia-300 hover:bg-fuchsia-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addOutlineHole}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Add a closed polygon that cuts out from the outline"
                    : "Define the outer outline first (≥3 points)"
                }
                className="btn-secondary inline-flex w-full items-center justify-center gap-1.5 text-xs disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Add hole
              </button>
              {overlays.map((sh) => (
                <div
                  key={sh.id}
                  className={`flex items-center gap-1 ${
                    activeLayer.kind === "overlay" && activeLayer.id === sh.id
                      ? "rounded-lg border border-amber-500/40 bg-amber-950/20 p-1"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLayer({ kind: "overlay", id: sh.id });
                      setSelection(null);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                      activeLayer.kind === "overlay" &&
                      activeLayer.id === sh.id
                        ? "border-transparent bg-transparent text-white"
                        : "border-violet-800/40 text-violet-200/80 hover:bg-violet-950/30"
                    }`}
                  >
                    {sh.kind === "obstacle" ? (
                      <Octagon className="h-4 w-4 shrink-0 text-amber-300" />
                    ) : (
                      <Mountain className="h-4 w-4 shrink-0 text-emerald-300" />
                    )}
                    <span className="truncate capitalize">{sh.kind}</span>
                    <span className="font-mono text-xs text-violet-500">
                      {sh.points.length} pts
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Remove layer"
                    onClick={() => removeOverlay(sh.id)}
                    className="shrink-0 rounded p-2 text-fuchsia-300 hover:bg-fuchsia-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addOverlay("obstacle")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Add an obstacle polygon"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Octagon className="h-3.5 w-3.5" />
                Obstacle
              </button>
              <button
                type="button"
                onClick={() => addOverlay("elevation")}
                disabled={!outlineReady}
                title={
                  outlineReady
                    ? "Add an elevation polygon"
                    : "Define the map outline first"
                }
                className="btn-secondary inline-flex items-center gap-1 text-xs disabled:opacity-40"
              >
                <Mountain className="h-3.5 w-3.5" />
                Elevation
              </button>
            </div>
            {!outlineReady && (
              <p className="mt-2 text-xs text-amber-200/70">
                Close the purple outline (≥3 points) before obstacles or
                elevation.
              </p>
            )}
          </div>

          {tool === "edit" && (
            <div className="space-y-2 rounded-lg border border-slate-700/50 bg-slate-950/60 p-3">
              <span className="label flex items-center gap-1">
                <BoxSelect className="h-3.5 w-3.5" />
                Selection
              </span>
              <p className="text-xs text-violet-300/55">
                Shift+click vertices to multi-select. Two or more: align axes.
                Delete / Backspace removes selected vertices.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canAlign}
                  onClick={alignVertical}
                  className="btn-secondary text-xs disabled:opacity-40"
                  title="Same x (vertical line through points)"
                >
                  Vertical sync
                </button>
                <button
                  type="button"
                  disabled={!canAlign}
                  onClick={alignHorizontal}
                  className="btn-secondary text-xs disabled:opacity-40"
                  title="Same y (horizontal line through points)"
                >
                  Horizontal sync
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={undoPoint}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              <Undo2 className="h-4 w-4" />
              Undo point
            </button>
            <button
              type="button"
              onClick={clearActiveShape}
              className="btn-secondary inline-flex items-center gap-1 text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Clear layer
            </button>
          </div>

          <p className="text-xs text-violet-300/45">
            Active layer:{" "}
            <strong className="text-violet-200">
              {activeLayer.kind === "outline"
                ? activeLayer.holeIndex === null
                  ? "Outer"
                  : `Hole ${activeLayer.holeIndex + 1}`
                : overlays.find((o) => o.id === activeLayer.id)?.kind ??
                  "Overlay"}
            </strong>{" "}
            · {activeCount} pts
          </p>

          <div className="border-t border-violet-800/40 pt-4">
            <span className="label">Image transform</span>
            <label className="mt-2 block text-xs text-violet-300/55">
              Scale ({transform.scale.toFixed(2)}x)
            </label>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={transform.scale}
              onChange={(e) =>
                setTransform((t) => ({
                  ...t,
                  scale: Number(e.target.value),
                }))
              }
              className="mt-1 w-full accent-violet-500"
            />
            <label className="mt-3 block text-xs text-violet-300/55">
              Pan X
            </label>
            <input
              type="range"
              min={-500}
              max={500}
              step={1}
              value={transform.tx}
              onChange={(e) =>
                setTransform((t) => ({ ...t, tx: Number(e.target.value) }))
              }
              className="mt-1 w-full accent-violet-500"
            />
            <label className="mt-3 block text-xs text-violet-300/55">
              Pan Y
            </label>
            <input
              type="range"
              min={-500}
              max={500}
              step={1}
              value={transform.ty}
              onChange={(e) =>
                setTransform((t) => ({ ...t, ty: Number(e.target.value) }))
              }
              className="mt-1 w-full accent-violet-500"
            />
          </div>

          <div>
            <label className="label" htmlFor="viewbox">
              View box (advanced)
            </label>
            <input
              id="viewbox"
              value={viewBox}
              onChange={(e) => setViewBox(e.target.value)}
              className="input-field mt-1 font-mono text-xs"
              placeholder="0 0 1000 1000"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
