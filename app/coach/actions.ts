"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COACH_ACCESS_COOKIE, computeCoachAccessToken } from "@/lib/coach-token";
import { verifyDocsPassword } from "@/lib/docs-token";
import {
  clearLoginFailures,
  readLoginThrottleStatus,
  registerLoginFailure,
} from "@/lib/login-throttle";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
/** Covers `/coach/*` including `/coach/api/*` (map save). */
const COOKIE_PATH = "/coach";
const THROTTLE_COOKIE = "coach_login_failures";

export async function unlockCoachForm(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const password = String(formData.get("password") ?? "");
  const redirectToRaw = String(formData.get("from") ?? "").trim();
  const redirectTo = redirectToRaw || undefined;

  const expected = process.env.COACH_PASSWORD;
  if (!expected?.length) {
    return { error: "Coach password is not configured." };
  }
  const jar = await cookies();
  const throttle = await readLoginThrottleStatus({
    jar,
    cookieName: THROTTLE_COOKIE,
  });
  if (throttle.locked) {
    const mins = Math.ceil(throttle.retryAfterSeconds / 60);
    return {
      error: `Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const ok = await verifyDocsPassword(password, expected);
  if (!ok) {
    const fail = await registerLoginFailure({
      jar,
      cookieName: THROTTLE_COOKIE,
      path: COOKIE_PATH,
    });
    if (fail.lockedNow) {
      const mins = Math.ceil(fail.retryAfterSeconds / 60);
      return {
        error: `Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
      };
    }
    return {
      error: `Invalid password. ${fail.attemptsRemaining} attempt${fail.attemptsRemaining === 1 ? "" : "s"} remaining before a cooldown.`,
    };
  }

  const token = await computeCoachAccessToken(expected);
  await clearLoginFailures({
    jar,
    cookieName: THROTTLE_COOKIE,
    path: COOKIE_PATH,
  });
  jar.set(COACH_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  const dest =
    redirectTo &&
    redirectTo.startsWith("/coach") &&
    !redirectTo.startsWith("/coach/login")
      ? redirectTo
      : "/coach";
  redirect(dest);
}

export async function lockCoach() {
  const jar = await cookies();
  jar.set(COACH_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/coach/login");
}
