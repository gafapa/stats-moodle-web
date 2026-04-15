import { useCallback, useMemo } from "react";
import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { buildCourseComparisonMetrics } from "../../lib/courseInsights";
import { formatNumber } from "../../lib/format";
import { translate } from "../../lib/i18n";
import type { CourseAnalysis, LanguageCode } from "../../types";
import { ChartSurface } from "../common/ChartSurface";
import { MetricTile } from "../common/MetricTile";
import { TabBar } from "../common/TabBar";

export type CourseTrendsPanelProps = {
  analysis: CourseAnalysis;
  language: LanguageCode;
  activeSubtab: "comparison" | "progress";
  onSubtabChange: (value: "comparison" | "progress") => void;
};

function deltaTone(value: number | null): "danger" | "success" | "neutral" {
  if (value === null) {
    return "neutral";
  }
  if (value > 0) {
    return "success";
  }
  if (value < 0) {
    return "danger";
  }
  return "neutral";
}

export function CourseTrendsPanel(props: CourseTrendsPanelProps): JSX.Element {
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(props.language, key), [props.language]);

  const comparisonMetrics = useMemo(() => buildCourseComparisonMetrics(props.analysis), [props.analysis]);

  const comparisonChartData = useMemo(() => {
    return comparisonMetrics.map((item) => ({
      name:
        item.id === "events"
          ? t("activityEventsLabel")
          : item.id === "activeStudents"
            ? t("activeStudentsLabel")
            : item.id === "submissions"
              ? t("submissionEventsLabel")
              : t("forumPosts"),
      recent: item.recent,
      previous: item.previous,
    }));
  }, [comparisonMetrics, t]);

  const performanceTrendData = useMemo(() => {
    const gradeImproving = props.analysis.students.filter((student) => student.metrics.gradeTrend === "improving").length;
    const gradeStable = props.analysis.students.filter((student) => student.metrics.gradeTrend === "stable").length;
    const gradeDeclining = props.analysis.students.filter((student) => student.metrics.gradeTrend === "declining").length;
    const quizImproving = props.analysis.students.filter((student) => student.metrics.quizTrend === "improving").length;
    const quizStable = props.analysis.students.filter((student) => student.metrics.quizTrend === "stable").length;
    const quizDeclining = props.analysis.students.filter((student) => student.metrics.quizTrend === "declining").length;

    return [
      {
        name: t("gradeTrendLabel"),
        improving: gradeImproving,
        stable: gradeStable,
        declining: gradeDeclining,
      },
      {
        name: t("quizTrendLabel"),
        improving: quizImproving,
        stable: quizStable,
        declining: quizDeclining,
      },
    ];
  }, [props.analysis.students, t]);

  return (
    <div className="dashboard-section-stack">
      <TabBar
        activeTab={props.activeSubtab}
        ariaLabel={t("trends")}
        variant="subtle"
        items={[
          { id: "comparison", label: t("trendComparisonView") },
          { id: "progress", label: t("performanceView") },
        ]}
        onChange={(tabId) => props.onSubtabChange(tabId as "comparison" | "progress")}
      />

      {props.activeSubtab === "comparison" ? (
        <>
          <section className="kpi-grid">
            {comparisonMetrics.map((metric) => (
              <MetricTile
                key={metric.id}
                label={
                  metric.id === "events"
                    ? t("activityEventsLabel")
                    : metric.id === "activeStudents"
                      ? t("activeStudentsLabel")
                      : metric.id === "submissions"
                        ? t("submissionEventsLabel")
                        : t("forumPosts")
                }
                value={`${metric.recent}`}
                caption={
                  metric.deltaPct === null
                    ? t("noPreviousWindowData")
                    : `${formatNumber(metric.deltaPct, 1)}%`
                }
                tone={deltaTone(metric.deltaPct)}
              />
            ))}
          </section>
          <section className="dashboard-grid">
            <ChartSurface title={t("recentVsPrevious")} eyebrow={t("trends")} description={t("courseMomentumHelp")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonChartData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="recent" name={t("recentWindow")} fill="#2563eb" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="previous" name={t("previousWindow")} fill="#94a3b8" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartSurface>
            <section className="surface summary-surface">
              <div className="panel-header">
                <div>
                  <div className="eyebrow">{t("trends")}</div>
                  <h3>{t("courseMomentum")}</h3>
                  <p className="panel-description">{t("courseMomentumHelp")}</p>
                </div>
              </div>
              <div className="summary-grid summary-grid--tight">
                {comparisonMetrics.map((metric) => (
                  <div className="summary-card" key={metric.id}>
                    <span>
                      {metric.id === "events"
                        ? t("activityEventsLabel")
                        : metric.id === "activeStudents"
                          ? t("activeStudentsLabel")
                          : metric.id === "submissions"
                            ? t("submissionEventsLabel")
                            : t("forumPosts")}
                    </span>
                    <strong>{metric.recent}</strong>
                    <small>
                      {metric.deltaPct === null
                        ? t("noPreviousWindowData")
                        : `${t("deltaLabel")}: ${formatNumber(metric.deltaPct, 1)}%`}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </>
      ) : null}

      {props.activeSubtab === "progress" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("trendStates")} eyebrow={t("trends")} description={t("trendStatesHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceTrendData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="improving" name={t("improving")} fill="#21a179" radius={[10, 10, 0, 0]} />
                <Bar dataKey="stable" name={t("stable")} fill="#94a3b8" radius={[10, 10, 0, 0]} />
                <Bar dataKey="declining" name={t("declining")} fill="#d95b5b" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("trends")}</div>
                <h3>{t("performanceSignals")}</h3>
                <p className="panel-description">{t("performanceSignalsHelp")}</p>
              </div>
            </div>
            <div className="summary-grid summary-grid--tight">
              <div className="summary-card">
                <span>{t("gradeTrendLabel")}</span>
                <strong>{performanceTrendData[0]?.declining ?? 0}</strong>
                <small>{t("declining")}</small>
              </div>
              <div className="summary-card">
                <span>{t("quizTrendLabel")}</span>
                <strong>{performanceTrendData[1]?.declining ?? 0}</strong>
                <small>{t("declining")}</small>
              </div>
              <div className="summary-card">
                <span>{t("improving")}</span>
                <strong>{(performanceTrendData[0]?.improving ?? 0) + (performanceTrendData[1]?.improving ?? 0)}</strong>
                <small>{t("studentsShowingRecovery")}</small>
              </div>
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
