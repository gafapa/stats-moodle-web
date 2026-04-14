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

export type PersistencePoint = {
  id: number;
  name: string;
  persistence: number;
  consistency: number;
  grade: number;
  risk: RiskLevel;
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

function weekStartKey(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function computeWeekSpan(startTimestamp: number, endTimestamp: number): number {
  if (endTimestamp <= startTimestamp) {
    return 1;
  }
  return Math.max(1, Math.round((endTimestamp - startTimestamp) / 604800) + 1);
}

export function buildPersistenceConsistencyData(students: StudentAnalysis[]): PersistencePoint[] {
  const allTimestamps = students.flatMap((student) => student.metrics.activityTimestamps);
  const globalMin = allTimestamps.length > 0 ? Math.min(...allTimestamps) : null;
  const globalMax = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;
  const courseSpanWeeks = globalMin !== null && globalMax !== null ? computeWeekSpan(globalMin, globalMax) : 1;

  return students
    .filter((student) => student.metrics.activityTimestamps.length > 0)
    .map((student) => {
      const timestamps = student.metrics.activityTimestamps;
      const minTs = Math.min(...timestamps);
      const maxTs = Math.max(...timestamps);
      const studentSpanWeeks = computeWeekSpan(minTs, maxTs);
      const activeWeeks = new Set(timestamps.map((timestamp) => weekStartKey(timestamp))).size;

      return {
        id: student.id,
        name: student.fullname,
        persistence: Number(((activeWeeks / courseSpanWeeks) * 100).toFixed(1)),
        consistency: Number(((activeWeeks / studentSpanWeeks) * 100).toFixed(1)),
        grade: student.metrics.finalGradePct ?? student.prediction.predictedGradePct,
        risk: student.riskLevel,
      };
    });
}

export function buildSubmissionPunctualityData(
  students: StudentAnalysis[],
  assignments: Record<string, unknown>[],
): Array<{ name: string; total: number; fill: string }> {
  let early = 0;
  let onTime = 0;
  let late = 0;
  let missing = 0;

  students.forEach((student) => {
    const submissionMap = new Map<number, Record<string, unknown>>();
    student.submissions.forEach((submission) => {
      const assignId = asNumber(submission.assignid);
      if (assignId !== null) {
        submissionMap.set(assignId, submission);
      }
    });

    assignments.forEach((assignment) => {
      const assignId = asNumber(assignment.id);
      const dueDate = asNumber(assignment.duedate);
      if (assignId === null || dueDate === null) {
        return;
      }

      const submission = submissionMap.get(assignId);
      const submittedAt = asNumber(submission?.timemodified) ?? asNumber(submission?.timecreated);

      if (submittedAt === null) {
        missing += 1;
        return;
      }

      const diffDays = (dueDate - submittedAt) / 86400;
      if (diffDays >= 2) {
        early += 1;
      } else if (diffDays >= 0) {
        onTime += 1;
      } else {
        late += 1;
      }
    });
  });

  return [
    { name: "Early", total: early, fill: "#21a179" },
    { name: "On time", total: onTime, fill: "#2563eb" },
    { name: "Late", total: late, fill: "#f59e0b" },
    { name: "Missing", total: missing, fill: "#d95b5b" },
  ];
}

export function buildQuizDifficultyData(
  students: StudentAnalysis[],
  quizzes: Record<string, unknown>[],
  passThresholdPct: number,
): Array<{ name: string; average: number; passRate: number; spread: number }> {
  return quizzes.flatMap((quiz) => {
    const quizId = asNumber(quiz.id);
    const maxGrade = asNumber(quiz.grade) ?? 10;
    if (quizId === null || maxGrade <= 0) {
      return [];
    }

    const scores = students.flatMap((student) => {
      return student.quizAttempts.flatMap((attempt) => {
        if (asNumber(attempt.quizid) !== quizId || !QUIZ_FINISHED_STATES.has(String(attempt.state ?? ""))) {
          return [];
        }
        const grade = asNumber(attempt.grade);
        if (grade === null) {
          return [];
        }
        return [(grade / maxGrade) * 100];
      });
    });

    if (scores.length === 0) {
      return [];
    }

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length;
    const passRate = (scores.filter((score) => score >= passThresholdPct).length / scores.length) * 100;

    return [{
      name: shortenLabel(String(quiz.name ?? `Quiz ${quizId}`), 18),
      average: Number(average.toFixed(1)),
      passRate: Number(passRate.toFixed(1)),
      spread: Number(Math.sqrt(variance).toFixed(1)),
    }];
  });
}

export function buildActivityTypeMixData(
  contents: Record<string, unknown>[],
): Array<{ name: string; total: number }> {
  const counts = new Map<string, number>();

  contents.forEach((section) => {
    const modules = Array.isArray(section.modules) ? (section.modules as Record<string, unknown>[]) : [];
    modules.forEach((module) => {
      const modName = String(module.modname ?? module.name ?? "other");
      counts.set(modName, (counts.get(modName) ?? 0) + 1);
    });
  });

  return [...counts.entries()]
    .map(([name, total]) => ({ name: shortenLabel(name, 18), total }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 8);
}

export function buildStudentSubmissionStatusData(
  student: StudentAnalysis,
  assignments: Record<string, unknown>[],
): Array<{ name: string; total: number; fill: string }> {
  return buildSubmissionPunctualityData([student], assignments);
}

export function buildStudentForumInteractionData(
  student: StudentAnalysis,
): Array<{ name: string; total: number; fill: string }> {
  const posts = student.forumPosts.length;
  const discussions = student.forumPosts.filter((post) => asNumber(post.parent) === 0).length;
  const replies = Math.max(0, posts - discussions);

  return [
    { name: "Posts", total: posts, fill: "#2563eb" },
    { name: "Discussions", total: discussions, fill: "#0f766e" },
    { name: "Replies", total: replies, fill: "#f59e0b" },
  ];
}
