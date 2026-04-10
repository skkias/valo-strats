"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { DocTreeNode } from "@/lib/documentation";

function TreeDir({
  name,
  nodes,
  currentSlug,
  depth,
}: {
  name: string;
  nodes: DocTreeNode[];
  currentSlug: string;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="select-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="docs-tree-btn"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <ChevronRight
          className={`docs-tree-chevron ${open ? "docs-tree-chevron-open" : ""}`}
          aria-hidden
        />
        <Folder className="docs-tree-folder-icon" aria-hidden />
        <span className="docs-tree-dir-label">{name}</span>
      </button>
      {open && (
        <div className="docs-tree-nested">
          <DocTreeNodes
            nodes={nodes}
            currentSlug={currentSlug}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

function TreeFile({
  slug,
  title,
  currentSlug,
  depth,
}: {
  slug: string;
  title: string;
  currentSlug: string;
  depth: number;
}) {
  const active = currentSlug === slug;
  const href = slug === "index" ? "/docs" : `/docs/${slug}`;
  return (
    <Link
      href={href}
      className={`docs-tree-link ${active ? "docs-tree-link-active" : ""}`}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <FileText className="docs-tree-file-icon" aria-hidden />
      <span className="truncate">{title}</span>
    </Link>
  );
}

function DocTreeNodes({
  nodes,
  currentSlug,
  depth,
}: {
  nodes: DocTreeNode[];
  currentSlug: string;
  depth: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node, i) =>
        node.kind === "dir" ? (
          <TreeDir
            key={`${node.name}-${i}`}
            name={node.name}
            nodes={node.children}
            currentSlug={currentSlug}
            depth={depth}
          />
        ) : (
          <TreeFile
            key={node.slug}
            slug={node.slug}
            title={node.title}
            currentSlug={currentSlug}
            depth={depth}
          />
        ),
      )}
    </div>
  );
}

export function DocsFileTree({
  tree,
  currentSlug,
}: {
  tree: DocTreeNode[];
  currentSlug: string;
}) {
  if (tree.length === 0) {
    return (
      <p className="docs-tree-empty">
        Add Markdown under <code>documentation/user</code>.
      </p>
    );
  }
  return (
    <nav aria-label="Documentation pages">
      <DocTreeNodes nodes={tree} currentSlug={currentSlug} depth={0} />
    </nav>
  );
}
