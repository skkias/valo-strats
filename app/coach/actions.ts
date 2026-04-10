"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COACH_ACCESS_COOKIE, computeCoachAccessToken } from "@/lib/coach-token";
import { verifyDocsPassword } from "@/lib/docs-token";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const COOKIE_PATH = "/coach";

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

  const ok = await verifyDocsPassword(password, expected);
  if (!ok) {
    return { error: "Invalid password." };
  }

  const token = await computeCoachAccessToken(expected);
  const jar = await cookies();
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
