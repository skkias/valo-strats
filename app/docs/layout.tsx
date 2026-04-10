import { getDocsThemeCSSVariables } from "@/lib/docs-theme";
import "./docs-theme.css";

export default function DocsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="docs-theme-root"
      style={getDocsThemeCSSVariables()}
    >
      {children}
    </div>
  );
}
