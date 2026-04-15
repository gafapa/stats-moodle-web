import type { JSX } from "react";

export function MetricTile({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: string;
  tone: "accent" | "neutral" | "danger" | "warning" | "success";
  caption?: string;
}): JSX.Element {
  return (
    <div className={`metric-tile metric-tile--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {caption ? <small>{caption}</small> : null}
    </div>
  );
}
