import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  computeDocsAccessToken,
  DOCS_ACCESS_COOKIE,
} from "@/lib/docs-token";
import {
  computeCoachAccessToken,
  COACH_ACCESS_COOKIE,
} from "@/lib/coach-token";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/docs")) {
    if (
      pathname === "/docs/login" ||
      pathname.startsWith("/docs/login/")
    ) {
      return NextResponse.next();
    }

    const pwd = process.env.DOCS_PASSWORD;
    if (!pwd) {
      return NextResponse.redirect(new URL("/docs/login", request.url));
    }

    const expected = await computeDocsAccessToken(pwd);
    const token = request.cookies.get(DOCS_ACCESS_COOKIE)?.value;
    if (token !== expected) {
      const u = new URL("/docs/login", request.url);
      u.searchParams.set("from", pathname);
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/coach")) {
    if (
      pathname === "/coach/login" ||
      pathname.startsWith("/coach/login/")
    ) {
      return NextResponse.next();
    }

    const pwd = process.env.COACH_PASSWORD;
    if (!pwd) {
      return NextResponse.redirect(new URL("/coach/login", request.url));
    }

    const expected = await computeCoachAccessToken(pwd);
    const token = request.cookies.get(COACH_ACCESS_COOKIE)?.value;
    if (token !== expected) {
      const u = new URL("/coach/login", request.url);
      u.searchParams.set("from", pathname);
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/docs", "/docs/:path*", "/coach", "/coach/:path*"],
};
