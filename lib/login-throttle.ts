import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type ThrottleState = {
  windowStartMs: number;
  count: number;
  lockedUntilMs: number;
};

type CookieAdapter = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string, options: Partial<ResponseCookie>) => void;
};

function defaultState(now: number): ThrottleState {
  return {
    windowStartMs: now,
    count: 0,
    lockedUntilMs: 0,
  };
}

function parseState(raw: string | undefined, now: number): ThrottleState {
  if (!raw) return defaultState(now);
  const [winS, countS, lockS] = raw.split(":");
  const win = Number(winS);
  const count = Number(countS);
  const lock = Number(lockS);
  if (!Number.isFinite(win) || !Number.isFinite(count) || !Number.isFinite(lock)) {
    return defaultState(now);
  }
  return {
    windowStartMs: win,
    count: Math.max(0, Math.floor(count)),
    lockedUntilMs: Math.max(0, Math.floor(lock)),
  };
}

function serializeState(state: ThrottleState): string {
  return `${state.windowStartMs}:${state.count}:${state.lockedUntilMs}`;
}

function toCookieOptions(path: string): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    path,
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.ceil(Math.max(ATTEMPT_WINDOW_MS, LOCKOUT_MS) / 1000),
  };
}

export type LoginThrottleStatus =
  | { locked: false }
  | { locked: true; retryAfterSeconds: number };

export type LoginFailureResult =
  | { lockedNow: true; retryAfterSeconds: number }
  | { lockedNow: false; attemptsRemaining: number };

export async function readLoginThrottleStatus(args: {
  jar: CookieAdapter;
  cookieName: string;
}): Promise<LoginThrottleStatus> {
  const now = Date.now();
  const state = parseState(args.jar.get(args.cookieName)?.value, now);
  if (state.lockedUntilMs > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockedUntilMs - now) / 1000)),
    };
  }
  return { locked: false };
}

export async function registerLoginFailure(args: {
  jar: CookieAdapter;
  cookieName: string;
  path: string;
}): Promise<LoginFailureResult> {
  const now = Date.now();
  const state = parseState(args.jar.get(args.cookieName)?.value, now);
  const inWindow = now - state.windowStartMs <= ATTEMPT_WINDOW_MS;
  const nextCount = inWindow ? state.count + 1 : 1;
  const nextWindowStart = inWindow ? state.windowStartMs : now;

  if (nextCount >= MAX_ATTEMPTS) {
    const lockedUntilMs = now + LOCKOUT_MS;
    args.jar.set(
      args.cookieName,
      serializeState({
        windowStartMs: nextWindowStart,
        count: 0,
        lockedUntilMs,
      }),
      toCookieOptions(args.path),
    );
    return {
      lockedNow: true,
      retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000),
    };
  }

  args.jar.set(
    args.cookieName,
    serializeState({
      windowStartMs: nextWindowStart,
      count: nextCount,
      lockedUntilMs: 0,
    }),
    toCookieOptions(args.path),
  );
  return {
    lockedNow: false,
    attemptsRemaining: MAX_ATTEMPTS - nextCount,
  };
}

export async function clearLoginFailures(args: {
  jar: CookieAdapter;
  cookieName: string;
  path: string;
}) {
  args.jar.set(args.cookieName, "", {
    ...toCookieOptions(args.path),
    maxAge: 0,
  });
}
