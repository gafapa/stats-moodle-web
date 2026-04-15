import type { JSX } from "react";
import { ChevronRight, Download, Search } from "lucide-react";

import { RISK_COLORS } from "../../constants/ui";
import { downloadCsvFile, downloadJsonFile, formatPercent, slugify } from "../../lib/format";
import { translate, translateRiskLevel } from "../../lib/i18n";
import type { CourseAnalysis, LanguageCode, StudentAnalysis } from "../../types";

export type StudentsRosterPanelProps = {
  analysis: CourseAnalysis;
  language: LanguageCode;
  query: string;
  onQueryChange: (value: string) => void;
  filterKey: "all" | "highRisk" | "inactive" | "missingAssignments" | "declining";
  onFilterChange: (value: "all" | "highRisk" | "inactive" | "missingAssignments" | "declining") => void;
  sortKey: "risk" | "currentGrade" | "predictedGrade" | "engagement" | "inactivity" | "name";
  onSortChange: (value: "risk" | "currentGrade" | "predictedGrade" | "engagement" | "inactivity" | "name") => void;
  onOpenStudent: (studentId: number) => void;
};

function studentMatchesFilter(
  student: StudentAnalysis,
  filterKey: StudentsRosterPanelProps["filterKey"],
): boolean {
  if (filterKey === "highRisk") {
    return student.riskLevel === "high";
  }
  if (filterKey === "inactive") {
    return student.metrics.daysSinceAccess > 14;
  }
  if (filterKey === "missingAssignments") {
    return student.metrics.totalAssignments > 0 && (student.metrics.submissionRate ?? 100) < 50;
  }
  if (filterKey === "declining") {
    return student.metrics.gradeTrend === "declining" || student.metrics.quizTrend === "declining";
  }
  return true;
}

function sortStudents(
  students: StudentAnalysis[],
  sortKey: StudentsRosterPanelProps["sortKey"],
): StudentAnalysis[] {
  const compare = (left: StudentAnalysis, right: StudentAnalysis): number => {
    if (sortKey === "name") {
      return left.fullname.localeCompare(right.fullname);
    }
    if (sortKey === "currentGrade") {
      return (right.metrics.finalGradePct ?? -1) - (left.metrics.finalGradePct ?? -1);
    }
    if (sortKey === "predictedGrade") {
      return right.prediction.predictedGradePct - left.prediction.predictedGradePct;
    }
    if (sortKey === "engagement") {
      return right.metrics.engagementScore - left.metrics.engagementScore;
    }
    if (sortKey === "inactivity") {
      return right.metrics.daysSinceAccess - left.metrics.daysSinceAccess;
    }
    return right.prediction.riskProbability - left.prediction.riskProbability;
  };

  return [...students].sort(compare);
}

export function StudentsRosterPanel(props: StudentsRosterPanelProps): JSX.Element {
  const t = (key: Parameters<typeof translate>[1]) => translate(props.language, key);

  const filteredStudents = sortStudents(
    props.analysis.students.filter((student) => {
      const lower = props.query.toLowerCase();
      const matchesSearch =
        lower.length === 0 ||
        [student.fullname, student.email, student.riskLevel]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(lower));

      return matchesSearch && studentMatchesFilter(student, props.filterKey);
    }),
    props.sortKey,
  );

  const exportRows = filteredStudents.map((student) => ({
    student: student.fullname,
    email: student.email ?? "",
    risk: translateRiskLevel(props.language, student.riskLevel),
    currentGradePct: student.metrics.finalGradePct ?? "",
    predictedGradePct: student.prediction.predictedGradePct,
    engagementPct: student.metrics.engagementScore,
    daysInactive: student.metrics.daysSinceAccess,
    submissionRatePct: student.metrics.submissionRate ?? "",
    gradeTrend: student.metrics.gradeTrend,
    quizTrend: student.metrics.quizTrend,
  }));

  return (
    <section className="surface student-table-surface">
      <div className="panel-header">
        <div>
          <div className="eyebrow">{t("studentList")}</div>
          <h3>{t("riskRankedRoster")}</h3>
          <p className="panel-description">{t("riskRankedRosterHelp")}</p>
        </div>
        <div className="panel-actions">
          <button
            className="ghost-button"
            onClick={() => downloadCsvFile(`${slugify(props.analysis.course.fullname ?? "course")}-roster.csv`, exportRows)}
          >
            <Download size={16} />
            {t("exportCsv")}
          </button>
          <button
            className="ghost-button"
            onClick={() => downloadJsonFile(`${slugify(props.analysis.course.fullname ?? "course")}-analysis.json`, props.analysis)}
          >
            <Download size={16} />
            {t("exportJsonSnapshot")}
          </button>
        </div>
      </div>

      <div className="surface-toolbar">
        <label className="inline-input inline-input--expand">
          <Search size={16} />
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder={t("searchStudents")} />
        </label>
        <label className="inline-select">
          <span>{t("sortStudents")}</span>
          <select value={props.sortKey} onChange={(event) => props.onSortChange(event.target.value as StudentsRosterPanelProps["sortKey"])}>
            <option value="risk">{t("sortByRisk")}</option>
            <option value="currentGrade">{t("sortByCurrentGrade")}</option>
            <option value="predictedGrade">{t("sortByPredictedGrade")}</option>
            <option value="engagement">{t("sortByEngagement")}</option>
            <option value="inactivity">{t("sortByInactivity")}</option>
            <option value="name">{t("sortByName")}</option>
          </select>
        </label>
      </div>

      <div className="chip-row" role="tablist" aria-label={t("filterStudents")}>
        {[
          { id: "all", label: t("filterAllStudents") },
          { id: "highRisk", label: t("filterHighRisk") },
          { id: "inactive", label: t("filterInactive") },
          { id: "missingAssignments", label: t("filterMissingAssignments") },
          { id: "declining", label: t("filterDeclining") },
        ].map((item) => (
          <button
            key={item.id}
            className={`chip-button ${props.filterKey === item.id ? "is-active" : ""}`}
            onClick={() => props.onFilterChange(item.id as StudentsRosterPanelProps["filterKey"])}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="student-table">
        <div className="student-table__head student-table__head--wide">
          <span>{t("student")}</span>
          <span>{t("risk")}</span>
          <span>{t("currentGrade")}</span>
          <span>{t("predictedGrade")}</span>
          <span>{t("engagement")}</span>
          <span>{t("daysInactive")}</span>
          <span />
        </div>
        {filteredStudents.map((student) => (
          <button key={student.id} className="student-row student-row--wide" onClick={() => props.onOpenStudent(student.id)}>
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
            <span>{student.metrics.daysSinceAccess}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}
