import { formatDateFromTimestamp } from "../lib/format";
import type { GradeItem, StudentCourseData, StudentMetrics, TrendState } from "../types";

const QUIZ_FINISHED_STATES = new Set(["finished", "gradedright", "gradedwrong", "gradedpartial"]);

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export class StudentMetricsComputer {
  private readonly now = Math.floor(Date.now() / 1000);

  constructor(
    private readonly student: StudentCourseData,
    private readonly course: {
      assignments: Record<string, unknown>[];
      quizzes: Record<string, unknown>[];
      forums: Record<string, unknown>[];
    },
  ) {}

  compute(): StudentMetrics {
    const lastAccessTs = this.student.lastaccess ?? 0;
    const daysSinceAccess = lastAccessTs > 0 ? Math.max(0, Math.floor((this.now - lastAccessTs) / 86400)) : 999;
    const gradeItems = this.student.grades.items;
    const gradedItems = gradeItems.filter((item) => item.gradePct !== null);
    const submittedAssignments = this.student.submissions.filter((submission) => {
      const status = String(submission.status ?? "submitted");
      return !["new", "draft", "reopened"].includes(status);
    });
    const lateSubmissions = this.countLateSubmissions(submittedAssignments);
    const quizScores = this.computeQuizScores(this.student.quizAttempts);
    const attemptedQuizzes = new Set(
      this.student.quizAttempts
        .filter((attempt) => QUIZ_FINISHED_STATES.has(String(attempt.state ?? "")))
        .map((attempt) => asNumber(attempt.quizid))
        .filter((quizId): quizId is number => quizId !== null),
    );
    const activityTimestamps = this.collectActivityTimestamps();
    const sessions = this.estimateSessions(this.student.logs);
    const totalAssignments = this.course.assignments.length;
    const totalQuizzes = this.course.quizzes.length;
    const totalForums = this.course.forums.length;
    const totalActivities = this.student.completion.total;

    const metrics: StudentMetrics = {
      lastAccessTs,
      daysSinceAccess,
      lastAccessLabel: formatDateFromTimestamp(lastAccessTs),
      finalGrade: this.student.grades.finalGrade,
      finalGradePct: this.student.grades.finalGradePct,
      courseTotalMax: this.student.grades.courseTotalMax ?? 10,
      gradeItems,
      gradedItems,
      gradeAvgPct:
        gradedItems.length > 0
          ? gradedItems.reduce((sum, item) => sum + (item.gradePct ?? 0), 0) / gradedItems.length
          : null,
      gradeTrend: this.computeGradeTrend(gradeItems),
      completionRate: totalActivities > 0 ? (this.student.completion.completed / totalActivities) * 100 : null,
      completedActivities: this.student.completion.completed,
      totalActivities,
      totalAssignments,
      submittedAssignments: submittedAssignments.length,
      submissionRate: totalAssignments > 0 ? (submittedAssignments.length / totalAssignments) * 100 : null,
      lateSubmissions,
      onTimeRate:
        submittedAssignments.length > 0
          ? ((submittedAssignments.length - lateSubmissions) / submittedAssignments.length) * 100
          : totalAssignments > 0
            ? 0
            : null,
      totalQuizzes,
      quizAttemptsCount: this.student.quizAttempts.length,
      quizScores,
      quizAvgPct: quizScores.length > 0 ? quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length : null,
      quizTrend: this.computeTrend(quizScores, 3),
      quizUniqueAttempted: attemptedQuizzes.size,
      quizCoverageRate: totalQuizzes > 0 ? (attemptedQuizzes.size / totalQuizzes) * 100 : null,
      totalForums,
      forumPostsCount: this.student.forumPosts.length,
      forumDiscussionsStarted: new Set(
        this.student.forumPosts
          .filter((post) => asNumber(post.parent) === 0)
          .map((post) => asNumber(post.discussionid))
          .filter((discussionId): discussionId is number => discussionId !== null),
      ).size,
      logCount: this.student.logs.length,
      loginDays: this.countUniqueDays(this.student.logs),
      activityTimestamps,
      weeksActive: this.countUniqueWeeks(activityTimestamps),
      submissionAvgAdvanceDays: this.computeSubmissionAdvance(submittedAssignments),
      quizAvgTimeMin: this.computeQuizAverageTime(),
      sessionCount: sessions.sessionCount,
      avgSessionDurationMin: sessions.avgSessionDurationMin,
      engagementScore: 0,
      academicScore: 0,
    };

    metrics.engagementScore = this.computeEngagement(metrics);
    metrics.academicScore = this.computeAcademicScore(metrics);

    return metrics;
  }

  private computeGradeTrend(items: GradeItem[]): TrendState {
    const dated = items
      .filter((item) => item.gradedAt && item.gradePct !== null)
      .map((item) => ({ timestamp: item.gradedAt ?? 0, gradePct: item.gradePct ?? 0 }))
      .sort((left, right) => left.timestamp - right.timestamp)
      .map((item) => item.gradePct);

    return this.computeTrend(dated, 2);
  }

  private computeTrend(values: number[], threshold: number): TrendState {
    if (values.length < 2) {
      return "stable";
    }

    const x = values.map((_, index) => index);
    const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
    const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const numerator = x.reduce((sum, value, index) => sum + (value - xMean) * (values[index] - yMean), 0);
    const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0) || 1;
    const slope = numerator / denominator;

    if (slope > threshold) {
      return "improving";
    }
    if (slope < -threshold) {
      return "declining";
    }
    return "stable";
  }

  private computeQuizScores(attempts: Record<string, unknown>[]): number[] {
    return attempts.flatMap((attempt) => {
      if (!QUIZ_FINISHED_STATES.has(String(attempt.state ?? ""))) {
        return [];
      }

      const grade = asNumber(attempt.grade);
      const quizId = asNumber(attempt.quizid);
      if (grade === null || quizId === null) {
        return [];
      }

      const quiz = this.course.quizzes.find((item) => asNumber(item.id) === quizId);
      const maxGrade = asNumber(quiz?.grade) ?? 10;
      if (maxGrade <= 0) {
        return [];
      }

      return [(grade / maxGrade) * 100];
    });
  }

  private countLateSubmissions(submissions: Record<string, unknown>[]): number {
    return this.course.assignments.reduce((count, assignment) => {
      const assignmentId = asNumber(assignment.id);
      const dueDate = asNumber(assignment.duedate);
      if (!assignmentId || !dueDate) {
        return count;
      }

      const submission = submissions.find((item) => asNumber(item.assignid) === assignmentId);
      const submittedAt = asNumber(submission?.timemodified) ?? asNumber(submission?.timecreated);
      return submittedAt && submittedAt > dueDate ? count + 1 : count;
    }, 0);
  }

  private collectActivityTimestamps(): number[] {
    const timestamps = [
      ...this.student.submissions.map((submission) => asNumber(submission.timemodified) ?? asNumber(submission.timecreated)),
      ...this.student.quizAttempts.map((attempt) => asNumber(attempt.timestart) ?? asNumber(attempt.timefinish)),
      ...this.student.forumPosts.map((post) => asNumber(post.created) ?? asNumber(post.modified) ?? asNumber(post.timecreated)),
      ...this.student.logs.map((log) => asNumber(log.timecreated) ?? asNumber(log.time)),
    ].filter((timestamp): timestamp is number => timestamp !== null);

    return [...new Set(timestamps)].sort((left, right) => left - right);
  }

  private countUniqueWeeks(timestamps: number[]): number {
    const weeks = new Set(
      timestamps.map((timestamp) => {
        const date = new Date(timestamp * 1000);
        const year = date.getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const diff = Math.floor((date.getTime() - start.getTime()) / 86400000);
        const week = Math.floor(diff / 7);
        return `${year}-${week}`;
      }),
    );
    return weeks.size;
  }

  private countUniqueDays(logs: Record<string, unknown>[]): number {
    const days = new Set(
      logs
        .map((log) => asNumber(log.timecreated) ?? asNumber(log.time))
        .filter((timestamp): timestamp is number => timestamp !== null)
        .map((timestamp) => new Date(timestamp * 1000).toISOString().slice(0, 10)),
    );
    return days.size;
  }

  private computeSubmissionAdvance(submissions: Record<string, unknown>[]): number | null {
    const advances = this.course.assignments.flatMap((assignment) => {
      const assignmentId = asNumber(assignment.id);
      const dueDate = asNumber(assignment.duedate);
      if (!assignmentId || !dueDate) {
        return [];
      }

      const submission = submissions.find((item) => asNumber(item.assignid) === assignmentId);
      const submittedAt = asNumber(submission?.timemodified) ?? asNumber(submission?.timecreated);
      if (!submittedAt) {
        return [];
      }

      return [(dueDate - submittedAt) / 86400];
    });

    return advances.length > 0 ? advances.reduce((sum, value) => sum + value, 0) / advances.length : null;
  }

  private computeQuizAverageTime(): number | null {
    const durations = this.student.quizAttempts.flatMap((attempt) => {
      const start = asNumber(attempt.timestart);
      const finish = asNumber(attempt.timefinish);
      if (!start || !finish || finish <= start || finish - start >= 28800) {
        return [];
      }
      return [(finish - start) / 60];
    });

    return durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
  }

  private estimateSessions(logs: Record<string, unknown>[]): { sessionCount: number | null; avgSessionDurationMin: number | null } {
    const timestamps = logs
      .map((log) => asNumber(log.timecreated) ?? asNumber(log.time))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .sort((left, right) => left - right);

    if (timestamps.length === 0) {
      return { sessionCount: null, avgSessionDurationMin: null };
    }

    const sessions: Array<{ start: number; end: number }> = [];
    let start = timestamps[0];
    let end = timestamps[0];

    timestamps.slice(1).forEach((timestamp) => {
      if (timestamp - end > 1800) {
        sessions.push({ start, end });
        start = timestamp;
      }
      end = timestamp;
    });
    sessions.push({ start, end });

    const average = sessions.reduce((sum, session) => sum + (session.end - session.start) / 60, 0) / sessions.length;
    return { sessionCount: sessions.length, avgSessionDurationMin: average };
  }

  private computeEngagement(metrics: StudentMetrics): number {
    const weightedScores: Array<[number, number]> = [];

    if (metrics.completionRate !== null) {
      weightedScores.push([metrics.completionRate, 0.25]);
    }
    if (metrics.submissionRate !== null) {
      weightedScores.push([metrics.submissionRate, 0.25]);
    }

    weightedScores.push([Math.max(0, 100 - metrics.daysSinceAccess * (100 / 30)), 0.2]);

    if (metrics.totalForums > 0) {
      weightedScores.push([Math.min(100, metrics.forumPostsCount * 10), 0.15]);
    }
    if (metrics.totalQuizzes > 0) {
      weightedScores.push([Math.min(100, (metrics.quizUniqueAttempted / metrics.totalQuizzes) * 100), 0.15]);
    }

    const totalWeight = weightedScores.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    return weightedScores.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
  }

  private computeAcademicScore(metrics: StudentMetrics): number {
    const values = [metrics.finalGradePct, metrics.gradeAvgPct, metrics.quizAvgPct].filter(
      (value): value is number => value !== null,
    );
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
}
