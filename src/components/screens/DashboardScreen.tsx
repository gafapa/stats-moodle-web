import { useMemo, useState } from "react";
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
import { getGradeBandIndex, shortenLabel } from "../../lib/uiData";
import type { AiSettings, CourseAnalysis, LanguageCode, RiskLevel } from "../../types";
import { ChartSurface } from "../common/ChartSurface";
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
  const [activeTab, setActiveTab] = useState<"overview" | "charts" | "students" | "ai">("overview");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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
      { name: "High", value: props.analysis.courseMetrics.atRiskHigh, fill: RISK_COLORS.high },
      { name: "Medium", value: props.analysis.courseMetrics.atRiskMedium, fill: RISK_COLORS.medium },
      { name: "Low", value: props.analysis.courseMetrics.atRiskLow, fill: RISK_COLORS.low },
    ];
  }, [props.analysis.courseMetrics]);

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
            Back to course selection
          </button>
          <div className="eyebrow">Course dashboard</div>
          <h2>{props.analysis.course.fullname ?? props.analysis.course.shortname ?? "Course analysis"}</h2>
          <p>Pass threshold: {props.analysis.passThresholdPct}% | Logs available: {props.analysis.logsAvailable ? "yes" : "no"}</p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile label="Students" value={String(props.analysis.courseMetrics.totalStudents)} tone="accent" />
          <MetricTile label="Average engagement" value={formatPercent(props.analysis.courseMetrics.avgEngagement, 0)} tone="neutral" />
          <MetricTile label="Average grade" value={formatPercent(props.analysis.courseMetrics.avgGradePct, 0)} tone="neutral" />
        </div>
      </section>

      <section className="kpi-grid">
        <MetricTile label="High risk" value={String(props.analysis.courseMetrics.atRiskHigh)} tone="danger" />
        <MetricTile label="Medium risk" value={String(props.analysis.courseMetrics.atRiskMedium)} tone="warning" />
        <MetricTile label="Low risk" value={String(props.analysis.courseMetrics.atRiskLow)} tone="success" />
        <MetricTile label="Inactive 7d" value={String(props.analysis.courseMetrics.inactive7d)} tone="neutral" />
        <MetricTile label="No submissions" value={String(props.analysis.courseMetrics.noSubmissions ?? 0)} tone="neutral" />
        <MetricTile label="No forum posts" value={String(props.analysis.courseMetrics.noForum ?? 0)} tone="neutral" />
      </section>

      <TabBar
        activeTab={activeTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "charts", label: "Charts" },
          { id: "students", label: "Students" },
          { id: "ai", label: "AI report" },
        ]}
        onChange={(tabId) => setActiveTab(tabId as "overview" | "charts" | "students" | "ai")}
      />

      {activeTab === "overview" ? (
        <section className="dashboard-grid">
          <ChartSurface title="Risk distribution">
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
          <ChartSurface title="Grade distribution">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gradeDistributionData}>
                <CartesianGrid vertical={false} stroke="#eadfcb" />
                <XAxis dataKey="name" stroke="#7a6d5a" />
                <YAxis allowDecimals={false} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="total" fill="#0f7b6c" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Engagement vs grade">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke="#eadfcb" />
                <XAxis type="number" dataKey="engagement" name="Engagement" stroke="#7a6d5a" />
                <YAxis type="number" dataKey="grade" name="Grade" stroke="#7a6d5a" />
                <ZAxis type="number" dataKey="size" range={[70, 320]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={scatterGroups.low} fill={RISK_COLORS.low} />
                <Scatter data={scatterGroups.medium} fill={RISK_COLORS.medium} />
                <Scatter data={scatterGroups.high} fill={RISK_COLORS.high} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">Teacher signals</div>
                <h3>Recommended actions</h3>
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
        </section>
      ) : null}

      {activeTab === "charts" ? (
        <section className="dashboard-grid">
          <ChartSurface title="Engagement distribution">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementHistogramData}>
                <CartesianGrid vertical={false} stroke="#eadfcb" />
                <XAxis dataKey="name" stroke="#7a6d5a" />
                <YAxis allowDecimals={false} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {engagementHistogramData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Actual vs predicted grades">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actualVsPredictedData}>
                <CartesianGrid vertical={false} stroke="#eadfcb" />
                <XAxis dataKey="name" stroke="#7a6d5a" />
                <YAxis allowDecimals={false} stroke="#7a6d5a" />
                <Tooltip />
                <Legend />
                <Bar dataKey="actual" fill="#0f7b6c" radius={[8, 8, 0, 0]} />
                <Bar dataKey="predicted" fill="#df8e2f" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <ChartSurface title="Highest-risk students">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topRiskData} layout="vertical">
                <CartesianGrid horizontal={false} stroke="#eadfcb" />
                <XAxis type="number" domain={[0, 100]} stroke="#7a6d5a" />
                <YAxis type="category" dataKey="name" width={120} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="engagement" radius={[0, 8, 8, 0]}>
                  {topRiskData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSurface>
          <section className="surface summary-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">Summary</div>
                <h3>Course status</h3>
              </div>
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span>At risk</span>
                <strong>{props.analysis.courseMetrics.atRiskHigh + props.analysis.courseMetrics.atRiskMedium}</strong>
                <small>Students needing active monitoring.</small>
              </div>
              <div className="summary-card">
                <span>Average submissions</span>
                <strong>{formatPercent(props.analysis.courseMetrics.avgSubmissionRate, 0)}</strong>
                <small>Assignment participation across the course.</small>
              </div>
              <div className="summary-card">
                <span>Never accessed</span>
                <strong>{String(props.analysis.courseMetrics.neverAccessed)}</strong>
                <small>Students with no meaningful recent presence.</small>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "students" ? (
        <section className="surface student-table-surface">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Student list</div>
              <h3>Risk-ranked roster</h3>
            </div>
            <label className="inline-input inline-input--tight">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" />
            </label>
          </div>
          <div className="student-table">
            <div className="student-table__head">
              <span>Student</span>
              <span>Risk</span>
              <span>Current grade</span>
              <span>Predicted grade</span>
              <span>Engagement</span>
              <span />
            </div>
            {filteredStudents.map((student) => (
              <button key={student.id} className="student-row" onClick={() => props.onOpenStudent(student.id)}>
                <span>
                  <strong>{student.fullname}</strong>
                  <small>{student.email || "No email"}</small>
                </span>
                <span className="risk-badge" style={{ backgroundColor: `${RISK_COLORS[student.riskLevel]}22`, color: RISK_COLORS[student.riskLevel] }}>
                  {student.riskLevel}
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
              <div className="eyebrow">Teacher signals</div>
              <h3>Course AI report</h3>
            </div>
            <button className="ghost-button" onClick={() => void handleGenerateReport()}>
              <Sparkles size={16} />
              Generate AI report
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
            title="Course AI report"
            markdown={report}
            loading={reportLoading}
            error={reportError}
            onDownload={() => downloadTextFile(`${slugify(props.analysis.course.fullname ?? "course")}-report.md`, report)}
          />
        </section>
      ) : null}
    </main>
  );
}
