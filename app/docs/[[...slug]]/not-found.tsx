import Link from "next/link";

export default function DocsNotFound() {
  return (
    <div className="docs-state">
      <h1 className="docs-state-title">Doc not found</h1>
      <p className="docs-state-body">
        That page is not in the documentation folder.
      </p>
      <Link href="/docs" className="docs-state-link">
        ← Documentation home
      </Link>
    </div>
  );
}
