import type { CSSProperties } from "react";

type Accent = { fill: string; stroke: string };

/**
 * Agent token on strat map SVG: circular portrait when HTTPS URL exists, else initials.
 */
export function StratAgentMapPinSvg({
  tokenR,
  vbWidth,
  abbr,
  fontAgent,
  accent,
  portraitUrl,
  selected = false,
  pinId,
  pointerEventsNoneOnText = true,
}: {
  tokenR: number;
  vbWidth: number;
  abbr: string;
  fontAgent: number;
  accent: Accent;
  portraitUrl: string | null | undefined;
  selected?: boolean;
  /** Unique within the SVG (e.g. placed agent id). */
  pinId: string;
  pointerEventsNoneOnText?: boolean;
}) {
  const safeId = pinId.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `strat-apin-${safeId}`;
  const hasPortrait =
    typeof portraitUrl === "string" &&
    portraitUrl.trim().startsWith("https://");
  const strokeW = vbWidth * 0.00135 * (selected ? 1.55 : 1);

  const textStyle: CSSProperties = {
    fontSize: fontAgent,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 800,
    pointerEvents: pointerEventsNoneOnText ? "none" : undefined,
  };

  if (hasPortrait) {
    const url = portraitUrl.trim();
    return (
      <>
        <defs>
          <clipPath id={clipId}>
            <circle cx={0} cy={0} r={tokenR} />
          </clipPath>
        </defs>
        <g style={{ clipPath: `url(#${clipId})` } as CSSProperties}>
          <image
            href={url}
            x={-tokenR}
            y={-tokenR}
            width={tokenR * 2}
            height={tokenR * 2}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
        <circle
          r={tokenR}
          fill="none"
          stroke={selected ? "#fae8ff" : accent.stroke}
          strokeWidth={strokeW}
        />
      </>
    );
  }

  return (
    <>
      <circle
        r={tokenR}
        fill={accent.fill}
        stroke={selected ? "#fae8ff" : accent.stroke}
        strokeWidth={strokeW}
      />
      <text
        y={fontAgent * 0.35}
        textAnchor="middle"
        fill="rgba(15,23,42,0.92)"
        style={textStyle}
      >
        {abbr}
      </text>
    </>
  );
}
