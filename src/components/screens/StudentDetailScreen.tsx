import { useMemo, useState } from "react";
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

import { generateStudentReport } from "../../analysis/reportAgent";
import { RISK_COLORS } from "../../constants/ui";
import { downloadTextFile, formatNumber, formatPercent, slugify } from "../../lib/format";
import { asNumber, averageNumbers, buildWeeklyActivityData, getRiskTone, QUIZ_FINISHED_STATES, shortenLabel } from "../../lib/uiData";
import type { AiSettings, CourseAnalysis, LanguageCode, StudentAnalysis } from "../../types";
import { ChartSurface } from "../common/ChartSurface";
import { MetricTile } from "../common/MetricTile";
import { ReportPane } from "../common/ReportPane";
import { TabBar } from "../common/TabBar";

export type StudentDetailScreenProps = {
  analysis: CourseAnalysis;
  aiSettings: AiSettings;
  language: LanguageCode;
  student: StudentAnalysis;
  onBack: () => void;
};

export function StudentDetailScreen(props: StudentDetailScreenProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<"overview" | "progress" | "assessments" | "ai">("overview");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const classMetrics = useMemo(() => props.analysis.students.map((student) => student.metrics), [props.analysis.students]);

  const percentileData = useMemo(() => {
    const subject = props.student.metrics;
    const fields: Array<{ label: string; value: number | null; values: number[] }> = [
      { label: "Engagement", value: subject.engagementScore, values: classMetrics.map((item) => item.engagementScore) },
      { label: "Completion", value: subject.completionRate, values: classMetrics.map((item) => item.completionRate ?? 0) },
      { label: "Submission", value: subject.submissionRate, values: classMetrics.map((item) => item.submissionRate ?? 0) },
      { label: "Quiz average", value: subject.quizAvgPct, values: classMetrics.map((item) => item.quizAvgPct ?? 0) },
    ];

    return fields.map((field) => {
      const current = field.value ?? 0;
      const percentile = field.values.filter((value) => value <= current).length / Math.max(field.values.length, 1);
      return { label: field.label, percentile: Math.round(percentile * 100) };
    });
  }, [classMetrics, props.student.metrics]);

  const radarData = useMemo(() => {
    const subject = props.student.metrics;
    const items = [
      { subject: "Engagement", student: subject.engagementScore, average: averageNumbers(classMetrics.map((item) => item.engagementScore)) ?? 0 },
      { subject: "Completion", student: subject.completionRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.completionRate)) ?? 0 },
      { subject: "Submissions", student: subject.submissionRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.submissionRate)) ?? 0 },
      { subject: "On time", student: subject.onTimeRate ?? 0, average: averageNumbers(classMetrics.map((item) => item.onTimeRate)) ?? 0 },
      { subject: "Quiz", student: subject.quizAvgPct ?? 0, average: averageNumbers(classMetrics.map((item) => item.quizAvgPct)) ?? 0 },
    ];

    return items.filter((item) => item.student > 0 || item.average > 0);
  }, [classMetrics, props.student.metrics]);

  const gradeTimeline = useMemo(() => {
    return [...props.student.metrics.gradeItems]
      .filter((item) => item.gradePct !== null)
      .sort((left, right) => (left.gradedAt ?? 0) - (right.gradedAt ?? 0))
      .map((item) => ({ name: shortenLabel(item.name, 18), grade: item.gradePct ?? 0 }));
  }, [props.student.metrics.gradeItems]);

  const activityBars = [
    { name: "Completion", value: props.student.metrics.completionRate ?? 0 },
    { name: "Submissions", value: props.student.metrics.submissionRate ?? 0 },
    { name: "On time", value: props.student.metrics.onTimeRate ?? 0 },
    { name: "Quizzes", value: props.student.metrics.quizCoverageRate ?? 0 },
    { name: "Engagement", value: props.student.metrics.engagementScore },
  ];

  const weeklyActivityData = useMemo(() => buildWeeklyActivityData(props.student.metrics.activityTimestamps), [props.student.metrics.activityTimestamps]);

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
            Back to dashboard
          </button>
          <div className="eyebrow">Student detail</div>
          <h2>{props.student.fullname}</h2>
          <p>{props.student.email || "No email available"} | Last access: {props.student.metrics.lastAccessLabel}</p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile label="Risk" value={props.student.riskLevel} tone={getRiskTone(props.student.riskLevel)} />
          <MetricTile label="Current grade" value={formatPercent(props.student.metrics.finalGradePct, 0)} tone="neutral" />
          <MetricTile label="Predicted grade" value={formatPercent(props.student.prediction.predictedGradePct, 0)} tone="neutral" />
        </div>
      </section>

      <section className="kpi-grid">
        <MetricTile label="Engagement" value={formatPercent(props.student.metrics.engagementScore, 0)} tone="accent" />
        <MetricTile label="Completion" value={formatPercent(props.student.metrics.completionRate, 0)} tone="neutral" />
        <MetricTile label="Submission rate" value={formatPercent(props.student.metrics.submissionRate, 0)} tone="neutral" />
        <MetricTile label="Late submissions" value={String(props.student.metrics.lateSubmissions)} tone="warning" />
        <MetricTile label="Forum posts" value={String(props.student.metrics.forumPostsCount)} tone="neutral" />
        <MetricTile label="Days inactive" value={String(props.student.metrics.daysSinceAccess)} tone="neutral" />
      </section>

      <TabBar
        activeTab={activeTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "progress", label: "Progress" },
          { id: "assessments", label: "Assessments" },
          { id: "ai", label: "AI report" },
        ]}
        onChange={(tabId) => setActiveTab(tabId as "overview" | "progress" | "assessments" | "ai")}
      />

      {activeTab === "overview" ? (
        <section className="dashboard-grid">
          <ChartSurface title="Student profile radar">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#eadfcb" />
                <PolarAngleAxis dataKey="subject" stroke="#7a6d5a" />
                <PolarRadiusAxis domain={[0, 100]} stroke="#c0b29a" />
                <Radar name="Class average" dataKey="average" stroke="#df8e2f" fill="#df8e2f" fillOpacity={0.14} />
                <Radar name="Student" dataKey="student" stroke="#0f7b6c" fill="#0f7b6c" fillOpacity={0.28} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Activity balance">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityBars} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eadfcb" />
                <XAxis type="number" domain={[0, 100]} stroke="#7a6d5a" />
                <YAxis type="category" dataKey="name" width={90} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="value" fill="#0f7b6c" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Percentile within class">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={percentileData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eadfcb" />
                <XAxis type="number" domain={[0, 100]} stroke="#7a6d5a" />
                <YAxis type="category" dataKey="label" width={90} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="percentile" fill="#df8e2f" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">Flags and actions</div>
                <h3>Risk factors and recommendations</h3>
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

      {activeTab === "progress" ? (
        <section className="dashboard-grid">
          <ChartSurface title="Grade timeline">
            {gradeTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gradeTimeline}>
                  <CartesianGrid vertical={false} stroke="#eadfcb" />
                  <XAxis dataKey="name" hide />
                  <YAxis stroke="#7a6d5a" />
                  <Tooltip />
                  <ReferenceLine y={props.analysis.passThresholdPct} stroke="#df8e2f" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="grade" stroke="#b54a2a" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">No graded activities available yet.</div>
            )}
          </ChartSurface>
          <ChartSurface title="Weekly activity">
            {weeklyActivityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivityData}>
                  <CartesianGrid vertical={false} stroke="#eadfcb" />
                  <XAxis dataKey="week" stroke="#7a6d5a" />
                  <YAxis allowDecimals={false} stroke="#7a6d5a" />
                  <Tooltip />
                  <Bar dataKey="events" fill="#2e7d5b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-empty">No activity timestamps are available for this student.</div>
            )}
          </ChartSurface>
          <ChartSurface title="Activity balance">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityBars} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eadfcb" />
                <XAxis type="number" domain={[0, 100]} stroke="#7a6d5a" />
                <YAxis type="category" dataKey="name" width={90} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="value" fill="#0f7b6c" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Percentile within class">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={percentileData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eadfcb" />
                <XAxis type="number" domain={[0, 100]} stroke="#7a6d5a" />
                <YAxis type="category" dataKey="label" width={90} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="percentile" fill="#df8e2f" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
        </section>
      ) : null}

      {activeTab === "assessments" ? (
        <>
          <section className="dashboard-grid">
            <ChartSurface title="Quiz history">
              {quizHistoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quizHistoryData}>
                    <CartesianGrid vertical={false} stroke="#eadfcb" />
                    <XAxis dataKey="name" stroke="#7a6d5a" />
                    <YAxis domain={[0, 100]} stroke="#7a6d5a" />
                    <Tooltip />
                    <ReferenceLine y={props.analysis.passThresholdPct} stroke="#df8e2f" strokeDasharray="5 5" />
                    <Bar dataKey="score" fill="#0f7b6c" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No completed quiz attempts were found.</div>
              )}
            </ChartSurface>
            <ChartSurface title="Submission lead time">
              {submissionLeadData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={submissionLeadData} layout="vertical">
                    <CartesianGrid horizontal={false} stroke="#eadfcb" />
                    <XAxis type="number" stroke="#7a6d5a" />
                    <YAxis type="category" dataKey="name" width={115} stroke="#7a6d5a" />
                    <Tooltip />
                    <ReferenceLine x={0} stroke="#7a6d5a" strokeDasharray="5 5" />
                    <Bar dataKey="days" radius={[0, 8, 8, 0]}>
                      {submissionLeadData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No assignments with due dates are available.</div>
              )}
            </ChartSurface>
          </section>

          <section className="surface student-table-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">Grade items</div>
                <h3>Recorded assessments</h3>
              </div>
            </div>
            <div className="student-table">
              <div className="student-table__head student-table__head--grades">
                <span>Activity</span>
                <span>Type</span>
                <span>Grade</span>
                <span>Max</span>
                <span>Percent</span>
              </div>
              {props.student.metrics.gradeItems.map((item) => (
                <div className="student-row student-row--static" key={`${item.name}-${item.id ?? item.maxGrade}`}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.feedback || "No feedback"}</small>
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

      {activeTab === "ai" ? (
        <section className="surface recommendations-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">AI report</div>
              <h3>Student summary</h3>
            </div>
            <button className="ghost-button" onClick={() => void handleGenerateReport()}>
              <Sparkles size={16} />
              Generate AI report
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
          <ReportPane title="Student AI report" markdown={report} loading={reportLoading} error={reportError} onDownload={() => downloadTextFile(`${slugify(props.student.fullname)}-report.md`, report)} />
        </section>
      ) : null}
    </main>
  );
}
