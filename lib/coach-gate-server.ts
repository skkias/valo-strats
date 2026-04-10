import { cookies } from "next/headers";
import { computeCoachAccessToken, COACH_ACCESS_COOKIE } from "@/lib/coach-token";

/** Throws if the request does not have a valid coach access cookie. */
export async function assertCoachGate(): Promise<void> {
  const pwd = process.env.COACH_PASSWORD;
  if (!pwd?.length) {
    throw new Error("Coach password is not configured.");
  }
  const jar = await cookies();
  const token = jar.get(COACH_ACCESS_COOKIE)?.value;
  const expected = await computeCoachAccessToken(pwd);
  if (token !== expected) {
    throw new Error("Unauthorized");
  }
}
