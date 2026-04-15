import type { JSX, ReactNode } from "react";

export function ChartSurface({
  title,
  eyebrow = "Visualization",
  description,
  children,
  size = "default",
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  size?: "default" | "large";
}): JSX.Element {
  const guideParts = description
    ?.split("||")
    .map((part) => part.trim())
    .filter(Boolean) ?? [];

  return (
    <section className={`surface chart-surface ${size === "large" ? "chart-surface--large" : ""}`}>
      <div className="panel-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
          {guideParts.length > 1 ? (
            <div className="analysis-guide">
              {guideParts.map((part) => (
                <p key={part} className="analysis-guide__item">
                  {part}
                </p>
              ))}
            </div>
          ) : description ? (
            <p className="panel-description">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="chart-frame">{children}</div>
    </section>
  );
}
