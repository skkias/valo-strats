import { NextResponse } from "next/server";

const VALORANT_AGENTS_URL =
  "https://valorant-api.com/v1/agents?isPlayableCharacter=true&language=en-US";

export async function GET() {
  try {
    const res = await fetch(VALORANT_AGENTS_URL, {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Valorant API upstream failed (${res.status})` },
        { status: 502 },
      );
    }
    const payload = await res.json();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch Valorant abilities" },
      { status: 502 },
    );
  }
}
