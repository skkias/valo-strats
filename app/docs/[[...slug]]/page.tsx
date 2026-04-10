import { notFound } from "next/navigation";
import {
  documentationRootExists,
  getDocumentationTree,
  readDocMarkdown,
  resolveDocFile,
} from "@/lib/documentation";
import { DocsViewer } from "@/components/docs/DocsViewer";

export default async function DocumentationPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;

  if (!documentationRootExists()) {
    return (
      <div className="docs-state">
        <h1 className="docs-state-title">No documentation yet</h1>
        <p className="docs-state-body">
          Add <code>documentation/user</code> and put user-facing{" "}
          <code>.md</code> files there. Developer docs live under{" "}
          <code>documentation/developer</code> (not shown in this viewer).
        </p>
      </div>
    );
  }

  const resolved = resolveDocFile(slug);
  if (!resolved) notFound();

  const tree = getDocumentationTree();
  const markdown = readDocMarkdown(resolved.absolutePath);

  return (
    <DocsViewer
      tree={tree}
      currentSlug={resolved.slug}
      title={resolved.title}
      markdown={markdown}
    />
  );
}
