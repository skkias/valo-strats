"use client";

import type { AbilityTextureId } from "@/types/agent-ability";
import { rgbaWithAlpha } from "@/lib/ability-textures";

export function AbilityTextureDefs({
  patternId,
  textureId,
  color,
  originX,
  originY,
  radialFromOrigin = false,
}: {
  patternId: string;
  textureId?: AbilityTextureId;
  color: string;
  originX?: number;
  originY?: number;
  radialFromOrigin?: boolean;
}) {
  if (!textureId || textureId === "solid") return null;
  const stroke = rgbaWithAlpha(color, 0.6);
  const base = rgbaWithAlpha(color, 0.18);
  const strong = rgbaWithAlpha(color, 0.78);

  const tx =
    radialFromOrigin && Number.isFinite(originX)
      ? (originX as number) - 12
      : 0;
  const ty =
    radialFromOrigin && Number.isFinite(originY)
      ? (originY as number) - 12
      : 0;

  return (
    <defs>
      <pattern
        id={patternId}
        patternUnits="userSpaceOnUse"
        width="24"
        height="24"
        patternTransform={
          radialFromOrigin ? `translate(${tx} ${ty})` : undefined
        }
      >
        <rect width="24" height="24" fill={base} />
        {textureId === "diag_fwd" ? <path d="M-6 24 L24 -6 M0 30 L30 0" stroke={stroke} strokeWidth="2" /> : null}
        {textureId === "diag_back" ? <path d="M0 0 L24 24 M-6 6 L18 30 M6 -6 L30 18" stroke={stroke} strokeWidth="2" /> : null}
        {textureId === "crosshatch" ? (
          <>
            <path d="M-6 24 L24 -6 M0 30 L30 0" stroke={stroke} strokeWidth="1.5" />
            <path d="M0 0 L24 24 M-6 6 L18 30 M6 -6 L30 18" stroke={stroke} strokeWidth="1.5" />
          </>
        ) : null}
        {textureId === "grid" ? (
          <>
            <path d="M0 0 H24 M0 12 H24 M0 24 H24" stroke={stroke} strokeWidth="1.4" />
            <path d="M0 0 V24 M12 0 V24 M24 0 V24" stroke={stroke} strokeWidth="1.4" />
          </>
        ) : null}
        {textureId === "dots_small" ? (
          <>
            <circle cx="6" cy="6" r="1.8" fill={stroke} />
            <circle cx="18" cy="6" r="1.8" fill={stroke} />
            <circle cx="6" cy="18" r="1.8" fill={stroke} />
            <circle cx="18" cy="18" r="1.8" fill={stroke} />
          </>
        ) : null}
        {textureId === "dots_large" ? (
          <>
            <circle cx="6" cy="6" r="3.2" fill={stroke} />
            <circle cx="18" cy="18" r="3.2" fill={stroke} />
          </>
        ) : null}
        {textureId === "stripes_h" ? (
          <path d="M0 4 H24 M0 12 H24 M0 20 H24" stroke={stroke} strokeWidth="2" />
        ) : null}
        {textureId === "stripes_v" ? (
          <path d="M4 0 V24 M12 0 V24 M20 0 V24" stroke={stroke} strokeWidth="2" />
        ) : null}
        {textureId === "stripes_wide" ? (
          <>
            <rect x="0" y="0" width="24" height="8" fill={rgbaWithAlpha(color, 0.26)} />
            <rect x="0" y="12" width="24" height="8" fill={rgbaWithAlpha(color, 0.26)} />
          </>
        ) : null}
        {textureId === "zigzag" ? (
          <path d="M0 18 L6 12 L12 18 L18 12 L24 18 M0 6 L6 0 L12 6 L18 0 L24 6" stroke={stroke} strokeWidth="1.8" fill="none" />
        ) : null}
        {textureId === "chevron" ? (
          <path d="M0 6 L6 12 L12 6 L18 12 L24 6 M0 18 L6 24 L12 18 L18 24 L24 18" stroke={stroke} strokeWidth="1.8" fill="none" />
        ) : null}
        {textureId === "triangles" ? (
          <>
            <path d="M0 24 L6 12 L12 24 Z M12 24 L18 12 L24 24 Z" fill={rgbaWithAlpha(color, 0.32)} />
            <path d="M0 12 L6 0 L12 12 Z M12 12 L18 0 L24 12 Z" fill={rgbaWithAlpha(color, 0.22)} />
          </>
        ) : null}
        {textureId === "diamonds" ? (
          <>
            <path d="M6 0 L12 6 L6 12 L0 6 Z" fill={rgbaWithAlpha(color, 0.3)} />
            <path d="M18 12 L24 18 L18 24 L12 18 Z" fill={rgbaWithAlpha(color, 0.3)} />
            <path d="M18 0 L24 6 L18 12 L12 6 Z" fill={rgbaWithAlpha(color, 0.2)} />
            <path d="M6 12 L12 18 L6 24 L0 18 Z" fill={rgbaWithAlpha(color, 0.2)} />
          </>
        ) : null}
        {textureId === "bricks" ? (
          <path d="M0 0 H24 V8 H0 Z M0 8 H12 V16 H0 Z M12 8 H24 V16 H12 Z M0 16 H24 V24 H0 Z" fill="none" stroke={stroke} strokeWidth="1.2" />
        ) : null}
        {textureId === "weave" ? (
          <>
            <path d="M0 4 H24 M0 12 H24 M0 20 H24" stroke={rgbaWithAlpha(color, 0.45)} strokeWidth="3" />
            <path d="M4 0 V24 M12 0 V24 M20 0 V24" stroke={rgbaWithAlpha(color, 0.3)} strokeWidth="2" />
          </>
        ) : null}
        {textureId === "waves" ? (
          <path d="M0 6 C4 2 8 2 12 6 C16 10 20 10 24 6 M0 18 C4 14 8 14 12 18 C16 22 20 22 24 18" stroke={stroke} strokeWidth="1.6" fill="none" />
        ) : null}
        {textureId === "rings" ? (
          <>
            <circle cx="12" cy="12" r="8" stroke={stroke} strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth="1.5" fill="none" />
          </>
        ) : null}
        {textureId === "radial" ? (
          <>
            <path d="M12 12 L12 0 M12 12 L24 12 M12 12 L12 24 M12 12 L0 12 M12 12 L20 4 M12 12 L20 20 M12 12 L4 20 M12 12 L4 4" stroke={stroke} strokeWidth="1.4" />
            <circle cx="12" cy="12" r="2" fill={strong} />
          </>
        ) : null}
        {textureId === "pluses" ? (
          <>
            <path d="M6 3 V9 M3 6 H9 M18 15 V21 M15 18 H21" stroke={stroke} strokeWidth="1.7" />
          </>
        ) : null}
        {textureId === "confetti" ? (
          <>
            <circle cx="4" cy="6" r="1.6" fill={strong} />
            <circle cx="11" cy="16" r="1.1" fill={stroke} />
            <circle cx="19" cy="8" r="1.5" fill={strong} />
            <path d="M4 18 L8 14 M14 4 L17 1 M20 20 L23 17" stroke={stroke} strokeWidth="1.2" />
          </>
        ) : null}
        {textureId === "stairs" ? (
          <path d="M0 20 H6 V14 H12 V8 H18 V2 H24" stroke={stroke} strokeWidth="1.8" fill="none" />
        ) : null}
        {textureId === "honeycomb" ? (
          <path d="M4 6 L8 3 L12 6 L12 12 L8 15 L4 12 Z M12 6 L16 3 L20 6 L20 12 L16 15 L12 12 Z M0 15 L4 12 L8 15 L8 21 L4 24 L0 21 Z M8 15 L12 12 L16 15 L16 21 L12 24 L8 21 Z M16 15 L20 12 L24 15 L24 21 L20 24 L16 21 Z" fill="none" stroke={stroke} strokeWidth="1.2" />
        ) : null}
        {textureId === "sparse_cross" ? (
          <>
            <path d="M6 4 L6 10 M3 7 H9 M18 14 L18 20 M15 17 H21" stroke={stroke} strokeWidth="1.6" />
          </>
        ) : null}
      </pattern>
    </defs>
  );
}
