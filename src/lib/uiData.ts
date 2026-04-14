import type { RiskLevel } from "../types";

export const QUIZ_FINISHED_STATES = new Set([
  "finished",
  "gradedright",
  "gradedwrong",
  "gradedpartial",
]);

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function averageNumbers(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function shortenLabel(value: string, maxLength = 20): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

export function getRiskTone(riskLevel: RiskLevel): "danger" | "warning" | "success" {
  if (riskLevel === "high") {
    return "danger";
  }
  if (riskLevel === "medium") {
    return "warning";
  }
  return "success";
}

export function getGradeBandIndex(value: number): number {
  if (value < 20) {
    return 0;
  }
  if (value < 40) {
    return 1;
  }
  if (value < 60) {
    return 2;
  }
  if (value < 80) {
    return 3;
  }
  return 4;
}

export function buildWeeklyActivityData(timestamps: number[]): Array<{ week: string; events: number }> {
  const counts = new Map<string, { date: Date; total: number }>();

  timestamps.forEach((timestamp) => {
    const date = new Date(timestamp * 1000);
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const key = monday.toISOString().slice(0, 10);
    const current = counts.get(key);
    if (current) {
      current.total += 1;
    } else {
      counts.set(key, { date: monday, total: 1 });
    }
  });

  return [...counts.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-12)
    .map((entry) => ({
      week: new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
      }).format(entry.date),
      events: entry.total,
    }));
}
