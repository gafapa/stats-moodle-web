import type { JSX, ReactNode } from "react";

export function ChartSurface({
  title,
  eyebrow = "Visualization",
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="surface chart-surface">
      <div className="panel-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="chart-frame">{children}</div>
    </section>
  );
}
