"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  computeDocsAccessToken,
  DOCS_ACCESS_COOKIE,
  verifyDocsPassword,
} from "@/lib/docs-token";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const COOKIE_PATH = "/docs";

export async function unlockDocsForm(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const password = String(formData.get("password") ?? "");
  const redirectToRaw = String(formData.get("from") ?? "").trim();
  const redirectTo = redirectToRaw || undefined;

  const expected = process.env.DOCS_PASSWORD;
  if (!expected?.length) {
    return { error: "Documentation password is not configured." };
  }

  const ok = await verifyDocsPassword(password, expected);
  if (!ok) {
    return { error: "Invalid password." };
  }

  const token = await computeDocsAccessToken(expected);
  const jar = await cookies();
  jar.set(DOCS_ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  const dest =
    redirectTo &&
    redirectTo.startsWith("/docs") &&
    !redirectTo.startsWith("/docs/login")
      ? redirectTo
      : "/docs";
  redirect(dest);
}

export async function lockDocs() {
  const jar = await cookies();
  jar.set(DOCS_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/docs/login");
}
