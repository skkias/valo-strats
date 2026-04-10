"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function DocsMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => <h1 className="docs-prose-h1" {...p} />,
        h2: (p) => <h2 className="docs-prose-h2" {...p} />,
        h3: (p) => <h3 className="docs-prose-h3" {...p} />,
        p: (p) => <p className="docs-prose-p" {...p} />,
        a: ({ href, children, ...rest }) => {
          const internal =
            typeof href === "string" &&
            (href.startsWith("/docs") || href.startsWith("#"));
          return (
            <a
              {...rest}
              href={href}
              className="docs-md-link"
              target={internal ? undefined : "_blank"}
              rel={internal ? undefined : "noopener noreferrer"}
            >
              {children}
            </a>
          );
        },
        ul: (p) => <ul className="docs-prose-ul" {...p} />,
        ol: (p) => <ol className="docs-prose-ol" {...p} />,
        li: (p) => <li className="docs-prose-li" {...p} />,
        code: ({ className, children, ...props }) => {
          const inline = !className;
          if (inline) {
            return (
              <code className="docs-md-code-inline" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre: (p) => <pre className="docs-prose-pre" {...p} />,
        blockquote: (p) => (
          <blockquote className="docs-prose-quote" {...p} />
        ),
        table: (p) => (
          <div className="docs-prose-table-wrap">
            <table className="docs-prose-table" {...p} />
          </div>
        ),
        th: (p) => <th className="docs-prose-th" {...p} />,
        td: (p) => <td className="docs-prose-td" {...p} />,
        hr: (p) => <hr className="docs-prose-hr" {...p} />,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
