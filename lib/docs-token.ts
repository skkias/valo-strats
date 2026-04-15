/**
 * Shared docs-access cookie value (HMAC-SHA256 hex).
 * Uses Web Crypto so the same code runs in Edge middleware and Node.
 */
const HMAC_MESSAGE = "hexecute-documentation-v1";

export const DOCS_ACCESS_COOKIE = "docs_access";

export async function computeDocsAccessToken(secret: string): Promise<string> {
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

/** Constant-time comparison of SHA-256 digests (UTF-8 passwords). */
export async function verifyDocsPassword(
  input: string,
  expected: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const a = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(input)),
  );
  const b = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(expected)),
  );
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
