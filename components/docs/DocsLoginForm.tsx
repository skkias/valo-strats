"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { unlockDocsForm } from "@/app/docs/actions";

function DocsLoginFormInner({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const [state, formAction, pending] = useActionState(unlockDocsForm, null);

  if (!configured) {
    return (
      <div className="docs-panel-warn">
        Set <code>DOCS_PASSWORD</code> in <code>.env</code> and restart the dev
        server.
      </div>
    );
  }

  return (
    <div className="docs-login-card">
      <h1 className="docs-login-title">Help &amp; guides</h1>
      <p className="docs-login-lead">
        Enter the shared password to read how the app works (player &amp; coach
        guides).
      </p>
      <form action={formAction} className="docs-login-form">
        <input type="hidden" name="from" value={from} />
        <div>
          <label className="docs-label" htmlFor="docs-password">
            Password
          </label>
          <input
            id="docs-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="docs-input"
            required
            disabled={pending}
          />
        </div>
        {state?.error && (
          <p className="docs-alert-error" role="alert">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          className="docs-btn-submit"
          disabled={pending}
        >
          {pending ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export function DocsLoginForm({ configured }: { configured: boolean }) {
  return (
    <Suspense fallback={<p className="docs-panel-muted">Loading…</p>}>
      <DocsLoginFormInner configured={configured} />
    </Suspense>
  );
}
