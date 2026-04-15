/**
 * Coach-area cookie token (HMAC-SHA256 hex). Separate message from docs so cookies do not overlap.
 */
const HMAC_MESSAGE = "hexecute-coach-v1";

export const COACH_ACCESS_COOKIE = "coach_access";

export async function computeCoachAccessToken(secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    keyMaterial,
    enc.encode(HMAC_MESSAGE),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
