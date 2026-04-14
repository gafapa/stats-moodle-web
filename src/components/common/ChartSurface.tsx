import type { JSX, ReactNode } from "react";

export function ChartSurface({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="surface chart-surface">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Visualization</div>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="chart-frame">{children}</div>
    </section>
  );
}
