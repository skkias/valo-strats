"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { unlockCoachForm } from "@/app/coach/actions";

function CoachLoginFormInner({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const [state, formAction, pending] = useActionState(unlockCoachForm, null);

  if (!configured) {
    return (
      <div className="rounded-xl border border-violet-500/30 bg-violet-950/30 p-6 text-sm text-violet-100">
        Set <code className="text-violet-200">COACH_PASSWORD</code> in{" "}
        <code className="text-violet-200">.env</code> and restart the dev server.
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-violet-500/25 bg-slate-950/70 p-8 shadow-xl shadow-violet-950/35 backdrop-blur-md">
      <h1 className="text-xl font-semibold tracking-tight text-white">
        Coach area
      </h1>
      <p className="mt-2 text-sm text-violet-200/65">
        Enter the shared coach password to open the dashboard and manage strats.
      </p>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="from" value={from} />
        <div>
          <label className="label" htmlFor="coach-gate-password">
            Password
          </label>
          <input
            id="coach-gate-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="input-field mt-1"
            required
            disabled={pending}
          />
        </div>
        {state?.error && (
          <p className="text-sm text-fuchsia-400" role="alert">
            {state.error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Checking…" : "Unlock coach"}
        </button>
      </form>
    </div>
  );
}

export function CoachLoginForm({ configured }: { configured: boolean }) {
  return (
    <Suspense
      fallback={<p className="text-sm text-violet-300/50">Loading…</p>}
    >
      <CoachLoginFormInner configured={configured} />
    </Suspense>
  );
}
