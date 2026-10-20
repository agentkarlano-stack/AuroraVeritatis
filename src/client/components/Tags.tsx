import type { ReactNode } from "react";

export function DemoTag({ children = "Demo data" }: { children?: ReactNode }) {
  return <span className="tag tag-demo" title="Synthetic or sample data for demonstration. Not real-world information.">{children}</span>;
}

export function PlannedTag({ children = "Planned" }: { children?: ReactNode }) {
  return <span className="tag tag-planned" title="Not yet available. Shown to communicate the roadmap.">{children}</span>;
}

export function SourceTag({ children }: { children: ReactNode }) {
  return <span className="tag tag-source tag-dot">{children}</span>;
}

export function Notice({ tone = "demo", children }: { tone?: "demo" | "error" | "ok"; children: ReactNode }) {
  const cls = tone === "error" ? "notice notice-error" : tone === "ok" ? "notice notice-ok" : "notice";
  return (
    <div className={cls} role={tone === "error" ? "alert" : "note"}>
      <div>{children}</div>
    </div>
  );
}
