import type { RiskLevel, StudentAnalysis } from "../types";

export const QUIZ_FINISHED_STATES = new Set([
  "finished",
  "gradedright",
  "gradedwrong",
  "gradedpartial",
]);

export type ActivityHeatmap = {
  days: string[];
  hours: number[];
  cells: Array<{ dayIndex: number; hour: number; value: number; intensity: number }>;
  maxValue: number;
};

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

export function buildActivityHeatmapData(timestamps: number[]): ActivityHeatmap {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const counts = new Map<string, number>();

  timestamps.forEach((timestamp) => {
    const date = new Date(timestamp * 1000);
    const dayIndex = (date.getDay() + 6) % 7;
    const hour = date.getHours();
    const key = `${dayIndex}-${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const maxValue = Math.max(0, ...counts.values());
  const cells = days.flatMap((_, dayIndex) => {
    return hours.map((hour) => {
      const value = counts.get(`${dayIndex}-${hour}`) ?? 0;
      return {
        dayIndex,
        hour,
        value,
        intensity: maxValue > 0 ? value / maxValue : 0,
      };
    });
  });

  return { days, hours, cells, maxValue };
}

export function buildCourseFunnelData(
  students: StudentAnalysis[],
  passThresholdPct: number,
): Array<{ name: string; total: number }> {
  const total = students.length;
  const accessed = students.filter((student) => student.metrics.daysSinceAccess < 999).length;
  const active = students.filter((student) => student.metrics.daysSinceAccess <= 7).length;
  const participating = students.filter((student) => {
    return (student.metrics.submissionRate ?? 0) > 0 || (student.metrics.quizCoverageRate ?? 0) > 0;
  }).length;
  const onTrack = students.filter((student) => student.prediction.predictedGradePct >= passThresholdPct).length;

  return [
    { name: "Enrolled", total },
    { name: "Accessed", total: accessed },
    { name: "Active 7d", total: active },
    { name: "Participating", total: participating },
    { name: "On track", total: onTrack },
  ];
}

export function buildTopBottomComparisonData(
  students: StudentAnalysis[],
): Array<{ name: string; top: number; bottom: number }> {
  if (students.length === 0) {
    return [];
  }

  const sorted = [...students].sort(
    (left, right) => right.prediction.predictedGradePct - left.prediction.predictedGradePct,
  );
  const cohortSize = Math.max(1, Math.ceil(sorted.length / 4));
  const top = sorted.slice(0, cohortSize);
  const bottom = sorted.slice(-cohortSize);

  const averageMetric = (items: StudentAnalysis[], getter: (student: StudentAnalysis) => number | null): number => {
    const values = items.map(getter).filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  };

  return [
    {
      name: "Engagement",
      top: Number(averageMetric(top, (student) => student.metrics.engagementScore).toFixed(1)),
      bottom: Number(averageMetric(bottom, (student) => student.metrics.engagementScore).toFixed(1)),
    },
    {
      name: "Completion",
      top: Number(averageMetric(top, (student) => student.metrics.completionRate).toFixed(1)),
      bottom: Number(averageMetric(bottom, (student) => student.metrics.completionRate).toFixed(1)),
    },
    {
      name: "Submission",
      top: Number(averageMetric(top, (student) => student.metrics.submissionRate).toFixed(1)),
      bottom: Number(averageMetric(bottom, (student) => student.metrics.submissionRate).toFixed(1)),
    },
    {
      name: "Quiz",
      top: Number(averageMetric(top, (student) => student.metrics.quizAvgPct).toFixed(1)),
      bottom: Number(averageMetric(bottom, (student) => student.metrics.quizAvgPct).toFixed(1)),
    },
  ];
}

export function buildForumRiskData(
  students: StudentAnalysis[],
): Array<{ name: string; posts: number; fill: string }> {
  const groups: Array<{ risk: RiskLevel; name: string; fill: string }> = [
    { risk: "high", name: "High", fill: "#d95b5b" },
    { risk: "medium", name: "Medium", fill: "#f2a531" },
    { risk: "low", name: "Low", fill: "#21a179" },
  ];

  return groups.map((group) => ({
    name: group.name,
    posts: students
      .filter((student) => student.riskLevel === group.risk)
      .reduce((sum, student) => sum + student.metrics.forumPostsCount, 0),
    fill: group.fill,
  }));
}
