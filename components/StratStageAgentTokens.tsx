"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { StratPlacedAgent, StratSide, StratStage, StratStageTransition } from "@/types/strat";
import type { ViewBoxRect } from "@/lib/map-path";
import { stratStagePinForDisplay } from "@/lib/strat-stage-coords";
import { stratAgentTokenDimensions } from "@/lib/strat-map-pin-scale";
import { StratAgentMapPinSvg } from "@/components/StratAgentMapPinSvg";
import { abbrevAgentName, roleAccent } from "@/lib/strat-stage-pin-styles";

export type StratAgentTokenRosterEntry = {
  slug: string;
  name: string;
  role: string;
  portraitUrl: string | null;
  themeColor?: string | null;
};

export type StratAgentTokenTransition = {
  fromStage: StratStage;
  kind: StratStageTransition;
  ms: number;
} | null;

type Interactive = {
  placementModeBlocks: boolean;
  selectedId: string | null;
  onPointerDown: (
    agent: StratPlacedAgent,
    displayPos: { x: number; y: number },
    e: React.PointerEvent,
  ) => void;
};

/**
 * Agent map pins with optional stage-to-stage motion: slide when the same slug
 * exists on both stages; fade in/out when it appears or disappears.
 */
export function StratStageAgentTokens({
  vb,
  vbWidth,
  side,
  agents,
  roster,
  transition,
  interactive,
  pointerEventsNoneOnText,
  pinScale = 1,
}: {
  vb: ViewBoxRect;
  vbWidth: number;
  side: StratSide;
  agents: StratPlacedAgent[];
  roster: StratAgentTokenRosterEntry[];
  transition: StratAgentTokenTransition;
  interactive?: Interactive;
  pointerEventsNoneOnText?: boolean;
  /** Coach / viewer: multiplier for token radius and label (default 1). */
  pinScale?: number;
}) {
  const { tokenR, fontAgent } = stratAgentTokenDimensions(vbWidth, pinScale);

  const [animArmed, setAnimArmed] = useState(false);
  const [exitingAgents, setExitingAgents] = useState<StratPlacedAgent[]>([]);
  const [exitFade, setExitFade] = useState(false);
  const enterRunIdRef = useRef(0);
  const exitMsRef = useRef(450);

  const ms = transition?.ms ?? 450;
  const easing = `${ms}ms ease-out`;

  useLayoutEffect(() => {
    if (!transition || transition.kind === "none") {
      enterRunIdRef.current += 1;
      setAnimArmed(false);
      return;
    }
    setAnimArmed(false);
    const runId = ++enterRunIdRef.current;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (runId !== enterRunIdRef.current) return;
        setAnimArmed(true);
      });
    });
    return () => {
      enterRunIdRef.current += 1;
      cancelAnimationFrame(raf);
    };
  }, [transition]);

  useLayoutEffect(() => {
    if (!transition || transition.kind === "none") {
      return;
    }
    exitMsRef.current = transition.ms;
    const toSlugs = new Set(agents.map((a) => a.agentSlug));
    const ex = transition.fromStage.agents.filter(
      (a) => !toSlugs.has(a.agentSlug),
    );
    setExitingAgents(ex);
    setExitFade(false);
    const tid = window.setTimeout(() => setExitingAgents([]), transition.ms + 120);
    return () => window.clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `agents` is the target stage at transition time only
  }, [transition]);

  useLayoutEffect(() => {
    if (exitingAgents.length === 0) {
      setExitFade(false);
      return;
    }
    setExitFade(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setExitFade(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [exitingAgents]);

  return (
    <>
      {agents.map((a) => {
        const meta = roster.find((r) => r.slug === a.agentSlug);
        const accent = meta
          ? roleAccent(meta.role, meta.themeColor)
          : { fill: "#94a3b8", stroke: "#fff" };
        const abbr = meta
          ? abbrevAgentName(meta.name)
          : a.agentSlug.slice(0, 2).toUpperCase();
        const pos = stratStagePinForDisplay(vb, side, { x: a.x, y: a.y });
        const prev = transition?.fromStage.agents.find(
          (p) => p.agentSlug === a.agentSlug,
        );
        const prevPos = prev
          ? stratStagePinForDisplay(vb, side, { x: prev.x, y: prev.y })
          : null;
        const dx = prevPos ? prevPos.x - pos.x : 0;
        const dy = prevPos ? prevPos.y - pos.y : 0;
        const isNew = !prev;
        const sel = interactive && interactive.selectedId === a.id;

        let innerStyle: CSSProperties = {};
        if (transition && transition.kind !== "none" && !isNew) {
          innerStyle = {
            transform: animArmed
              ? "translate(0px, 0px)"
              : `translate(${dx}px, ${dy}px)`,
            transition: animArmed ? `transform ${easing}` : undefined,
          };
        } else if (transition && transition.kind !== "none" && isNew) {
          innerStyle = {
            opacity: animArmed ? 1 : 0,
            transition: animArmed ? `opacity ${easing}` : undefined,
          };
        }

        return (
          <g
            key={a.id}
            transform={`translate(${pos.x},${pos.y})`}
            onPointerDown={
              interactive
                ? (e) => {
                    if (interactive.placementModeBlocks) return;
                    interactive.onPointerDown(a, pos, e);
                  }
                : undefined
            }
            style={{
              cursor: interactive
                ? interactive.placementModeBlocks
                  ? "default"
                  : "grab"
                : undefined,
            }}
          >
            <g style={innerStyle}>
              <StratAgentMapPinSvg
                tokenR={tokenR}
                vbWidth={vbWidth}
                abbr={abbr}
                fontAgent={fontAgent}
                accent={accent}
                portraitUrl={meta?.portraitUrl}
                selected={!!sel}
                pinId={a.id}
                pointerEventsNoneOnText={pointerEventsNoneOnText}
              />
            </g>
          </g>
        );
      })}
      {exitingAgents.map((a) => {
        const meta = roster.find((r) => r.slug === a.agentSlug);
        const accent = meta
          ? roleAccent(meta.role, meta.themeColor)
          : { fill: "#94a3b8", stroke: "#fff" };
        const abbr = meta
          ? abbrevAgentName(meta.name)
          : a.agentSlug.slice(0, 2).toUpperCase();
        const pos = stratStagePinForDisplay(vb, side, { x: a.x, y: a.y });
        const exitMs = exitMsRef.current;
        const exitEase = `${exitMs}ms ease-out`;
        const innerStyle: CSSProperties = {
          opacity: exitFade ? 0 : 1,
          transition: exitFade ? `opacity ${exitEase}` : undefined,
        };
        return (
          <g key={`exit-${a.id}`} transform={`translate(${pos.x},${pos.y})`}>
            <g style={innerStyle}>
              <StratAgentMapPinSvg
                tokenR={tokenR}
                vbWidth={vbWidth}
                abbr={abbr}
                fontAgent={fontAgent}
                accent={accent}
                portraitUrl={meta?.portraitUrl}
                selected={false}
                pinId={a.id}
                pointerEventsNoneOnText={pointerEventsNoneOnText}
              />
            </g>
          </g>
        );
      })}
    </>
  );
}
