import { clamp } from "../lib/format";
import type {
  CollectedCourseData,
  CourseAnalysis,
  CourseMetrics,
  GradePrediction,
  RiskLevel,
  StudentAnalysis,
  StudentMetrics,
} from "../types";
import { StudentMetricsComputer } from "./metrics";

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  return filtered.length > 0 ? round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : null;
}

class GradePredictor {
  constructor(private readonly passThresholdPct: number) {}

  predict(metrics: StudentMetrics): GradePrediction {
    const accessPenalty = Math.max(0, Math.min(metrics.daysSinceAccess, 90) - 7) * 0.5;
    const weighted: Array<[number, number]> = [
      [metrics.engagementScore, 0.35],
      [metrics.academicScore, 0.45],
    ];

    if (metrics.submissionRate !== null) {
      weighted.push([metrics.submissionRate, 0.2]);
    }

    const totalWeight = weighted.reduce((sum, [, weight]) => sum + weight, 0) || 1;
    const predictedPct = clamp(
      weighted.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight - accessPenalty,
      0,
      100,
    );
    const threshold = Math.max(this.passThresholdPct, 1);
    const riskProbability = predictedPct < threshold ? clamp((threshold - predictedPct) / threshold, 0, 1) : 0;
    const predictedGrade = (predictedPct / 100) * (metrics.courseTotalMax || 10);

    return {
      predictedGrade: round(predictedGrade, 2),
      predictedGradePct: round(predictedPct, 1),
      riskProbability: round(riskProbability, 2),
      method: "heuristic",
    };
  }
}

class RiskAssessor {
  constructor(private readonly passThresholdPct: number) {}

  assess(metrics: StudentMetrics, prediction: GradePrediction): { level: RiskLevel; factors: string[] } {
    const factors: string[] = [];
    let riskPoints = 0;

    if (metrics.daysSinceAccess > 14) {
      factors.push(`No course access for ${metrics.daysSinceAccess} days.`);
      riskPoints += metrics.daysSinceAccess > 30 ? 3 : 2;
    } else if (metrics.daysSinceAccess > 7) {
      factors.push(`Limited recent access: ${metrics.daysSinceAccess} days since last visit.`);
      riskPoints += 1;
    }

    if (metrics.totalAssignments > 0 && metrics.submissionRate !== null) {
      if (metrics.submissionRate < 50) {
        factors.push(`Only ${round(metrics.submissionRate, 0)}% of assignments have been submitted.`);
        riskPoints += 3;
      } else if (metrics.submissionRate < 75) {
        factors.push(`Assignment submission rate is below target at ${round(metrics.submissionRate, 0)}%.`);
        riskPoints += 1;
      }
    }

    if (metrics.finalGradePct !== null) {
      if (metrics.finalGradePct < this.passThresholdPct - 10) {
        factors.push(`Current grade is well below the passing threshold at ${round(metrics.finalGradePct, 0)}%.`);
        riskPoints += 3;
      } else if (metrics.finalGradePct < this.passThresholdPct + 5) {
        factors.push(`Current grade is close to the passing threshold at ${round(metrics.finalGradePct, 0)}%.`);
        riskPoints += 2;
      }
    }

    if (metrics.gradeTrend === "declining") {
      factors.push("Grade trend is declining.");
      riskPoints += 2;
    }

    if (metrics.engagementScore < 30) {
      factors.push(`Engagement score is critically low at ${round(metrics.engagementScore, 0)}/100.`);
      riskPoints += 2;
    } else if (metrics.engagementScore < 50) {
      factors.push(`Engagement score is below expectation at ${round(metrics.engagementScore, 0)}/100.`);
      riskPoints += 1;
    }

    if (metrics.totalActivities > 0 && metrics.completionRate !== null && metrics.completionRate < 40) {
      factors.push(`Only ${round(metrics.completionRate, 0)}% of tracked activities are complete.`);
      riskPoints += 2;
    }

    if (metrics.totalForums > 0 && metrics.forumPostsCount === 0) {
      factors.push("No forum participation detected.");
      riskPoints += 1;
    }

    if (metrics.totalQuizzes > 0 && metrics.quizCoverageRate !== null) {
      if (metrics.quizCoverageRate < 30) {
        factors.push(`Only ${round(metrics.quizCoverageRate, 0)}% of quizzes have been attempted.`);
        riskPoints += 2;
      } else if (metrics.quizCoverageRate < 60) {
        factors.push(`Quiz coverage is low at ${round(metrics.quizCoverageRate, 0)}%.`);
        riskPoints += 1;
      }
    }

    if (prediction.riskProbability > 0.7) {
      riskPoints += 2;
    } else if (prediction.riskProbability > 0.4) {
      riskPoints += 1;
    }

    const gradePct = metrics.finalGradePct;
    const predictedPct = prediction.predictedGradePct;
    const verySafe =
      gradePct !== null &&
      gradePct >= this.passThresholdPct + 30 &&
      prediction.riskProbability < 0.2;
    const clearlySafe =
      gradePct !== null &&
      gradePct >= this.passThresholdPct + 20 &&
      predictedPct >= this.passThresholdPct + 10 &&
      prediction.riskProbability < 0.35;

    if (verySafe) {
      riskPoints = Math.max(0, riskPoints - 3);
    } else if (clearlySafe) {
      riskPoints = Math.max(0, riskPoints - 2);
    }

    if (riskPoints >= 6) {
      return { level: "high", factors };
    }
    if (riskPoints >= 3) {
      return { level: "medium", factors };
    }
    return { level: "low", factors };
  }
}

class RecommendationEngine {
  constructor(private readonly passThresholdPct: number) {}

  forStudent(metrics: StudentMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.daysSinceAccess > 7) {
      recommendations.push(`Re-enter the course soon. The last visit was ${metrics.daysSinceAccess} days ago.`);
    }

    const missingAssignments = metrics.totalAssignments - metrics.submittedAssignments;
    if (metrics.totalAssignments > 0 && missingAssignments > 0) {
      recommendations.push(`There are ${missingAssignments} assignments still pending review or submission.`);
    }

    if (metrics.lateSubmissions > 0) {
      recommendations.push("Create a deadline plan to reduce late submissions.");
    }

    if (metrics.totalActivities > 0 && (metrics.completionRate ?? 0) < 60) {
      recommendations.push("Review the incomplete course activities before moving on.");
    }

    if (metrics.quizAvgPct !== null && metrics.quizAvgPct < this.passThresholdPct) {
      recommendations.push("Quiz performance is below target. Revisit the course materials before the next attempt.");
    }

    if (metrics.quizTrend === "declining") {
      recommendations.push("Quiz trend is declining. A tutor or teacher follow-up is advisable.");
    }

    if (metrics.totalForums > 0 && metrics.forumPostsCount === 0) {
      recommendations.push("Use the course forums to ask questions and increase participation.");
    }

    if (metrics.gradeTrend === "declining") {
      recommendations.push("The grade trend is deteriorating. Review the most recent topics and feedback.");
    }

    if (recommendations.length === 0) {
      recommendations.push("Performance is stable. Keep the current pace and consistency.");
    }

    return recommendations;
  }

  forTeacher(studentMetrics: Array<StudentMetrics & { riskLevel: RiskLevel }>, courseData: CollectedCourseData): string[] {
    if (studentMetrics.length === 0) {
      return [];
    }

    const total = studentMetrics.length;
    const highRisk = studentMetrics.filter((student) => student.riskLevel === "high").length;
    const inactive7d = studentMetrics.filter((student) => student.daysSinceAccess > 7).length;
    const averageEngagement = average(studentMetrics.map((student) => student.engagementScore)) ?? 0;
    const averageSubmissionRate = average(studentMetrics.map((student) => student.submissionRate));
    const forumStudents = studentMetrics.filter((student) => student.totalForums > 0);
    const withoutForumPosts = forumStudents.filter((student) => student.forumPostsCount === 0).length;
    const recommendations: string[] = [];

    if (highRisk > 0) {
      recommendations.push(`${highRisk} students are currently classified as high risk. Prioritize direct outreach.`);
    }

    if (inactive7d / total > 0.3) {
      recommendations.push(`${round((inactive7d / total) * 100, 0)}% of students have not accessed the course in the last 7 days.`);
    }

    if (averageEngagement < 50) {
      recommendations.push(`Average engagement is low at ${round(averageEngagement, 0)}/100. Consider more interactive checkpoints.`);
    }

    if (averageSubmissionRate !== null && averageSubmissionRate < 70) {
      recommendations.push(`Average assignment submission rate is ${round(averageSubmissionRate, 0)}%. Review task clarity and timing.`);
    }

    if (forumStudents.length > 0 && withoutForumPosts / forumStudents.length > 0.5) {
      recommendations.push("More than half of students have not posted in forums. Prompt discussion with guided questions.");
    }

    if (courseData.forums.length === 0) {
      recommendations.push("The course has no forums. Adding one can improve interaction and visibility into student confusion.");
    }

    return recommendations;
  }
}

export class CourseAnalyzer {
  private readonly predictor: GradePredictor;
  private readonly riskAssessor: RiskAssessor;
  private readonly recommendationEngine: RecommendationEngine;

  constructor(private readonly passThresholdPct: number) {
    this.predictor = new GradePredictor(passThresholdPct);
    this.riskAssessor = new RiskAssessor(passThresholdPct);
    this.recommendationEngine = new RecommendationEngine(passThresholdPct);
  }

  analyze(courseData: CollectedCourseData): CourseAnalysis {
    const students: StudentAnalysis[] = courseData.students.map((student) => {
      const metrics = new StudentMetricsComputer(student, courseData).compute();
      const prediction = this.predictor.predict(metrics);
      const { level, factors } = this.riskAssessor.assess(metrics, prediction);

      return {
        ...student,
        metrics,
        prediction,
        riskLevel: level,
        riskFactors: factors,
        recommendations: this.recommendationEngine.forStudent(metrics),
      };
    });

    const teacherMetrics = students.map((student) => ({
      ...student.metrics,
      riskLevel: student.riskLevel,
    }));

    return {
      ...courseData,
      students,
      courseMetrics: this.computeCourseMetrics(teacherMetrics),
      teacherRecommendations: this.recommendationEngine.forTeacher(teacherMetrics, courseData),
      passThresholdPct: this.passThresholdPct,
      logsAvailable: courseData.logsAvailable,
      mlUsed: false,
      analyzedAt: new Date().toISOString(),
    };
  }

  private computeCourseMetrics(allMetrics: Array<StudentMetrics & { riskLevel: RiskLevel }>): CourseMetrics {
    const grades = allMetrics
      .map((metrics) => metrics.finalGradePct)
      .filter((value): value is number => value !== null);

    const hasAssignments = allMetrics.some((metrics) => metrics.totalAssignments > 0);
    const hasQuizzes = allMetrics.some((metrics) => metrics.totalQuizzes > 0);
    const hasForums = allMetrics.some((metrics) => metrics.totalForums > 0);
    const hasCompletion = allMetrics.some((metrics) => metrics.totalActivities > 0);

    return {
      totalStudents: allMetrics.length,
      atRiskHigh: allMetrics.filter((metrics) => metrics.riskLevel === "high").length,
      atRiskMedium: allMetrics.filter((metrics) => metrics.riskLevel === "medium").length,
      atRiskLow: allMetrics.filter((metrics) => metrics.riskLevel === "low").length,
      hasCompletion,
      hasAssignments,
      hasQuizzes,
      hasForums,
      avgEngagement: average(allMetrics.map((metrics) => metrics.engagementScore)),
      avgCompletion: average(allMetrics.map((metrics) => metrics.completionRate)),
      avgSubmissionRate: average(allMetrics.map((metrics) => metrics.submissionRate)),
      avgGradePct: average(grades),
      gradeDistribution: this.gradeDistribution(grades),
      neverAccessed: allMetrics.filter((metrics) => metrics.daysSinceAccess > 90).length,
      inactive7d: allMetrics.filter((metrics) => metrics.daysSinceAccess > 7).length,
      noSubmissions: hasAssignments
        ? allMetrics.filter((metrics) => metrics.totalAssignments > 0 && metrics.submissionRate === 0).length
        : null,
      noForum: hasForums
        ? allMetrics.filter((metrics) => metrics.totalForums > 0 && metrics.forumPostsCount === 0).length
        : null,
    };
  }

  private gradeDistribution(grades: number[]): Record<string, number> {
    const ranges: Record<string, number> = {
      "0-19": 0,
      "20-39": 0,
      "40-59": 0,
      "60-79": 0,
      "80-100": 0,
    };

    grades.forEach((grade) => {
      if (grade < 20) {
        ranges["0-19"] += 1;
      } else if (grade < 40) {
        ranges["20-39"] += 1;
      } else if (grade < 60) {
        ranges["40-59"] += 1;
      } else if (grade < 80) {
        ranges["60-79"] += 1;
      } else {
        ranges["80-100"] += 1;
      }
    });

    return ranges;
  }
}
