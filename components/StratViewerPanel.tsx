"use client";

import { useMemo } from "react";
import type { Agent, GameMap } from "@/types/catalog";
import type { StratSide, StratStage } from "@/types/strat";
import { StratMapViewer } from "@/components/StratMapViewer";
import { StratStagePinsReadonly } from "@/components/StratStagePinsReadonly";
import { stratMapDisplayData } from "@/lib/strat-map-display";

/**
 * Public / modal view: map layers with layer toggles (same controls as coach) plus
 * read-only pins for one strat stage.
 */
export function StratViewerPanel({
  gameMap,
  side,
  stage,
  compSlugs,
  agentsCatalog,
  embed = false,
  showFooter = true,
}: {
  gameMap: GameMap;
  side: StratSide;
  stage: StratStage;
  compSlugs: string[];
  agentsCatalog: Agent[];
  /** Fill a flex column (e.g. modal map pane). */
  embed?: boolean;
  showFooter?: boolean;
}) {
  const { vb } = useMemo(
    () => stratMapDisplayData(gameMap, side),
    [gameMap, side],
  );
  const vbWidth = vb.width;

  return (
    <StratMapViewer
      gameMap={gameMap}
      side={side}
      showLayerToggles
      showFooter={showFooter}
      embed={embed}
    >
      <StratStagePinsReadonly
        vbWidth={vbWidth}
        stage={stage}
        compSlugs={compSlugs}
        agentsCatalog={agentsCatalog}
      />
    </StratMapViewer>
  );
}
