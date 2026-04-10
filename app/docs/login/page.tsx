import { DocsLoginForm } from "@/components/docs/DocsLoginForm";

export default function DocsLoginPage() {
  const configured = Boolean(process.env.DOCS_PASSWORD);

  return (
    <main className="docs-login-shell">
      <DocsLoginForm configured={configured} />
    </main>
  );
}
