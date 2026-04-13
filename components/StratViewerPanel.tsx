"use client";

import { useEffect, useMemo, useState } from "react";
import type { Agent, GameMap } from "@/types/catalog";
import type { StratSide, StratStage } from "@/types/strat";
import { StratMapViewer } from "@/components/StratMapViewer";
import { StratStagePinsReadonly } from "@/components/StratStagePinsReadonly";
import type { StratAgentTokenTransition } from "@/components/StratStageAgentTokens";
import { stratMapDisplayData } from "@/lib/strat-map-display";
import {
  COACH_MAP_PIN_SCALE_DEFAULT,
  readCoachMapPinScale,
} from "@/lib/strat-map-pin-scale";

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
  agentTransition,
  embed = false,
  showFooter = true,
}: {
  gameMap: GameMap;
  side: StratSide;
  stage: StratStage;
  compSlugs: string[];
  agentsCatalog: Agent[];
  agentTransition?: StratAgentTokenTransition;
  /** Fill a flex column (e.g. modal map pane). */
  embed?: boolean;
  showFooter?: boolean;
}) {
  const { vb } = useMemo(
    () => stratMapDisplayData(gameMap, side),
    [gameMap, side],
  );
  const vbWidth = vb.width;

  const [pinScale, setPinScale] = useState(COACH_MAP_PIN_SCALE_DEFAULT);
  useEffect(() => {
    setPinScale(readCoachMapPinScale());
    const sync = () => setPinScale(readCoachMapPinScale());
    window.addEventListener("storage", sync);
    window.addEventListener("valo-strats:coach-map-pin-scale", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("valo-strats:coach-map-pin-scale", sync);
    };
  }, []);

  return (
    <StratMapViewer
      gameMap={gameMap}
      side={side}
      showLayerToggles
      showFooter={showFooter}
      embed={embed}
      initialVisibility={stage.mapLayerVisibility}
      visibilityScopeKey={stage.id}
    >
      <StratStagePinsReadonly
        gameMap={gameMap}
        vb={vb}
        vbWidth={vbWidth}
        side={side}
        stage={stage}
        compSlugs={compSlugs}
        agentsCatalog={agentsCatalog}
        agentTransition={agentTransition}
        pinScale={pinScale}
      />
    </StratMapViewer>
  );
}
