import Link from "next/link";
import { Lock } from "lucide-react";
import type { DocTreeNode } from "@/lib/documentation";
import { DocsFileTree } from "@/components/docs/DocsFileTree";
import { DocsMarkdown } from "@/components/docs/DocsMarkdown";
import { lockDocs } from "@/app/docs/actions";

export function DocsViewer({
  tree,
  currentSlug,
  title,
  markdown,
}: {
  tree: DocTreeNode[];
  currentSlug: string;
  title: string;
  markdown: string;
}) {
  return (
    <div className="docs-shell">
      <aside className="docs-sidebar" aria-label="Documentation navigation">
        <div className="docs-sidebar-inner">
          <p className="docs-sidebar-label">Help &amp; guides</p>
          <DocsFileTree tree={tree} currentSlug={currentSlug} />
        </div>
      </aside>

      <div className="docs-main">
        <div className="docs-toolbar">
          <div className="docs-toolbar-home-wrap min-w-0 shrink-0">
            <Link href="/docs" className="docs-toolbar-home">
              Docs home
            </Link>
          </div>
          <h1 className="docs-toolbar-title min-w-0 flex-1">{title}</h1>
          <form action={lockDocs} className="shrink-0">
            <button type="submit" className="docs-btn-lock">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Lock
            </button>
          </form>
        </div>

        <div className="docs-article">
          <div className="docs-prose">
            <DocsMarkdown source={markdown} />
          </div>
        </div>

        <div className="docs-mobile-tree md:hidden">
          <p className="docs-mobile-tree-label">Pages</p>
          <DocsFileTree tree={tree} currentSlug={currentSlug} />
        </div>
      </div>
    </div>
  );
}
