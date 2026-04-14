import type { JSX } from "react";

import type { ActivityHeatmap } from "../../lib/uiData";

export function HeatmapGrid({
  heatmap,
  emptyLabel,
  legendStart = "Low",
  legendEnd = "High",
}: {
  heatmap: ActivityHeatmap;
  emptyLabel: string;
  legendStart?: string;
  legendEnd?: string;
}): JSX.Element {
  if (heatmap.maxValue === 0) {
    return <div className="chart-empty">{emptyLabel}</div>;
  }

  return (
    <div className="heatmap-grid">
      <div className="heatmap-grid__hours">
        <span />
        {heatmap.hours.map((hour) => (
          <span key={hour}>{hour % 4 === 0 ? `${hour}` : ""}</span>
        ))}
      </div>
      <div className="heatmap-grid__body">
        {heatmap.days.map((day, dayIndex) => (
          <div className="heatmap-grid__row" key={day}>
            <span className="heatmap-grid__day">{day}</span>
            {heatmap.hours.map((hour) => {
              const cell = heatmap.cells.find((item) => item.dayIndex === dayIndex && item.hour === hour);
              const intensity = cell?.intensity ?? 0;
              return (
                <span
                  key={`${day}-${hour}`}
                  className="heatmap-grid__cell"
                  title={`${day} ${hour}:00 - ${cell?.value ?? 0}`}
                  style={{
                    backgroundColor: intensity > 0
                      ? `rgba(37, 99, 235, ${0.12 + intensity * 0.7})`
                      : "rgba(148, 163, 184, 0.14)",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-grid__legend">
        <span>{legendStart}</span>
        <div className="heatmap-grid__legend-bar" />
        <span>{legendEnd}</span>
      </div>
    </div>
  );
}
