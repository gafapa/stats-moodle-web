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

export type SectionWorkloadPoint = {
  name: string;
  total: number;
  assessed: number;
  content: number;
};

export type CompletionBottleneckPoint = {
  name: string;
  completionRate: number;
  observed: number;
  modname: string;
};

export type ResourceFormatPoint = {
  name: string;
  files: number;
  sizeMb: number;
};

export type AssessmentTimelinePoint = {
  name: string;
  assignments: number;
  quizzes: number;
  total: number;
};

export type AssignmentTurnaroundPoint = {
  id: number;
  name: string;
  gradingDays: number;
  averageScore: number | null;
  graded: number;
  submitted: number;
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

function mondayFromTimestamp(timestamp: number): Date {
  const date = new Date(timestamp * 1000);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function buildActivityNameMap(contents: Record<string, unknown>[]): Map<number, { name: string; modname: string }> {
  const map = new Map<number, { name: string; modname: string }>();

  contents.forEach((section) => {
    const modules = Array.isArray(section.modules) ? (section.modules as Record<string, unknown>[]) : [];
    modules.forEach((module) => {
      const cmid = asNumber(module.id);
      if (cmid === null) {
        return;
      }
      map.set(cmid, {
        name: String(module.name ?? `Activity ${cmid}`),
        modname: String(module.modname ?? "activity"),
      });
    });
  });

  return map;
}

function pickFileType(file: Record<string, unknown>): string {
  const mime = String(file.mimetype ?? "").toLowerCase();
  const filename = String(file.filename ?? "").toLowerCase();

  if (mime.startsWith("application/pdf") || filename.endsWith(".pdf")) {
    return "PDF";
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls") ||
    filename.endsWith(".ods")
  ) {
    return "Spreadsheet";
  }
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    filename.endsWith(".pptx") ||
    filename.endsWith(".ppt") ||
    filename.endsWith(".odp")
  ) {
    return "Presentation";
  }
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    mime.includes("opendocument.text") ||
    filename.endsWith(".docx") ||
    filename.endsWith(".doc") ||
    filename.endsWith(".odt")
  ) {
    return "Document";
  }
  if (mime.startsWith("image/")) {
    return "Image";
  }
  if (mime.startsWith("video/")) {
    return "Video";
  }
  if (mime.startsWith("audio/")) {
    return "Audio";
  }
  if (mime.includes("zip") || filename.endsWith(".zip")) {
    return "Archive";
  }
  if (mime === "text/html" || filename.endsWith(".html")) {
    return "HTML";
  }

  return "Other";
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

export function buildSectionWorkloadData(contents: Record<string, unknown>[]): SectionWorkloadPoint[] {
  const assessedTypes = new Set(["assign", "quiz", "workshop", "lesson"]);
  const contentTypes = new Set(["resource", "page", "url", "folder", "book", "label", "imscp"]);

  return contents
    .map((section) => {
      const modules = Array.isArray(section.modules) ? (section.modules as Record<string, unknown>[]) : [];
      return {
        name: shortenLabel(String(section.name ?? `Section ${section.section ?? ""}`), 18),
        total: modules.length,
        assessed: modules.filter((module) => assessedTypes.has(String(module.modname ?? ""))).length,
        content: modules.filter((module) => contentTypes.has(String(module.modname ?? ""))).length,
      };
    })
    .filter((section) => section.total > 0);
}

export function buildCompletionBottleneckData(
  students: StudentAnalysis[],
  contents: Record<string, unknown>[],
): CompletionBottleneckPoint[] {
  const activityMap = buildActivityNameMap(contents);
  const aggregates = new Map<number, { completed: number; observed: number; modname: string; name: string }>();

  students.forEach((student) => {
    student.completion.statuses.forEach((status) => {
      const cmid = asNumber(status.cmid);
      if (cmid === null) {
        return;
      }

      const state = asNumber(status.state);
      const isCompleted = state === 1 || state === 2;
      const activity = activityMap.get(cmid);
      const current = aggregates.get(cmid) ?? {
        completed: 0,
        observed: 0,
        modname: activity?.modname ?? String(status.modname ?? "activity"),
        name: activity?.name ?? `Activity ${cmid}`,
      };

      current.observed += 1;
      if (isCompleted) {
        current.completed += 1;
      }

      aggregates.set(cmid, current);
    });
  });

  return [...aggregates.values()]
    .map((item) => ({
      name: shortenLabel(item.name, 22),
      completionRate: Number(((item.completed / Math.max(item.observed, 1)) * 100).toFixed(1)),
      observed: item.observed,
      modname: item.modname,
    }))
    .sort((left, right) => left.completionRate - right.completionRate || right.observed - left.observed)
    .slice(0, 8);
}

export function buildResourceFormatData(resources: Record<string, unknown>[]): ResourceFormatPoint[] {
  const counts = new Map<string, { files: number; sizeMb: number }>();

  resources.forEach((resource) => {
    const files = Array.isArray(resource.contentfiles) ? (resource.contentfiles as Record<string, unknown>[]) : [];
    files.forEach((file) => {
      const type = pickFileType(file);
      const current = counts.get(type) ?? { files: 0, sizeMb: 0 };
      current.files += 1;
      current.sizeMb += (asNumber(file.filesize) ?? 0) / 1048576;
      counts.set(type, current);
    });
  });

  return [...counts.entries()]
    .map(([name, item]) => ({
      name,
      files: item.files,
      sizeMb: Number(item.sizeMb.toFixed(2)),
    }))
    .sort((left, right) => right.files - left.files)
    .slice(0, 8);
}

export function buildAssessmentTimelineData(
  assignments: Record<string, unknown>[],
  quizzes: Record<string, unknown>[],
): AssessmentTimelinePoint[] {
  const buckets = new Map<string, { date: Date; assignments: number; quizzes: number }>();

  const addEvent = (timestamp: number, field: "assignments" | "quizzes"): void => {
    const monday = mondayFromTimestamp(timestamp);
    const key = monday.toISOString().slice(0, 10);
    const current = buckets.get(key) ?? { date: monday, assignments: 0, quizzes: 0 };
    current[field] += 1;
    buckets.set(key, current);
  };

  assignments.forEach((assignment) => {
    const dueDate = asNumber(assignment.duedate);
    if (dueDate !== null && dueDate > 0) {
      addEvent(dueDate, "assignments");
    }
  });

  quizzes.forEach((quiz) => {
    const timestamp = asNumber(quiz.timeclose) ?? asNumber(quiz.timeopen);
    if (timestamp !== null && timestamp > 0) {
      addEvent(timestamp, "quizzes");
    }
  });

  return [...buckets.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-16)
    .map((item) => ({
      name: new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short" }).format(item.date),
      assignments: item.assignments,
      quizzes: item.quizzes,
      total: item.assignments + item.quizzes,
    }));
}

export function buildAssignmentTurnaroundData(
  assignments: Record<string, unknown>[],
  submissionsByAssign: Record<number, Record<string, unknown>[]>,
  assignmentGradesByAssign: Record<number, Record<string, unknown>[]>,
): AssignmentTurnaroundPoint[] {
  return assignments.flatMap((assignment) => {
    const assignId = asNumber(assignment.id);
    const maxGrade = asNumber(assignment.grade) ?? 10;
    if (assignId === null) {
      return [];
    }

    const submissions = submissionsByAssign[assignId] ?? [];
    const grades = assignmentGradesByAssign[assignId] ?? [];
    const gradeMap = new Map<number, Record<string, unknown>>();
    grades.forEach((grade) => {
      const userId = asNumber(grade.userid);
      if (userId !== null) {
        gradeMap.set(userId, grade);
      }
    });

    const gradingDays = submissions.flatMap((submission) => {
      const userId = asNumber(submission.userid);
      const submissionTime = asNumber(submission.timemodified) ?? asNumber(submission.timecreated);
      if (userId === null || submissionTime === null) {
        return [];
      }

      const grade = gradeMap.get(userId);
      const gradeTime = asNumber(grade?.timemodified) ?? asNumber(grade?.timecreated);
      if (gradeTime === null || gradeTime < submissionTime) {
        return [];
      }

      return [(gradeTime - submissionTime) / 86400];
    });

    const scores = grades.flatMap((grade) => {
      const value = asNumber(grade.grade);
      if (value === null || maxGrade <= 0) {
        return [];
      }
      return [(value / maxGrade) * 100];
    });

    if (gradingDays.length === 0 && scores.length === 0) {
      return [];
    }

    return [{
      id: assignId,
      name: shortenLabel(String(assignment.name ?? `Assignment ${assignId}`), 20),
      gradingDays:
        gradingDays.length > 0
          ? Number((gradingDays.reduce((sum, value) => sum + value, 0) / gradingDays.length).toFixed(1))
          : 0,
      averageScore:
        scores.length > 0
          ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1))
          : null,
      graded: grades.length,
      submitted: submissions.length,
    }];
  })
    .sort((left, right) => right.gradingDays - left.gradingDays)
    .slice(0, 10);
}

export function buildStudentCompletionByTypeData(
  student: StudentAnalysis,
): Array<{ name: string; completed: number; pending: number; total: number }> {
  const totals = new Map<string, { completed: number; pending: number }>();

  student.completion.statuses.forEach((status) => {
    const modname = String(status.modname ?? "activity");
    const current = totals.get(modname) ?? { completed: 0, pending: 0 };
    const state = asNumber(status.state);

    if (state === 1 || state === 2) {
      current.completed += 1;
    } else {
      current.pending += 1;
    }

    totals.set(modname, current);
  });

  return [...totals.entries()]
    .map(([name, item]) => ({
      name: shortenLabel(name, 16),
      completed: item.completed,
      pending: item.pending,
      total: item.completed + item.pending,
    }))
    .sort((left, right) => right.total - left.total);
}

export function buildStudentGradingTurnaroundData(
  student: StudentAnalysis,
  assignments: Record<string, unknown>[],
  assignmentGradesByAssign: Record<number, Record<string, unknown>[]>,
): Array<{ name: string; days: number; gradePct: number | null }> {
  const assignmentMap = new Map<number, Record<string, unknown>>();
  assignments.forEach((assignment) => {
    const assignId = asNumber(assignment.id);
    if (assignId !== null) {
      assignmentMap.set(assignId, assignment);
    }
  });

  return student.submissions.flatMap((submission) => {
    const assignId = asNumber(submission.assignid);
    const submissionTime = asNumber(submission.timemodified) ?? asNumber(submission.timecreated);
    if (assignId === null || submissionTime === null) {
      return [];
    }

    const assignment = assignmentMap.get(assignId);
    if (!assignment) {
      return [];
    }

    const grade = (assignmentGradesByAssign[assignId] ?? []).find(
      (item) => asNumber(item.userid) === student.id,
    );
    const gradeTime = asNumber(grade?.timemodified) ?? asNumber(grade?.timecreated);
    if (gradeTime === null || gradeTime < submissionTime) {
      return [];
    }

    const maxGrade = asNumber(assignment.grade) ?? 10;
    const gradeValue = asNumber(grade?.grade);

    return [{
      name: shortenLabel(String(assignment.name ?? `Assignment ${assignId}`), 18),
      days: Number(((gradeTime - submissionTime) / 86400).toFixed(1)),
      gradePct: gradeValue !== null && maxGrade > 0 ? Number(((gradeValue / maxGrade) * 100).toFixed(1)) : null,
    }];
  })
    .sort((left, right) => right.days - left.days)
    .slice(0, 8);
}
