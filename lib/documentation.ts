import fs from "fs";
import path from "path";

/** In-app /docs viewer: end-user guides only (Markdown). */
const DOC_ROOT = path.join(process.cwd(), "documentation", "user");

export type DocTreeNode =
  | {
      kind: "dir";
      name: string;
      children: DocTreeNode[];
    }
  | {
      kind: "file";
      slug: string;
      title: string;
    };

function isSafeSegment(seg: string): boolean {
  return (
    seg.length > 0 &&
    !seg.includes("..") &&
    !path.isAbsolute(seg) &&
    !seg.includes("/") &&
    !seg.includes("\\")
  );
}

function titleFromSlugPart(part: string): string {
  return part
    .replace(/\.md$/i, "")
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function scanDir(relDir: string): DocTreeNode[] {
  const absDir = path.join(DOC_ROOT, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return [];
  }

  const entries = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const nodes: DocTreeNode[] = [];

  for (const e of entries) {
    if (!isSafeSegment(e.name)) continue;

    if (e.isDirectory()) {
      const childRel = path.join(relDir, e.name);
      const children = scanDir(childRel);
      if (children.length > 0) {
        nodes.push({ kind: "dir", name: e.name, children });
      }
    } else if (e.name.toLowerCase().endsWith(".md")) {
      const base = e.name.slice(0, -3);
      const slug = relDir ? `${relDir.replace(/\\/g, "/")}/${base}` : base;
      nodes.push({
        kind: "file",
        slug,
        title: titleFromSlugPart(base),
      });
    }
  }

  return nodes;
}

export function getDocumentationTree(): DocTreeNode[] {
  return scanDir("");
}

function firstFileSlug(nodes: DocTreeNode[]): string | null {
  for (const n of nodes) {
    if (n.kind === "file") return n.slug;
    const inner = firstFileSlug(n.children);
    if (inner) return inner;
  }
  return null;
}

export function getDefaultDocSlug(): string | null {
  const indexPath = path.join(DOC_ROOT, "index.md");
  const readmePath = path.join(DOC_ROOT, "README.md");
  if (fs.existsSync(indexPath)) return "index";
  if (fs.existsSync(readmePath)) return "README";
  return firstFileSlug(getDocumentationTree());
}

export function resolveDocFile(slugParts: string[] | undefined): {
  absolutePath: string;
  slug: string;
  title: string;
} | null {
  if (!fs.existsSync(DOC_ROOT)) return null;

  const parts =
    slugParts?.filter((p) => p.length > 0 && isSafeSegment(p)) ?? [];

  if (parts.length === 0) {
    const indexPath = path.join(DOC_ROOT, "index.md");
    const readmePath = path.join(DOC_ROOT, "README.md");
    if (fs.existsSync(indexPath)) {
      return {
        absolutePath: indexPath,
        slug: "index",
        title: titleFromSlugPart("index"),
      };
    }
    if (fs.existsSync(readmePath)) {
      return {
        absolutePath: readmePath,
        slug: "README",
        title: titleFromSlugPart("README"),
      };
    }
    const fallback = getDefaultDocSlug();
    if (!fallback) return null;
    return resolveDocFile(fallback.split("/"));
  }

  const rel = path.join(...parts) + ".md";
  const absolutePath = path.join(DOC_ROOT, rel);
  const resolved = path.resolve(absolutePath);
  const rootResolved = path.resolve(DOC_ROOT);
  if (!resolved.startsWith(rootResolved) || !fs.existsSync(resolved)) {
    return null;
  }

  const slug = parts.join("/");
  return {
    absolutePath: resolved,
    slug,
    title: titleFromSlugPart(parts[parts.length - 1]!),
  };
}

export function readDocMarkdown(absolutePath: string): string {
  return fs.readFileSync(absolutePath, "utf8");
}

export function documentationRootExists(): boolean {
  return fs.existsSync(DOC_ROOT) && fs.statSync(DOC_ROOT).isDirectory();
}
