import { useCallback, useMemo, useState } from "react";
import type { JSX } from "react";
import { ArrowLeft, ChevronRight, Search, ShieldAlert, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { generateCourseReport } from "../../analysis/reportAgent";
import { RISK_COLORS } from "../../constants/ui";
import { downloadTextFile, formatPercent, slugify } from "../../lib/format";
import { translate, translateRiskLevel } from "../../lib/i18n";
import {
  buildActivityHeatmapData,
  buildCourseFunnelData,
  buildForumRiskData,
  getGradeBandIndex,
  buildTopBottomComparisonData,
  shortenLabel,
} from "../../lib/uiData";
import type { AiSettings, CourseAnalysis, LanguageCode, RiskLevel } from "../../types";
import { ChartSurface } from "../common/ChartSurface";
import { HeatmapGrid } from "../common/HeatmapGrid";
import { MetricTile } from "../common/MetricTile";
import { ReportPane } from "../common/ReportPane";
import { TabBar } from "../common/TabBar";

export type DashboardScreenProps = {
  analysis: CourseAnalysis;
  aiSettings: AiSettings;
  language: LanguageCode;
  onBack: () => void;
  onOpenStudent: (studentId: number) => void;
};

export function DashboardScreen(props: DashboardScreenProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<"overview" | "risk" | "activity" | "students" | "ai">("overview");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(props.language, key), [props.language]);

  const students = useMemo(() => {
    return [...props.analysis.students].sort(
      (left, right) => right.prediction.riskProbability - left.prediction.riskProbability,
    );
  }, [props.analysis.students]);

  const filteredStudents = useMemo(() => {
    const lower = query.toLowerCase();
    return students.filter((student) => {
      return [student.fullname, student.email, student.riskLevel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lower));
    });
  }, [query, students]);

  const riskData = useMemo(() => {
    return [
      { name: t("riskHigh"), value: props.analysis.courseMetrics.atRiskHigh, fill: RISK_COLORS.high },
      { name: t("riskMedium"), value: props.analysis.courseMetrics.atRiskMedium, fill: RISK_COLORS.medium },
      { name: t("riskLow"), value: props.analysis.courseMetrics.atRiskLow, fill: RISK_COLORS.low },
    ];
  }, [props.analysis.courseMetrics, t]);

  const gradeDistributionData = useMemo(() => {
    return Object.entries(props.analysis.courseMetrics.gradeDistribution).map(([name, total]) => ({
      name,
      total,
    }));
  }, [props.analysis.courseMetrics.gradeDistribution]);

  const scatterGroups = useMemo(() => {
    const mapGroup = (riskLevel: RiskLevel) => students
      .filter((student) => student.riskLevel === riskLevel)
      .map((student) => ({
        name: student.fullname,
        engagement: Number(student.metrics.engagementScore.toFixed(1)),
        grade: student.metrics.finalGradePct ?? student.prediction.predictedGradePct,
        size: 70 + student.prediction.riskProbability * 260,
      }));

    return {
      high: mapGroup("high"),
      medium: mapGroup("medium"),
      low: mapGroup("low"),
    };
  }, [students]);

  const engagementHistogramData = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, index) => ({
      name: `${index * 10}-${index === 9 ? 100 : index * 10 + 9}`,
      total: 0,
      fill: index < 3 ? RISK_COLORS.high : index < 6 ? RISK_COLORS.medium : RISK_COLORS.low,
    }));

    students.forEach((student) => {
      const bucketIndex = Math.min(9, Math.floor(Math.max(0, Math.min(99, student.metrics.engagementScore)) / 10));
      buckets[bucketIndex].total += 1;
    });

    return buckets;
  }, [students]);

  const actualVsPredictedData = useMemo(() => {
    const ranges = [
      { name: "0-19", actual: 0, predicted: 0 },
      { name: "20-39", actual: 0, predicted: 0 },
      { name: "40-59", actual: 0, predicted: 0 },
      { name: "60-79", actual: 0, predicted: 0 },
      { name: "80-100", actual: 0, predicted: 0 },
    ];

    students.forEach((student) => {
      if (student.metrics.finalGradePct !== null) {
        ranges[getGradeBandIndex(student.metrics.finalGradePct)].actual += 1;
      }
      ranges[getGradeBandIndex(student.prediction.predictedGradePct)].predicted += 1;
    });

    return ranges;
  }, [students]);

  const topRiskData = useMemo(() => {
    return students
      .slice(0, 8)
      .map((student) => ({
        name: shortenLabel(student.fullname, 24),
        engagement: Number(student.metrics.engagementScore.toFixed(1)),
        fill: RISK_COLORS[student.riskLevel],
      }))
      .reverse();
  }, [students]);

  const heatmap = useMemo(() => {
    return buildActivityHeatmapData(students.flatMap((student) => student.metrics.activityTimestamps));
  }, [students]);

  const funnelData = useMemo(() => {
    return buildCourseFunnelData(students, props.analysis.passThresholdPct);
  }, [students, props.analysis.passThresholdPct]);

  const topBottomData = useMemo(() => buildTopBottomComparisonData(students), [students]);
  const forumRiskData = useMemo(() => buildForumRiskData(students), [students]);

  async function handleGenerateReport(): Promise<void> {
    setReportLoading(true);
    setReportError(null);
    try {
      const markdown = await generateCourseReport(props.analysis, props.aiSettings, props.language);
      setReport(markdown);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Unable to generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <main className="dashboard-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <button className="ghost-button" onClick={props.onBack}>
            <ArrowLeft size={16} />
            {t("backToCourseSelection")}
          </button>
          <div className="eyebrow">{t("courseDashboard")}</div>
          <h2>{props.analysis.course.fullname ?? props.analysis.course.shortname ?? t("courseDashboard")}</h2>
          <p>
            {t("passThreshold")}: {props.analysis.passThresholdPct}% | {t("logsAvailable")}: {props.analysis.logsAvailable ? t("yes") : t("no")}
          </p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile label={t("studentsCount")} value={String(props.analysis.courseMetrics.totalStudents)} tone="accent" />
          <MetricTile label={t("averageEngagement")} value={formatPercent(props.analysis.courseMetrics.avgEngagement, 0)} tone="neutral" />
          <MetricTile label={t("averageGrade")} value={formatPercent(props.analysis.courseMetrics.avgGradePct, 0)} tone="neutral" />
        </div>
      </section>

      <section className="kpi-grid">
        <MetricTile label={t("highRisk")} value={String(props.analysis.courseMetrics.atRiskHigh)} tone="danger" />
        <MetricTile label={t("mediumRisk")} value={String(props.analysis.courseMetrics.atRiskMedium)} tone="warning" />
        <MetricTile label={t("lowRisk")} value={String(props.analysis.courseMetrics.atRiskLow)} tone="success" />
        <MetricTile label={t("inactive7d")} value={String(props.analysis.courseMetrics.inactive7d)} tone="neutral" />
        <MetricTile label={t("noSubmissions")} value={String(props.analysis.courseMetrics.noSubmissions ?? 0)} tone="neutral" />
        <MetricTile label={t("noForumPosts")} value={String(props.analysis.courseMetrics.noForum ?? 0)} tone="neutral" />
      </section>

      <TabBar
        activeTab={activeTab}
        ariaLabel={t("sectionNavigation")}
        items={[
          { id: "overview", label: t("overview") },
          { id: "risk", label: t("riskAnalysis") },
          { id: "activity", label: t("activityAnalysis") },
          { id: "students", label: t("students") },
          { id: "ai", label: t("aiReport") },
        ]}
        onChange={(tabId) => setActiveTab(tabId as "overview" | "risk" | "activity" | "students" | "ai")}
      />

      {activeTab === "overview" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("riskDistribution")} eyebrow={t("visualization")} description={t("riskDistributionHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskData} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={4}>
                  {riskData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("gradeDistribution")} eyebrow={t("visualization")} description={t("gradeDistributionHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeDistributionData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="total" fill="#2563eb" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("teacherSignals")}</div>
                <h3>{t("recommendedActions")}</h3>
                <p className="panel-description">{t("recommendedActionsHelp")}</p>
              </div>
            </div>
            <div className="recommendation-list">
              {props.analysis.teacherRecommendations.map((item) => (
                <div className="recommendation-item" key={item}>
                  <ShieldAlert size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("overview")}</div>
                <h3>{t("courseStatus")}</h3>
                <p className="panel-description">{t("courseStatusHelp")}</p>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span>{t("atRiskStudents")}</span>
                <strong>{props.analysis.courseMetrics.atRiskHigh + props.analysis.courseMetrics.atRiskMedium}</strong>
                <small>{t("studentsNeedingMonitoring")}</small>
              </div>
              <div className="summary-card">
                <span>{t("averageSubmissions")}</span>
                <strong>{formatPercent(props.analysis.courseMetrics.avgSubmissionRate, 0)}</strong>
                <small>{t("assignmentParticipation")}</small>
              </div>
              <div className="summary-card">
                <span>{t("neverAccessed")}</span>
                <strong>{String(props.analysis.courseMetrics.neverAccessed)}</strong>
                <small>{t("noRecentPresence")}</small>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "risk" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("actualVsPredictedGrades")} eyebrow={t("riskAnalysis")} description={t("actualVsPredictedGradesHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actualVsPredictedData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="actual" fill="#2563eb" radius={[10, 10, 0, 0]} />
                <Bar dataKey="predicted" fill="#f59e0b" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("highestRiskStudents")} eyebrow={t("riskAnalysis")} description={t("highestRiskStudentsHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRiskData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#dbe5f0" />
                <XAxis type="number" domain={[0, 100]} stroke="#64748b" />
                <YAxis type="category" dataKey="name" width={120} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="engagement" radius={[0, 10, 10, 0]}>
                  {topRiskData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("topVsBottom")} eyebrow={t("riskAnalysis")} description={t("topVsBottomHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBottomData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="top" name={t("topQuartile")} fill="#2563eb" radius={[10, 10, 0, 0]} />
                <Bar dataKey="bottom" name={t("bottomQuartile")} fill="#d95b5b" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("courseFunnel")} eyebrow={t("riskAnalysis")} description={t("courseFunnelHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="total" fill="#0f766e" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section className="dashboard-grid">
          <ChartSurface title={t("engagementDistribution")} eyebrow={t("activityAnalysis")} description={t("engagementDistributionHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementHistogramData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                  {engagementHistogramData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("engagementVsGrade")} eyebrow={t("activityAnalysis")} description={t("engagementVsGradeHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#dbe5f0" />
                <XAxis type="number" dataKey="engagement" name="Engagement" stroke="#64748b" />
                <YAxis type="number" dataKey="grade" name="Grade" stroke="#64748b" />
                <ZAxis type="number" dataKey="size" range={[70, 320]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterGroups.low} fill={RISK_COLORS.low} />
                <Scatter data={scatterGroups.medium} fill={RISK_COLORS.medium} />
                <Scatter data={scatterGroups.high} fill={RISK_COLORS.high} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title={t("activityHeatmap")} eyebrow={t("activityAnalysis")} description={t("activityHeatmapHelp")}>
            <HeatmapGrid heatmap={heatmap} emptyLabel={t("noActivityTimestamps")} legendStart={t("riskLow")} legendEnd={t("riskHigh")} />
          </ChartSurface>
          <ChartSurface title={t("forumActivityByRisk")} eyebrow={t("activityAnalysis")} description={t("forumActivityByRiskHelp")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forumRiskData}>
                <CartesianGrid vertical={false} stroke="#dbe5f0" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis allowDecimals={false} stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="posts" radius={[10, 10, 0, 0]}>
                  {forumRiskData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
        </section>
      ) : null}

      {activeTab === "students" ? (
        <section className="surface student-table-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("studentList")}</div>
                <h3>{t("riskRankedRoster")}</h3>
                <p className="panel-description">{t("riskRankedRosterHelp")}</p>
              </div>
            <label className="inline-input inline-input--tight">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchStudents")} />
            </label>
          </div>
          <div className="student-table">
            <div className="student-table__head">
              <span>{t("student")}</span>
              <span>{t("risk")}</span>
              <span>{t("currentGrade")}</span>
              <span>{t("predictedGrade")}</span>
              <span>{t("engagement")}</span>
              <span />
            </div>
            {filteredStudents.map((student) => (
              <button key={student.id} className="student-row" onClick={() => props.onOpenStudent(student.id)}>
                <span>
                  <strong>{student.fullname}</strong>
                  <small>{student.email || t("noEmail")}</small>
                </span>
                <span className="risk-badge" style={{ backgroundColor: `${RISK_COLORS[student.riskLevel]}20`, color: RISK_COLORS[student.riskLevel] }}>
                  {translateRiskLevel(props.language, student.riskLevel)}
                </span>
                <span>{formatPercent(student.metrics.finalGradePct, 0)}</span>
                <span>{formatPercent(student.prediction.predictedGradePct, 0)}</span>
                <span>{formatPercent(student.metrics.engagementScore, 0)}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "ai" ? (
        <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("teacherSignals")}</div>
                <h3>{t("courseAiReport")}</h3>
                <p className="panel-description">{t("aiReportHelp")}</p>
              </div>
            <button className="ghost-button" onClick={() => void handleGenerateReport()}>
              <Sparkles size={16} />
              {t("generateAiReport")}
            </button>
          </div>
          <div className="recommendation-list">
            {props.analysis.teacherRecommendations.map((item) => (
              <div className="recommendation-item" key={item}>
                <ShieldAlert size={18} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <ReportPane
            title={t("courseAiReport")}
            markdown={report}
            loading={reportLoading}
            error={reportError}
            language={props.language}
            onDownload={() => downloadTextFile(`${slugify(props.analysis.course.fullname ?? "course")}-report.md`, report)}
          />
        </section>
      ) : null}
    </main>
  );
}
