"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameMap } from "@/types/catalog";
import type { AgentAbilityBlueprint } from "@/types/agent-ability";
import { StratMapViewer } from "@/components/StratMapViewer";
import { StratAbilityBlueprintSvg } from "@/components/StratAbilityBlueprintSvg";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import type { StratSide } from "@/types/strat";
import { normalizeEditorMeta } from "@/lib/map-editor-meta";
import {
  mapGeometryScaleFromEditorMeta,
  rootPointToLogicalGeometry,
} from "@/lib/map-geometry-scale";
import { clientToSvgPoint } from "@/lib/svg-coords";
import { clampPointToViewBox } from "@/lib/map-path";

function round4(n: number): string {
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? String(r) : r.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Live map overlay using the same SVG stack and scaling as the strat designer
 * (`StratAbilityBlueprintSvg` + map viewBox).
 */
export function AbilityBlueprintMapPreview({
  gameMap,
  blueprint,
}: {
  gameMap: GameMap;
  blueprint: AgentAbilityBlueprint | null;
}) {
  const [side, setSide] = useState<StratSide>("atk");
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState(false);

  const mapSvgRef = useRef<SVGSVGElement | null>(null);

  const { vb } = useMemo(
    () => stratMapDisplayData(gameMap, side),
    [gameMap, side],
  );

  const mapGeoScale = useMemo(
    () =>
      mapGeometryScaleFromEditorMeta(
        normalizeEditorMeta(gameMap.editor_meta),
      ),
    [gameMap.editor_meta],
  );

  const defaultAnchor = useMemo(
    () => ({
      x: vb.minX + vb.width / 2,
      y: vb.minY + vb.height / 2,
    }),
    [vb.minX, vb.minY, vb.width, vb.height],
  );

  useEffect(() => {
    setAnchor(null);
  }, [gameMap.id, side]);

  const pos = anchor ?? defaultAnchor;

  const [axStr, setAxStr] = useState("");
  const [ayStr, setAyStr] = useState("");

  useEffect(() => {
    setAxStr(round4(pos.x));
    setAyStr(round4(pos.y));
  }, [pos.x, pos.y]);

  const pointerToLogical = useCallback(
    (clientX: number, clientY: number) => {
      const svg = mapSvgRef.current;
      if (!svg) return null;
      const root = clientToSvgPoint(svg, clientX, clientY);
      return rootPointToLogicalGeometry(root, vb, mapGeoScale);
    },
    [vb, mapGeoScale],
  );

  function applyAnchorFromInputs() {
    const x = Number.parseFloat(axStr);
    const y = Number.parseFloat(ayStr);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setAnchor(clampPointToViewBox(vb, { x, y }));
  }

  const onBlueprintPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || !blueprint) return;
      e.stopPropagation();
      e.preventDefault();
      setDraggingAnchor(true);
      const pid = e.pointerId;
      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== pid) return;
        const logical = pointerToLogical(ev.clientX, ev.clientY);
        if (logical) setAnchor(clampPointToViewBox(vb, logical));
      }
      function end(ev: PointerEvent) {
        if (ev.pointerId !== pid) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setDraggingAnchor(false);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [blueprint, pointerToLogical, vb],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-violet-200/85">
        <span className="text-violet-400/80">Strat preview</span>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-violet-500/90">Side</span>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as StratSide)}
            className="input-field py-1 text-xs"
          >
            <option value="atk">Attack</option>
            <option value="def">Defense</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          onClick={() => setAnchor(null)}
        >
          Center anchor
        </button>
      </div>

      <StratMapViewer
        ref={mapSvgRef}
        gameMap={gameMap}
        side={side}
        showLayerToggles={false}
        showFooter={false}
        embed
      >
        {blueprint ? (
          <g
            onPointerDown={onBlueprintPointerDown}
            style={{
              cursor: draggingAnchor ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            <StratAbilityBlueprintSvg
              blueprint={blueprint}
              mapX={pos.x}
              mapY={pos.y}
              vbWidth={vb.width}
              pointerEvents="auto"
            />
          </g>
        ) : null}
      </StratMapViewer>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-[11px] text-violet-400/90">
          Anchor X (map units)
          <input
            type="number"
            value={axStr}
            onChange={(e) => setAxStr(e.target.value)}
            onBlur={() => applyAnchorFromInputs()}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyAnchorFromInputs();
            }}
            className="input-field mt-0.5 w-full font-mono text-xs"
            step="any"
          />
        </label>
        <label className="block text-[11px] text-violet-400/90">
          Anchor Y (map units)
          <input
            type="number"
            value={ayStr}
            onChange={(e) => setAyStr(e.target.value)}
            onBlur={() => applyAnchorFromInputs()}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyAnchorFromInputs();
            }}
            className="input-field mt-0.5 w-full font-mono text-xs"
            step="any"
          />
        </label>
        <p className="col-span-2 text-[11px] leading-snug text-violet-500/75 sm:col-span-2">
          <strong className="text-violet-300/85">Drag</strong> the blueprint on the map to
          move the anchor (same coordinate space as strat ability pins). Pan/zoom with the
          viewer; anchor is in logical map units ({round4(vb.minX)}…{round4(vb.minX + vb.width)}{" "}
          × {round4(vb.minY)}…{round4(vb.minY + vb.height)}).
        </p>
      </div>
    </div>
  );
}
