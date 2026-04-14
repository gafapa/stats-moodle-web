import type { JSX } from "react";

export function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "neutral" | "danger" | "warning" | "success";
}): JSX.Element {
  return (
    <div className={`metric-tile metric-tile--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
