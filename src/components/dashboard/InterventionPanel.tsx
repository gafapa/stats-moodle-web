import { useMemo, useState } from "react";
import type { JSX } from "react";
import { ChevronRight, Download } from "lucide-react";

import {
  buildCourseAlerts,
  buildInterventionQueue,
  buildStudentSegments,
  type CourseAlert,
  type StudentSegment,
} from "../../lib/courseInsights";
import { downloadCsvFile, slugify } from "../../lib/format";
import { translate, translateRiskLevel } from "../../lib/i18n";
import type { CourseAnalysis, LanguageCode } from "../../types";
import { TabBar } from "../common/TabBar";

export type InterventionPanelProps = {
  analysis: CourseAnalysis;
  language: LanguageCode;
  activeSubtab: "alerts" | "segments";
  onSubtabChange: (value: "alerts" | "segments") => void;
  onOpenStudent: (studentId: number) => void;
};

function severityClass(alert: CourseAlert["severity"]): string {
  if (alert === "high") {
    return "alert-card--high";
  }
  if (alert === "medium") {
    return "alert-card--medium";
  }
  return "alert-card--info";
}

export function InterventionPanel(props: InterventionPanelProps): JSX.Element {
  const t = (key: Parameters<typeof translate>[1]) => translate(props.language, key);
  const alerts = useMemo(() => buildCourseAlerts(props.analysis), [props.analysis]);
  const interventionQueue = useMemo(() => buildInterventionQueue(props.analysis), [props.analysis]);
  const segments = useMemo(() => buildStudentSegments(props.analysis), [props.analysis]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<StudentSegment["id"] | null>(segments[0]?.id ?? null);

  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? segments[0] ?? null;
  const selectedSegmentStudents = props.analysis.students.filter((student) => {
    return selectedSegment?.studentIds.includes(student.id);
  });

  function alertTitle(alert: CourseAlert): string {
    if (alert.id === "highRiskConcentration") {
      return t("alertHighRiskConcentrationTitle");
    }
    if (alert.id === "recentActivityDrop") {
      return t("alertRecentActivityDropTitle");
    }
    if (alert.id === "submissionBacklog") {
      return t("alertSubmissionBacklogTitle");
    }
    if (alert.id === "silentForumMajority") {
      return t("alertSilentForumMajorityTitle");
    }
    return t("alertDecliningPerformanceTitle");
  }

  function alertDescription(alert: CourseAlert): string {
    if (alert.id === "highRiskConcentration") {
      return t("alertHighRiskConcentrationBody");
    }
    if (alert.id === "recentActivityDrop") {
      return t("alertRecentActivityDropBody");
    }
    if (alert.id === "submissionBacklog") {
      return t("alertSubmissionBacklogBody");
    }
    if (alert.id === "silentForumMajority") {
      return t("alertSilentForumMajorityBody");
    }
    return t("alertDecliningPerformanceBody");
  }

  function segmentLabel(segment: StudentSegment): string {
    if (segment.id === "highRisk") {
      return t("segmentHighRisk");
    }
    if (segment.id === "inactive14d") {
      return t("segmentInactive14d");
    }
    if (segment.id === "missingAssignments") {
      return t("segmentMissingAssignments");
    }
    if (segment.id === "silentForum") {
      return t("segmentSilentForum");
    }
    if (segment.id === "activeLowGrade") {
      return t("segmentActiveLowGrade");
    }
    if (segment.id === "improving") {
      return t("segmentImproving");
    }
    return t("segmentDeclining");
  }

  function segmentDescription(segment: StudentSegment): string {
    if (segment.id === "highRisk") {
      return t("segmentHighRiskHelp");
    }
    if (segment.id === "inactive14d") {
      return t("segmentInactive14dHelp");
    }
    if (segment.id === "missingAssignments") {
      return t("segmentMissingAssignmentsHelp");
    }
    if (segment.id === "silentForum") {
      return t("segmentSilentForumHelp");
    }
    if (segment.id === "activeLowGrade") {
      return t("segmentActiveLowGradeHelp");
    }
    if (segment.id === "improving") {
      return t("segmentImprovingHelp");
    }
    return t("segmentDecliningHelp");
  }

  return (
    <div className="dashboard-section-stack">
      <TabBar
        activeTab={props.activeSubtab}
        ariaLabel={t("intervention")}
        variant="subtle"
        items={[
          { id: "alerts", label: t("alertsView") },
          { id: "segments", label: t("segmentsView") },
        ]}
        onChange={(tabId) => props.onSubtabChange(tabId as "alerts" | "segments")}
      />

      {props.activeSubtab === "alerts" ? (
        <>
          <section className="alert-grid">
            {alerts.map((alert) => (
              <article key={alert.id} className={`surface alert-card ${severityClass(alert.severity)}`}>
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">{t("alertBoard")}</div>
                    <h3>{alertTitle(alert)}</h3>
                    <p className="panel-description">{alertDescription(alert)}</p>
                  </div>
                  <strong>{alert.count}</strong>
                </div>
              </article>
            ))}
          </section>

          <section className="surface student-table-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("intervention")}</div>
                <h3>{t("interventionQueue")}</h3>
                <p className="panel-description">{t("interventionQueueHelp")}</p>
              </div>
              <button
                className="ghost-button"
                onClick={() => downloadCsvFile(
                  `${slugify(props.analysis.course.fullname ?? "course")}-intervention-queue.csv`,
                  interventionQueue.map((item) => ({
                    student: item.name,
                    priorityScore: item.priorityScore,
                    risk: item.riskLevel,
                    currentGrade: item.currentGradeLabel,
                    predictedGrade: item.predictedGradeLabel,
                    reason: item.reason,
                    action: item.action,
                  })),
                )}
              >
                <Download size={16} />
                {t("exportQueueCsv")}
              </button>
            </div>
            <div className="student-table">
              <div className="student-table__head student-table__head--queue">
                <span>{t("student")}</span>
                <span>{t("interventionPriority")}</span>
                <span>{t("primaryReason")}</span>
                <span>{t("suggestedAction")}</span>
                <span />
              </div>
              {interventionQueue.map((item) => (
                <button key={item.studentId} className="student-row student-row--queue" onClick={() => props.onOpenStudent(item.studentId)}>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.currentGradeLabel} / {item.predictedGradeLabel}</small>
                  </span>
                  <span>{item.priorityScore}</span>
                  <span>{item.reason}</span>
                  <span>{item.action}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {props.activeSubtab === "segments" ? (
        <section className="dashboard-grid">
          <section className="surface recommendations-panel">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("intervention")}</div>
                <h3>{t("studentSegments")}</h3>
                <p className="panel-description">{t("studentSegmentsHelp")}</p>
              </div>
            </div>
            <div className="chip-row">
              {segments.map((segment) => (
                <button
                  key={segment.id}
                  className={`chip-button ${selectedSegment?.id === segment.id ? "is-active" : ""}`}
                  onClick={() => setSelectedSegmentId(segment.id)}
                >
                  {segmentLabel(segment)} ({segment.count})
                </button>
              ))}
            </div>
            {selectedSegment ? (
              <div className="segment-detail">
                <h4>{segmentLabel(selectedSegment)}</h4>
                <p>{segmentDescription(selectedSegment)}</p>
                <button
                  className="ghost-button"
                  onClick={() => downloadCsvFile(
                    `${slugify(props.analysis.course.fullname ?? "course")}-${selectedSegment.id}.csv`,
                    selectedSegmentStudents.map((student) => ({
                      student: student.fullname,
                      email: student.email ?? "",
                      risk: student.riskLevel,
                      currentGradePct: student.metrics.finalGradePct ?? "",
                      predictedGradePct: student.prediction.predictedGradePct,
                      engagement: student.metrics.engagementScore,
                      daysInactive: student.metrics.daysSinceAccess,
                    })),
                  )}
                >
                  <Download size={16} />
                  {t("exportCsv")}
                </button>
              </div>
            ) : null}
          </section>

          <section className="surface student-table-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("studentList")}</div>
                <h3>{selectedSegment ? segmentLabel(selectedSegment) : t("studentSegments")}</h3>
              </div>
            </div>
            <div className="student-table">
              <div className="student-table__head">
                <span>{t("student")}</span>
                <span>{t("risk")}</span>
                <span>{t("currentGrade")}</span>
                <span>{t("engagement")}</span>
                <span />
              </div>
              {selectedSegmentStudents.map((student) => (
                <button key={student.id} className="student-row" onClick={() => props.onOpenStudent(student.id)}>
                  <span>
                    <strong>{student.fullname}</strong>
                    <small>{student.email || t("noEmail")}</small>
                  </span>
                  <span className="risk-badge">{translateRiskLevel(props.language, student.riskLevel)}</span>
                  <span>{student.metrics.finalGradePct?.toFixed(0) ?? "N/A"}%</span>
                  <span>{student.metrics.engagementScore.toFixed(0)}%</span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {selectedSegmentStudents.length === 0 ? (
                <div className="empty-note">{t("noStudentsInSegment")}</div>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
