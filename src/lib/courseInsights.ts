import type { CourseAnalysis, StudentAnalysis } from "../types";
import { formatPercent, round } from "./format";
import { asNumber } from "./uiData";

export type InsightSeverity = "high" | "medium" | "info";

export type CourseAlert = {
  id:
    | "highRiskConcentration"
    | "recentActivityDrop"
    | "submissionBacklog"
    | "silentForumMajority"
    | "decliningPerformance";
  severity: InsightSeverity;
  count: number;
  studentIds: number[];
};

export type StudentSegment = {
  id:
    | "highRisk"
    | "inactive14d"
    | "missingAssignments"
    | "silentForum"
    | "activeLowGrade"
    | "improving"
    | "declining";
  count: number;
  studentIds: number[];
};

export type InterventionCandidate = {
  studentId: number;
  name: string;
  priorityScore: number;
  riskLevel: StudentAnalysis["riskLevel"];
  currentGradeLabel: string;
  predictedGradeLabel: string;
  reason: string;
  action: string;
};

export type CourseComparisonMetric = {
  id: "events" | "activeStudents" | "submissions" | "forumPosts";
  recent: number;
  previous: number;
  deltaPct: number | null;
};

export type StudentMomentumMetric = {
  id: "events" | "submissions" | "forumPosts";
  recent: number;
  previous: number;
  deltaPct: number | null;
};

function windowStart(offsetDays: number): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return Math.floor(date.getTime() / 1000);
}

function computeDeltaPct(recent: number, previous: number): number | null {
  if (previous === 0) {
    return recent > 0 ? 100 : null;
  }
  return round(((recent - previous) / previous) * 100, 1);
}

function countValuesInWindow(values: number[], start: number, end: number): number {
  return values.filter((value) => value >= start && value < end).length;
}

function getSubmissionTimestamp(item: Record<string, unknown>): number | null {
  return asNumber(item.timemodified) ?? asNumber(item.timecreated);
}

function getForumTimestamp(item: Record<string, unknown>): number | null {
  return asNumber(item.modified) ?? asNumber(item.created);
}

export function buildCourseComparisonMetrics(analysis: CourseAnalysis): CourseComparisonMetric[] {
  const recentStart = windowStart(7);
  const previousStart = windowStart(14);
  const currentEnd = Math.floor(Date.now() / 1000);

  const recentEvents = analysis.students.reduce((sum, student) => {
    return sum + countValuesInWindow(student.metrics.activityTimestamps, recentStart, currentEnd);
  }, 0);
  const previousEvents = analysis.students.reduce((sum, student) => {
    return sum + countValuesInWindow(student.metrics.activityTimestamps, previousStart, recentStart);
  }, 0);

  const recentActiveStudents = analysis.students.filter((student) => {
    return countValuesInWindow(student.metrics.activityTimestamps, recentStart, currentEnd) > 0;
  }).length;
  const previousActiveStudents = analysis.students.filter((student) => {
    return countValuesInWindow(student.metrics.activityTimestamps, previousStart, recentStart) > 0;
  }).length;

  const recentSubmissions = analysis.students.reduce((sum, student) => {
    return sum + student.submissions.filter((submission) => {
      const timestamp = getSubmissionTimestamp(submission);
      return timestamp !== null && timestamp >= recentStart && timestamp < currentEnd;
    }).length;
  }, 0);
  const previousSubmissions = analysis.students.reduce((sum, student) => {
    return sum + student.submissions.filter((submission) => {
      const timestamp = getSubmissionTimestamp(submission);
      return timestamp !== null && timestamp >= previousStart && timestamp < recentStart;
    }).length;
  }, 0);

  const recentForumPosts = analysis.students.reduce((sum, student) => {
    return sum + student.forumPosts.filter((post) => {
      const timestamp = getForumTimestamp(post);
      return timestamp !== null && timestamp >= recentStart && timestamp < currentEnd;
    }).length;
  }, 0);
  const previousForumPosts = analysis.students.reduce((sum, student) => {
    return sum + student.forumPosts.filter((post) => {
      const timestamp = getForumTimestamp(post);
      return timestamp !== null && timestamp >= previousStart && timestamp < recentStart;
    }).length;
  }, 0);

  return [
    {
      id: "events",
      recent: recentEvents,
      previous: previousEvents,
      deltaPct: computeDeltaPct(recentEvents, previousEvents),
    },
    {
      id: "activeStudents",
      recent: recentActiveStudents,
      previous: previousActiveStudents,
      deltaPct: computeDeltaPct(recentActiveStudents, previousActiveStudents),
    },
    {
      id: "submissions",
      recent: recentSubmissions,
      previous: previousSubmissions,
      deltaPct: computeDeltaPct(recentSubmissions, previousSubmissions),
    },
    {
      id: "forumPosts",
      recent: recentForumPosts,
      previous: previousForumPosts,
      deltaPct: computeDeltaPct(recentForumPosts, previousForumPosts),
    },
  ];
}

export function buildCourseAlerts(analysis: CourseAnalysis): CourseAlert[] {
  const comparison = buildCourseComparisonMetrics(analysis);
  const students = analysis.students;
  const alerts: CourseAlert[] = [];

  const highRiskStudents = students.filter((student) => student.riskLevel === "high");
  if (highRiskStudents.length / Math.max(students.length, 1) >= 0.15) {
    alerts.push({
      id: "highRiskConcentration",
      severity: "high",
      count: highRiskStudents.length,
      studentIds: highRiskStudents.map((student) => student.id),
    });
  }

  const activeStudentsMetric = comparison.find((item) => item.id === "activeStudents");
  if (activeStudentsMetric && activeStudentsMetric.deltaPct !== null && activeStudentsMetric.deltaPct < -15) {
    alerts.push({
      id: "recentActivityDrop",
      severity: "medium",
      count: activeStudentsMetric.recent,
      studentIds: students
        .filter((student) => student.metrics.daysSinceAccess > 7)
        .map((student) => student.id),
    });
  }

  const backlogStudents = students.filter((student) => {
    return student.metrics.totalAssignments > 0 && (student.metrics.submissionRate ?? 100) < 60;
  });
  if (backlogStudents.length > 0) {
    alerts.push({
      id: "submissionBacklog",
      severity: backlogStudents.length >= 5 ? "high" : "medium",
      count: backlogStudents.length,
      studentIds: backlogStudents.map((student) => student.id),
    });
  }

  const silentForumStudents = students.filter((student) => {
    return student.metrics.totalForums > 0 && student.metrics.forumPostsCount === 0;
  });
  if (silentForumStudents.length > 0 && silentForumStudents.length / Math.max(students.length, 1) >= 0.5) {
    alerts.push({
      id: "silentForumMajority",
      severity: "info",
      count: silentForumStudents.length,
      studentIds: silentForumStudents.map((student) => student.id),
    });
  }

  const decliningStudents = students.filter((student) => {
    return student.metrics.gradeTrend === "declining" || student.metrics.quizTrend === "declining";
  });
  if (decliningStudents.length >= 3) {
    alerts.push({
      id: "decliningPerformance",
      severity: "medium",
      count: decliningStudents.length,
      studentIds: decliningStudents.map((student) => student.id),
    });
  }

  return alerts;
}

export function buildStudentSegments(analysis: CourseAnalysis): StudentSegment[] {
  const students = analysis.students;
  const segmentDefinitions: StudentSegment[] = [
    {
      id: "highRisk",
      count: students.filter((student) => student.riskLevel === "high").length,
      studentIds: students.filter((student) => student.riskLevel === "high").map((student) => student.id),
    },
    {
      id: "inactive14d",
      count: students.filter((student) => student.metrics.daysSinceAccess > 14).length,
      studentIds: students.filter((student) => student.metrics.daysSinceAccess > 14).map((student) => student.id),
    },
    {
      id: "missingAssignments",
      count: students.filter((student) => {
        return student.metrics.totalAssignments > 0 && (student.metrics.submissionRate ?? 100) < 50;
      }).length,
      studentIds: students
        .filter((student) => student.metrics.totalAssignments > 0 && (student.metrics.submissionRate ?? 100) < 50)
        .map((student) => student.id),
    },
    {
      id: "silentForum",
      count: students.filter((student) => {
        return student.metrics.totalForums > 0 && student.metrics.forumPostsCount === 0;
      }).length,
      studentIds: students
        .filter((student) => student.metrics.totalForums > 0 && student.metrics.forumPostsCount === 0)
        .map((student) => student.id),
    },
    {
      id: "activeLowGrade",
      count: students.filter((student) => {
        return student.metrics.engagementScore >= 60 && (student.metrics.finalGradePct ?? 100) < analysis.passThresholdPct;
      }).length,
      studentIds: students
        .filter((student) => student.metrics.engagementScore >= 60 && (student.metrics.finalGradePct ?? 100) < analysis.passThresholdPct)
        .map((student) => student.id),
    },
    {
      id: "improving",
      count: students.filter((student) => student.metrics.gradeTrend === "improving").length,
      studentIds: students.filter((student) => student.metrics.gradeTrend === "improving").map((student) => student.id),
    },
    {
      id: "declining",
      count: students.filter((student) => {
        return student.metrics.gradeTrend === "declining" || student.metrics.quizTrend === "declining";
      }).length,
      studentIds: students
        .filter((student) => student.metrics.gradeTrend === "declining" || student.metrics.quizTrend === "declining")
        .map((student) => student.id),
    },
  ];

  return segmentDefinitions.filter((segment) => segment.count > 0);
}

export function buildInterventionQueue(analysis: CourseAnalysis): InterventionCandidate[] {
  return analysis.students
    .map((student) => {
      let priorityScore = student.prediction.riskProbability * 100;

      if (student.metrics.daysSinceAccess > 14) {
        priorityScore += 18;
      }
      if ((student.metrics.submissionRate ?? 100) < 50) {
        priorityScore += 15;
      }
      if (student.metrics.gradeTrend === "declining") {
        priorityScore += 10;
      }
      if (student.metrics.quizTrend === "declining") {
        priorityScore += 8;
      }
      if ((student.metrics.finalGradePct ?? 100) < analysis.passThresholdPct) {
        priorityScore += 14;
      }

      const reasons: string[] = [];
      if (student.metrics.daysSinceAccess > 14) {
        reasons.push(`${student.metrics.daysSinceAccess} days inactive`);
      }
      if ((student.metrics.submissionRate ?? 100) < 50) {
        reasons.push("submission backlog");
      }
      if (student.metrics.gradeTrend === "declining") {
        reasons.push("declining grades");
      }
      if (student.metrics.totalForums > 0 && student.metrics.forumPostsCount === 0) {
        reasons.push("silent in forums");
      }

      const actions: string[] = [];
      if (student.metrics.daysSinceAccess > 7) {
        actions.push("contact immediately");
      }
      if ((student.metrics.submissionRate ?? 100) < 60) {
        actions.push("review pending assignments");
      }
      if ((student.metrics.finalGradePct ?? 100) < analysis.passThresholdPct) {
        actions.push("schedule academic follow-up");
      }

      return {
        studentId: student.id,
        name: student.fullname,
        priorityScore: round(priorityScore, 1),
        riskLevel: student.riskLevel,
        currentGradeLabel: formatPercent(student.metrics.finalGradePct, 0),
        predictedGradeLabel: formatPercent(student.prediction.predictedGradePct, 0),
        reason: reasons.join(" | ") || "monitor regularly",
        action: actions.join(" | ") || "maintain current support",
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 12);
}

export function buildStudentMomentum(student: StudentAnalysis): StudentMomentumMetric[] {
  const recentStart = windowStart(7);
  const previousStart = windowStart(14);
  const currentEnd = Math.floor(Date.now() / 1000);

  const recentEvents = countValuesInWindow(student.metrics.activityTimestamps, recentStart, currentEnd);
  const previousEvents = countValuesInWindow(student.metrics.activityTimestamps, previousStart, recentStart);

  const recentSubmissions = student.submissions.filter((submission) => {
    const timestamp = getSubmissionTimestamp(submission);
    return timestamp !== null && timestamp >= recentStart && timestamp < currentEnd;
  }).length;
  const previousSubmissions = student.submissions.filter((submission) => {
    const timestamp = getSubmissionTimestamp(submission);
    return timestamp !== null && timestamp >= previousStart && timestamp < recentStart;
  }).length;

  const recentForumPosts = student.forumPosts.filter((post) => {
    const timestamp = getForumTimestamp(post);
    return timestamp !== null && timestamp >= recentStart && timestamp < currentEnd;
  }).length;
  const previousForumPosts = student.forumPosts.filter((post) => {
    const timestamp = getForumTimestamp(post);
    return timestamp !== null && timestamp >= previousStart && timestamp < recentStart;
  }).length;

  return [
    {
      id: "events",
      recent: recentEvents,
      previous: previousEvents,
      deltaPct: computeDeltaPct(recentEvents, previousEvents),
    },
    {
      id: "submissions",
      recent: recentSubmissions,
      previous: previousSubmissions,
      deltaPct: computeDeltaPct(recentSubmissions, previousSubmissions),
    },
    {
      id: "forumPosts",
      recent: recentForumPosts,
      previous: previousForumPosts,
      deltaPct: computeDeltaPct(recentForumPosts, previousForumPosts),
    },
  ];
}
