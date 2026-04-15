import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { AlertTriangle, ArrowLeft, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MoodleClient } from "../../api/moodleClient";
import {
  buildStudentQuizQuestionAnalytics,
  emptyStudentQuizQuestionAnalytics,
  QUIZ_FINISHED_STATES,
  type StudentQuizQuestionAnalytics,
} from "../../analysis/quizReview";
import { generateStudentReport } from "../../analysis/reportAgent";
import { RISK_COLORS } from "../../constants/ui";
import { downloadTextFile, formatNumber, formatPercent, slugify } from "../../lib/format";
import { translate, translateRiskLevel } from "../../lib/i18n";
import {
  asNumber,
  averageNumbers,
  buildActivityHeatmapData,
  buildPersistenceConsistencyData,
  buildStudentCompletionByTypeData,
  buildStudentForumInteractionData,
  buildStudentGradingTurnaroundData,
  buildStudentSubmissionStatusData,
  buildWeeklyActivityData,
  getRiskTone,
  shortenLabel,
} from "../../lib/uiData";
import type { AiSettings, CourseAnalysis, LanguageCode, StudentAnalysis } from "../../types";
import { ChartSurface } from "../common/ChartSurface";
import { HeatmapGrid } from "../common/HeatmapGrid";
import { MetricTile } from "../common/MetricTile";
import { ReportPane } from "../common/ReportPane";
import { TabBar } from "../common/TabBar";

export type StudentDetailScreenProps = {
  client: MoodleClient;
  analysis: CourseAnalysis;
  aiSettings: AiSettings;
  language: LanguageCode;
  student: StudentAnalysis;
  onBack: () => void;
};

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;

  async function consume(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  return results;
}

export function StudentDetailScreen(props: StudentDetailScreenProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "assessments" | "prediction" | "ai">("overview");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [questionAnalytics, setQuestionAnalytics] = useState<StudentQuizQuestionAnalytics | null>(null);
  const [questionAnalyticsLoading, setQuestionAnalyticsLoading] = useState(false);
  const [questionAnalyticsError, setQuestionAnalyticsError] = useState<string | null>(null);
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(props.language, key), [props.language]);

  useEffect(() => {
    setQuestionAnalytics(null);
    setQuestionAnalyticsLoading(false);
    setQuestionAnalyticsError(null);
  }, [props.student.id]);

  const classMetrics = useMemo(() => props.analysis.students.map((student) => student.metrics), [props.analysis.students]);

  const percentileData = useMemo(() => {
    const subject = props.student.metrics;
    const fields: Array<{ label: string; value: number | null; values: number[] }> = [
      { label: t("engagement"), value: subject.engagementScore, values: classMetrics.map((item) => item.engagementScore) },
      { label: t("completion"), value: subject.completionRate, values: classMetrics.map((item) => item.completionRate ?? 0) },
      { label: t("submissionRate"), value: subject.submissionRate, values: classMetrics.map((item) => item.submissionRate ?? 0) },
      { label: t("quizAverage"), value: subject.quizAvgPct, values: classMetrics.map((item) => item.quizAvgPct ?? 0) },
    ];

    return fields.map((field) => {
      const current = field.value ?? 0;
      const percentile = field.values.filter((value) => value <= current).length / Math.max(field.values.length, 1);
      return { label: field.label, percentile: Math.round(percentile * 100) };
    });
  }, [classMetrics, props.student.metrics, t]);

  const radarData = useMemo(() => {
    const subject = props.student.metrics;
    const items = [
      { subject: t("engagement"), student: subject.engagementScore, average: averageNumbers(classMetrics.map((item) => item.engagementScore)) ?? 0 },
      { subject: t("completion"), student: subject.completionRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.completionRate)) ?? 0 },
      { subject: t("submissionRate"), student: subject.submissionRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.submissionRate)) ?? 0 },
      { subject: t("onTimeRate"), student: subject.onTimeRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.onTimeRate)) ?? 0 },
      { subject: t("quizAverage"), student: subject.quizAvgPct ?? 0, average: averageNumbers(classMetrics.map((item) => item.quizAvgPct)) ?? 0 },
    ];

    return items.filter((item) => item.student > 0 || item.average > 0);
  }, [classMetrics, props.student.metrics, t]);

  const gradeTimeline = useMemo(() => {
    return [...props.student.metrics.gradeItems]
      .filter((item) => item.gradePct !== null)
      .sort((left, right) => (left.gradedAt ?? 0) - (right.gradedAt ?? 0))
      .map((item) => ({ name: shortenLabel(item.name, 18), grade: item.gradePct ?? 0 }));
  }, [props.student.metrics.gradeItems]);

  const activityBars = [
    { name: t("completion"), value: props.student.metrics.completionRate ?? 0 },
    { name: t("submissionRate"), value: props.student.metrics.submissionRate ?? 0 },
    { name: t("onTimeRate"), value: props.student.metrics.onTimeRate ?? 0 },
    { name: t("assessments"), value: props.student.metrics.quizCoverageRate ?? 0 },
    { name: t("engagement"), value: props.student.metrics.engagementScore },
  ];

  const weeklyActivityData = useMemo(() => buildWeeklyActivityData(props.student.metrics.activityTimestamps), [props.student.metrics.activityTimestamps]);
  const activityHeatmap = useMemo(() => buildActivityHeatmapData(props.student.metrics.activityTimestamps), [props.student.metrics.activityTimestamps]);
  const studentPunctualityData = useMemo(
    () => buildStudentSubmissionStatusData(props.student, props.analysis.assignments),
    [props.student, props.analysis.assignments],
  );
  const forumInteractionData = useMemo(
    () => buildStudentForumInteractionData(props.student),
    [props.student],
  );
  const completionByTypeData = useMemo(
    () => buildStudentCompletionByTypeData(props.student),
    [props.student],
  );
  const persistencePoint = useMemo(() => {
    return buildPersistenceConsistencyData(props.analysis.students).find((item) => item.id === props.student.id) ?? null;
  }, [props.analysis.students, props.student.id]);
  const gradingTurnaroundData = useMemo(
    () =>
      buildStudentGradingTurnaroundData(
        props.student,
        props.analysis.assignments,
        props.analysis.assignmentGradesByAssign,
      ),
    [props.student, props.analysis.assignments, props.analysis.assignmentGradesByAssign],
  );
  const finishedQuizAttempts = useMemo(() => {
    return props.student.quizAttempts.flatMap((attempt) => {
      const attemptId = asNumber(attempt.id);
      const quizId = asNumber(attempt.quizid);
      if (
        attemptId === null ||
        quizId === null ||
        !QUIZ_FINISHED_STATES.has(String(attempt.state ?? ""))
      ) {
        return [];
      }

      return [{ attemptId, quizId }];
    });
  }, [props.student.quizAttempts]);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionAnalytics(): Promise<void> {
      if (activeTab !== "assessments" || questionAnalytics !== null || questionAnalyticsLoading) {
        return;
      }

      if (finishedQuizAttempts.length === 0) {
        setQuestionAnalytics(emptyStudentQuizQuestionAnalytics());
        return;
      }

      setQuestionAnalyticsLoading(true);
      setQuestionAnalyticsError(null);

      try {
        const reviews = await mapWithConcurrency(finishedQuizAttempts, 4, async (attempt) => {
          try {
            const review = await props.client.getAttemptReview(attempt.attemptId);
            return { ...attempt, review };
          } catch {
            return null;
          }
        });

        if (cancelled) {
          return;
        }

        const successfulReviews = reviews.filter((item): item is NonNullable<typeof item> => item !== null);
        if (successfulReviews.length === 0) {
          setQuestionAnalyticsError(t("questionReviewUnavailable"));
          setQuestionAnalytics(emptyStudentQuizQuestionAnalytics());
          return;
        }

        setQuestionAnalytics(
          buildStudentQuizQuestionAnalytics(props.analysis.quizzes, successfulReviews),
        );
      } catch (error) {
        if (!cancelled) {
          setQuestionAnalyticsError(
            error instanceof Error ? error.message : t("questionReviewUnavailable"),
          );
          setQuestionAnalytics(emptyStudentQuizQuestionAnalytics());
        }
      } finally {
        if (!cancelled) {
          setQuestionAnalyticsLoading(false);
        }
      }
    }

    void loadQuestionAnalytics();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    finishedQuizAttempts,
    props.analysis.quizzes,
    props.client,
    props.student,
    questionAnalytics,
    questionAnalyticsLoading,
    t,
  ]);

  const quizHistoryData = useMemo(() => {
    const quizMap = new Map<number, Record<string, unknown>>();
    props.analysis.quizzes.forEach((quiz) => {
      const quizId = asNumber(quiz.id);
      if (quizId !== null) {
        quizMap.set(quizId, quiz);
      }
    });

    return props.student.quizAttempts.flatMap((attempt, index) => {
      if (!QUIZ_FINISHED_STATES.has(String(attempt.state ?? ""))) {
        return [];
      }

      const quizId = asNumber(attempt.quizid);
      const grade = asNumber(attempt.grade);
      if (quizId === null || grade === null) {
        return [];
      }

      const quiz = quizMap.get(quizId);
      const maxGrade = asNumber(quiz?.grade) ?? 10;
      if (maxGrade <= 0) {
        return [];
      }

      return [{ name: shortenLabel(String(quiz?.name ?? `Quiz ${quizId}`), 16), score: (grade / maxGrade) * 100, order: index + 1 }];
    });
  }, [props.analysis.quizzes, props.student.quizAttempts]);

  const submissionLeadData = useMemo(() => {
    const submissionMap = new Map<number, Record<string, unknown>>();
    props.student.submissions.forEach((submission) => {
      const assignId = asNumber(submission.assignid);
      if (assignId !== null) {
        submissionMap.set(assignId, submission);
      }
    });

    return props.analysis.assignments.flatMap((assignment) => {
      const assignId = asNumber(assignment.id);
      const dueDate = asNumber(assignment.duedate);
      if (assignId === null || dueDate === null) {
        return [];
      }

      const submission = submissionMap.get(assignId);
      const submittedAt = asNumber(submission?.timemodified) ?? asNumber(submission?.timecreated);

      if (submittedAt !== null) {
        return [{
          name: shortenLabel(String(assignment.name ?? `Assignment ${assignId}`), 18),
          days: (dueDate - submittedAt) / 86400,
          fill: submittedAt <= dueDate ? RISK_COLORS.low : RISK_COLORS.high,
        }];
      }

      return [{
        name: shortenLabel(String(assignment.name ?? `Assignment ${assignId}`), 18),
        days: -7,
        fill: RISK_COLORS.high,
      }];
    }).slice(-10);
  }, [props.analysis.assignments, props.student.submissions]);

  const predictionData = useMemo(() => {
    return [
      { name: t("currentGrade"), value: props.student.metrics.finalGradePct ?? 0, fill: "#2563eb" },
      { name: t("predictedGrade"), value: props.student.prediction.predictedGradePct, fill: "#f59e0b" },
    ];
  }, [props.student.metrics.finalGradePct, props.student.prediction.predictedGradePct, t]);

  const predictionPercent = Math.round(props.student.prediction.riskProbability * 100);

  async function handleGenerateReport(): Promise<void> {
    setReportLoading(true);
    setReportError(null);
    try {
      const markdown = await generateStudentReport(props.analysis, props.student, props.aiSettings, props.language);
      setReport(markdown);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <main className="student-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <button className="ghost-button" onClick={props.onBack}>
            <ArrowLeft size={16} />
            {t("backToDashboard")}
          </button>
          <div className="eyebrow">{t("studentDetail")}</div>
          <h2>{props.student.fullname}</h2>
          <p>{props.student.email || t("noEmail")} | {t("lastAccess")}: {props.student.metrics.lastAccessLabel}</p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile label={t("risk")} value={translateRiskLevel(props.language, props.student.riskLevel)} tone={getRiskTone(props.student.riskLevel)} />
          <MetricTile label={t("currentGrade")} value={formatPercent(props.student.metrics.finalGradePct, 0)} tone="neutral" />
          <MetricTile label={t("predictedGrade")} value={formatPercent(props.student.prediction.predictedGradePct, 0)} tone="neutral" />
        </div>
      </section>

      <section className="kpi-grid">
        <MetricTile label={t("engagement")} value={formatPercent(props.student.metrics.engagementScore, 0)} tone="accent" />
        <MetricTile label={t("completion")} value={formatPercent(props.student.metrics.completionRate, 0)} tone="neutral" />
        <MetricTile label={t("submissionRate")} value={formatPercent(props.student.metrics.submissionRate, 0)} tone="neutral" />
        <MetricTile label={t("lateSubmissions")} value={String(props.student.metrics.lateSubmissions)} tone="warning" />
        <MetricTile label={t("forumPosts")} value={String(props.student.metrics.forumPostsCount)} tone="neutral" />
        <MetricTile label={t("daysInactive")} value={String(props.student.metrics.daysSinceAccess)} tone="neutral" />
      </section>

      <TabBar
        activeTab={activeTab}
        ariaLabel={t("sectionNavigation")}
        items={[
          { id: "overview", label: t("overview") },
          { id: "activity", label: t("activityAnalysis") },
          { id: "assessments", label: t("assessments") },
          { id: "prediction", label: t("prediction") },
          { id: "ai", label: t("aiReport") },
        ]}
        onChange={(tabId) => setActiveTab(tabId as "overview" | "activity" | "assessments" | "prediction" | "ai")}
      />

      {activeTab === "overview" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("studentProfileRadar")} eyebrow={t("visualization")} description={t("studentProfileRadarHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#dbe5f0" />
                <PolarAngleAxis dataKey="subject" stroke="#64748b" />
                <PolarRadiusAxis domain={[0, 100]} stroke="#cbd5e1" />
                <Radar name={t("classAverage")} dataKey="average" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} />
                <Radar name={t("student")} dataKey="student" stroke="#2563eb" fill="#2563eb" fillOpacity={0.24} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("percentileWithinClass")} eyebrow={t("visualization")} description={t("percentileWithinClassHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={percentileData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                <YAxis type="category" dataKey="label" width={100} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="percentile" fill="#f59e0b" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("flagsAndActions")}</div>
                <h3>{t("riskFactorsAndRecommendations")}</h3>
                <p className="panel-description">{t("riskFactorsAndRecommendationsHelp")}</p>
              </div>
            </div>
            <div className="stack-list">
              {props.student.riskFactors.map((factor) => (
                <div className="stack-list__item" key={factor}>
                  <AlertTriangle size={16} />
                  <span>{factor}</span>
                </div>
              ))}
              {props.student.recommendations.map((recommendation) => (
                <div className="stack-list__item stack-list__item--positive" key={recommendation}>
                  <Sparkles size={16} />
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("studentSummary")}</div>
                <h3>{props.student.fullname}</h3>
                <p className="panel-description">{t("studentSummaryHelp")}</p>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span>{t("quizAverage")}</span>
                <strong>{formatPercent(props.student.metrics.quizAvgPct, 0)}</strong>
                <small>{t("assessments")}</small>
              </div>
              <div className="summary-card">
                <span>{t("activeWeeks")}</span>
                <strong>{String(props.student.metrics.weeksActive)}</strong>
                <small>{t("weeklyActivity")}</small>
              </div>
              <div className="summary-card">
                <span>{t("submissionTiming")}</span>
                <strong>{formatNumber(props.student.metrics.submissionAvgAdvanceDays, 1)}d</strong>
                <small>{t("submissionLeadTime")}</small>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("activityBalance")} eyebrow={t("activityAnalysis")} description={t("activityBalanceHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityBars} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                <YAxis type="category" dataKey="name" width={100} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("weeklyActivity")} eyebrow={t("activityAnalysis")} description={t("weeklyActivityHelp")}>
            {weeklyActivityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivityData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="week" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="events" fill="#0f766e" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">{t("noActivityTimestamps")}</div>
            )}
          </ChartSurface>
          <ChartSurface title={t("activityHeatmap")} eyebrow={t("activityAnalysis")} description={t("activityHeatmapHelp")}>
            <HeatmapGrid heatmap={activityHeatmap} emptyLabel={t("noActivityTimestamps")} legendStart={t("riskLow")} legendEnd={t("riskHigh")} />
          </ChartSurface>
          <ChartSurface title={t("submissionStatus")} eyebrow={t("activityAnalysis")} description={t("submissionStatusHelp")}>
            {studentPunctualityData.some((item) => item.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studentPunctualityData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                    {studentPunctualityData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">{t("noAssignmentsWithDueDates")}</div>
            )}
          </ChartSurface>
          <ChartSurface title={t("forumInteraction")} eyebrow={t("activityAnalysis")} description={t("forumInteractionHelp")}>
            {forumInteractionData.some((item) => item.total > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forumInteractionData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                    {forumInteractionData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">{t("noForumPosts")}</div>
            )}
          </ChartSurface>
          <ChartSurface title={t("trackedCompletionByType")} eyebrow={t("activityAnalysis")} description={t("trackedCompletionByTypeHelp")}>
            {completionByTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={completionByTypeData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" name={t("completed")} fill="#21a179" radius={[10, 10, 0, 0]} stackId="completion" />
                  <Bar dataKey="pending" name={t("pending")} fill="#d95b5b" radius={[10, 10, 0, 0]} stackId="completion" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">{t("noTrackedCompletion")}</div>
            )}
          </ChartSurface>
          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("activityAnalysis")}</div>
                <h3>{t("predictionSummary")}</h3>
                <p className="panel-description">{t("predictionSummaryHelp")}</p>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span>{t("sessionCount")}</span>
                <strong>{String(props.student.metrics.sessionCount ?? 0)}</strong>
                <small>{t("activityAnalysis")}</small>
              </div>
              <div className="summary-card">
                <span>{t("avgSessionDuration")}</span>
                <strong>{formatNumber(props.student.metrics.avgSessionDurationMin, 0)} min</strong>
                <small>{t("sessionCount")}</small>
              </div>
              <div className="summary-card">
                <span>{t("activeWeeks")}</span>
                <strong>{String(props.student.metrics.weeksActive)}</strong>
                <small>{t("weeklyActivity")}</small>
              </div>
              <div className="summary-card">
                <span>{t("persistence")}</span>
                <strong>{formatPercent(persistencePoint?.persistence ?? null, 0)}</strong>
                <small>{t("persistenceConsistency")}</small>
              </div>
              <div className="summary-card">
                <span>{t("consistency")}</span>
                <strong>{formatPercent(persistencePoint?.consistency ?? null, 0)}</strong>
                <small>{t("persistenceConsistency")}</small>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "assessments" ? (
        <>
          <section className="dashboard-grid">
            <ChartSurface title={t("gradeTimeline")} eyebrow={t("assessments")} description={t("gradeTimelineHelp")}>
              {gradeTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gradeTimeline}>
                    <CartesianGrid vertical={false} stroke="#dbe5f0" />
                    <XAxis dataKey="name" hide />
                    <YAxis stroke="#64748b" />
                    <Tooltip />
                    <ReferenceLine y={props.analysis.passThresholdPct} stroke="#f59e0b" strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="grade" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{t("noGradedActivities")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("quizHistory")} eyebrow={t("assessments")} description={t("quizHistoryHelp")}>
              {quizHistoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quizHistoryData}>
                    <CartesianGrid vertical={false} stroke="#dbe5f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis domain={[0, 100]} stroke="#64748b" />
                    <Tooltip />
                    <ReferenceLine y={props.analysis.passThresholdPct} stroke="#f59e0b" strokeDasharray="5 5" />
                    <Bar dataKey="score" fill="#2563eb" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{t("noCompletedQuiz")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("submissionLeadTime")} eyebrow={t("assessments")} description={t("submissionLeadTimeHelp")}>
              {submissionLeadData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={submissionLeadData} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis type="category" dataKey="name" width={120} stroke="#64748b" />
                    <Tooltip />
                    <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="5 5" />
                    <Bar dataKey="days" radius={[0, 10, 10, 0]}>
                      {submissionLeadData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{t("noAssignmentsWithDueDates")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("questionOutcomeDistribution")} eyebrow={t("assessments")} description={t("questionOutcomeDistributionHelp")}>
              {questionAnalyticsLoading ? (
                <div className="chart-empty">{t("loadingQuestionReview")}</div>
              ) : questionAnalytics && questionAnalytics.reviewedQuestions > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={questionAnalytics.outcomeData}>
                    <CartesianGrid vertical={false} stroke="#dbe5f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis allowDecimals={false} stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                      {questionAnalytics.outcomeData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{questionAnalyticsError || t("noQuestionReviewData")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("weakestQuestions")} eyebrow={t("assessments")} description={t("weakestQuestionsHelp")}>
              {questionAnalyticsLoading ? (
                <div className="chart-empty">{t("loadingQuestionReview")}</div>
              ) : questionAnalytics && questionAnalytics.weakestQuestions.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={questionAnalytics.weakestQuestions} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                    <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                    <YAxis type="category" dataKey="name" width={150} stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="averageScore" fill="#d95b5b" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{questionAnalyticsError || t("noQuestionReviewData")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("questionTypePerformance")} eyebrow={t("assessments")} description={t("questionTypePerformanceHelp")}>
              {questionAnalyticsLoading ? (
                <div className="chart-empty">{t("loadingQuestionReview")}</div>
              ) : questionAnalytics && questionAnalytics.questionTypePerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={questionAnalytics.questionTypePerformance}>
                    <CartesianGrid vertical={false} stroke="#dbe5f0" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis domain={[0, 100]} stroke="#64748b" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="averageScore" name={t("averageScore")} fill="#2563eb" radius={[10, 10, 0, 0]} />
                    <Bar dataKey="correctRate" name={t("correctRate")} fill="#0f766e" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{questionAnalyticsError || t("noQuestionReviewData")}</div>
              )}
            </ChartSurface>
            <ChartSurface title={t("predictionSummary")} eyebrow={t("assessments")} description={t("predictionSummaryHelp")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={predictionData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis domain={[0, 100]} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {predictionData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSurface>
            <ChartSurface title={t("gradingTurnaround")} eyebrow={t("assessments")} description={t("studentGradingTurnaroundHelp")}>
              {gradingTurnaroundData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gradingTurnaroundData} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis type="category" dataKey="name" width={120} stroke="#64748b" />
                    <Tooltip />
                    <Bar dataKey="days" name={t("averageDays")} fill="#f59e0b" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">{t("noGradedAssignmentsYet")}</div>
              )}
            </ChartSurface>
          </section>

          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("assessments")}</div>
                <h3>{t("questionReviewSummary")}</h3>
                <p className="panel-description">{t("questionReviewSummaryHelp")}</p>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span>{t("reviewedAttempts")}</span>
                <strong>{String(questionAnalytics?.reviewedAttempts ?? 0)}</strong>
                <small>{t("quizHistory")}</small>
              </div>
              <div className="summary-card">
                <span>{t("reviewedQuestions")}</span>
                <strong>{String(questionAnalytics?.reviewedQuestions ?? 0)}</strong>
                <small>{t("questionOutcomeDistribution")}</small>
              </div>
              <div className="summary-card">
                <span>{t("averageQuestionScore")}</span>
                <strong>{formatPercent(questionAnalytics?.averageScore ?? null, 0)}</strong>
                <small>{t("questionTypePerformance")}</small>
              </div>
              <div className="summary-card">
                <span>{t("correctRate")}</span>
                <strong>{formatPercent(questionAnalytics?.correctRate ?? null, 0)}</strong>
                <small>{t("questionOutcomeDistribution")}</small>
              </div>
            </div>
          </section>

          <section className="surface student-table-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("gradeItems")}</div>
                <h3>{t("recordedAssessments")}</h3>
                <p className="panel-description">{t("recordedAssessmentsHelp")}</p>
              </div>
            </div>
            <div className="student-table">
              <div className="student-table__head student-table__head--grades">
                <span>{t("activity")}</span>
                <span>{t("type")}</span>
                <span>{t("grade")}</span>
                <span>{t("max")}</span>
                <span>{t("percent")}</span>
              </div>
              {props.student.metrics.gradeItems.map((item) => (
                <div className="student-row student-row--static" key={`${item.name}-${item.id ?? item.maxGrade}`}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.feedback || t("noFeedback")}</small>
                  </span>
                  <span>{item.type ?? item.modname ?? "N/A"}</span>
                  <span>{formatNumber(item.grade, 2)}</span>
                  <span>{formatNumber(item.maxGrade, 1)}</span>
                  <span>{formatPercent(item.gradePct, 0)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "prediction" ? (
        <section className="dashboard-grid">
          <section className="surface prediction-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("prediction")}</div>
                <h3>{t("predictionSummary")}</h3>
                <p className="panel-description">{t("predictionSummaryHelp")}</p>
              </div>
            </div>
            <div className="prediction-meter">
              <div className="prediction-meter__labels">
                <span>{t("riskProbability")}</span>
                <strong>{predictionPercent}%</strong>
              </div>
              <div className="prediction-meter__track">
                <div className="prediction-meter__fill" style={{ width: `${predictionPercent}%`, backgroundColor: RISK_COLORS[props.student.riskLevel] }} />
              </div>
              <p>{t("predictionGaugeCaption")}</p>
            </div>
            <div className="summary-grid summary-grid--tight">
              <div className="summary-card">
                <span>{t("academicScore")}</span>
                <strong>{formatPercent(props.student.metrics.academicScore, 0)}</strong>
                <small>{t("currentGrade")}</small>
              </div>
              <div className="summary-card">
                <span>{t("engagement")}</span>
                <strong>{formatPercent(props.student.metrics.engagementScore, 0)}</strong>
                <small>{t("activityAnalysis")}</small>
              </div>
              <div className="summary-card">
                <span>{t("risk")}</span>
                <strong>{translateRiskLevel(props.language, props.student.riskLevel)}</strong>
                <small>{t("prediction")}</small>
              </div>
            </div>
          </section>
          <ChartSurface title={t("predictionSummary")} eyebrow={t("prediction")} description={t("predictionSummaryHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={predictionData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {predictionData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface recommendations-panel dashboard-span-2">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("flagsAndActions")}</div>
                <h3>{props.student.fullname}</h3>
                <p className="panel-description">{t("riskFactorsAndRecommendationsHelp")}</p>
              </div>
            </div>
            <div className="stack-list">
              {props.student.riskFactors.map((factor) => (
                <div className="stack-list__item" key={factor}>
                  <AlertTriangle size={16} />
                  <span>{factor}</span>
                </div>
              ))}
              {props.student.recommendations.map((recommendation) => (
                <div className="stack-list__item stack-list__item--positive" key={recommendation}>
                  <Sparkles size={16} />
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "ai" ? (
        <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("aiReport")}</div>
                <h3>{t("studentSummary")}</h3>
                <p className="panel-description">{t("aiReportHelp")}</p>
              </div>
            <button className="ghost-button" onClick={() => void handleGenerateReport()}>
              <Sparkles size={16} />
              {t("generateAiReport")}
            </button>
          </div>
          <div className="stack-list">
            {props.student.riskFactors.map((factor) => (
              <div className="stack-list__item" key={factor}>
                <AlertTriangle size={16} />
                <span>{factor}</span>
              </div>
            ))}
            {props.student.recommendations.map((recommendation) => (
              <div className="stack-list__item stack-list__item--positive" key={recommendation}>
                <Sparkles size={16} />
                <span>{recommendation}</span>
              </div>
            ))}
          </div>
          <ReportPane
            title={t("studentSummary")}
            markdown={report}
            loading={reportLoading}
            error={reportError}
            language={props.language}
            onDownload={() => downloadTextFile(`${slugify(props.student.fullname)}-report.md`, report)}
          />
        </section>
      ) : null}
    </main>
  );
}
