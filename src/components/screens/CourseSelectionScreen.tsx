import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { ArrowRight, Globe, LayoutDashboard, RefreshCcw, Search, UserRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MoodleClient } from "../../api/moodleClient";
import { RISK_COLORS } from "../../constants/ui";
import { translate } from "../../lib/i18n";
import { MetricTile } from "../common/MetricTile";
import type { CourseSummary, LanguageCode } from "../../types";

export type CourseSelectionScreenProps = {
  client: MoodleClient;
  language: LanguageCode;
  defaultThreshold: number;
  externalError?: string | null;
  onAnalyze: (course: CourseSummary, passThresholdPct: number) => Promise<void>;
};

export function CourseSelectionScreen(props: CourseSelectionScreenProps): JSX.Element {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [mode, setMode] = useState<"mine" | "all">("mine");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(String(props.defaultThreshold));
  const t = useCallback((key: Parameters<typeof translate>[1]) => translate(props.language, key), [props.language]);

  const loadCourses = useCallback(async (activeMode: "mine" | "all"): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const nextCourses = activeMode === "mine"
        ? await props.client.getMyCourses()
        : await props.client.getAllCourses();
      setCourses(nextCourses);
      setSelectedCourseId((current) => current ?? nextCourses[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("unableToLoadCourses"));
    } finally {
      setLoading(false);
    }
  }, [props.client, t]);

  useEffect(() => {
    void loadCourses(mode);
  }, [loadCourses, mode]);

  const filteredCourses = useMemo(() => {
    const query = search.toLowerCase();
    return courses.filter((course) => {
      return [course.fullname, course.shortname, course.categoryname]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [courses, search]);

  const selectedCourse = filteredCourses.find((course) => course.id === selectedCourseId)
    ?? courses.find((course) => course.id === selectedCourseId)
    ?? null;

  const thresholdValue = Number(threshold) || props.defaultThreshold;

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((course) => {
      const key = String(course.categoryname ?? course.category ?? t("uncategorized"));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, total], index) => ({
        name,
        total,
        fill: [RISK_COLORS.low, "#2563eb", "#f59e0b", RISK_COLORS.high][index % 4],
      }))
      .slice(0, 6);
  }, [courses, t]);

  async function handleAnalyze(course: CourseSummary): Promise<void> {
    await props.onAnalyze(course, thresholdValue);
  }

  return (
    <main className="courses-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <div className="eyebrow">{t("connectedTo")} {props.client.siteName || "Moodle"}</div>
          <h2>{t("chooseCourseToAnalyze")}</h2>
          <p>{t("courseFlowCopy")}</p>
        </div>
        <div className="hero-stats">
          <MetricTile label={t("availableCourses")} value={String(courses.length)} tone="accent" />
          <MetricTile label={t("mode")} value={mode === "mine" ? t("myCourses") : t("allCourses")} tone="neutral" />
          <MetricTile label={t("user")} value={props.client.userFullName || t("authenticated")} tone="neutral" />
        </div>
      </section>

      <section className="surface course-toolbar">
        <div className="segmented-control">
          <button className={mode === "mine" ? "is-active" : ""} onClick={() => setMode("mine")}>
            <UserRound size={16} />
            {t("myCourses")}
          </button>
          <button className={mode === "all" ? "is-active" : ""} onClick={() => setMode("all")}>
            <Globe size={16} />
            {t("allCourses")}
          </button>
        </div>
        <label className="inline-input inline-input--expand">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchCoursesPlaceholder")} />
        </label>
        <button className="ghost-button" onClick={() => void loadCourses(mode)}>
          <RefreshCcw size={16} />
          {t("refresh")}
        </button>
      </section>

      <section className="course-grid">
        <section className="surface course-list-surface">
          <div className="panel-header">
            <div>
              <div className="eyebrow">{t("courseList")}</div>
              <h3>{mode === "mine" ? t("enrolledCourses") : t("visibleCourses")}</h3>
            </div>
            <small>{t("doubleClickToAnalyze")}</small>
          </div>
          {props.externalError ? <div className="error-banner">{props.externalError}</div> : null}
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <div className="empty-note">{t("loadingCourses")}</div> : null}
          {!loading && filteredCourses.length === 0 ? <div className="empty-note">{t("noCoursesFound")}</div> : null}
          {!loading && filteredCourses.length > 0 ? (
            <div className="course-list">
              {filteredCourses.map((course) => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <button
                    key={course.id}
                    className={`course-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedCourseId(course.id)}
                    onDoubleClick={() => void handleAnalyze(course)}
                  >
                    <span>
                      <strong>{course.fullname ?? course.shortname ?? `Course ${course.id}`}</strong>
                      <small>{course.categoryname ?? course.category ?? t("uncategorized")}</small>
                    </span>
                    <span className="course-item__meta">
                      <small>#{course.id}</small>
                      <ArrowRight size={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <div className="course-side-stack">
          <section className="surface course-action-surface">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("selectedCourse")}</div>
                <h3>{selectedCourse?.fullname ?? selectedCourse?.shortname ?? t("selectedCourse")}</h3>
              </div>
            </div>
            <p>{t("selectedCourseHelp")}</p>
            {selectedCourse ? (
              <div className="selected-course-summary selected-course-summary--card">
                <dl>
                  <div>
                    <dt>{t("courseId")}</dt>
                    <dd>{selectedCourse.id}</dd>
                  </div>
                  <div>
                    <dt>{t("shortname")}</dt>
                    <dd>{selectedCourse.shortname ?? "N/A"}</dd>
                  </div>
                  <div>
                    <dt>{t("categoryCoverage")}</dt>
                    <dd>{selectedCourse.categoryname ?? selectedCourse.category ?? t("uncategorized")}</dd>
                  </div>
                  <div>
                    <dt>{t("coursesShown")}</dt>
                    <dd>{filteredCourses.length}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <div className="action-row">
              <label className="threshold-input threshold-input--card">
                <span>{t("passThreshold")}</span>
                <input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" />
              </label>
              <button
                className="primary-button primary-button--wide"
                disabled={!selectedCourse || loading}
                onClick={() => selectedCourse && void handleAnalyze(selectedCourse)}
              >
                <LayoutDashboard size={16} />
                {t("analyzeNow")}
              </button>
            </div>
          </section>

          <section className="surface analytics-preview">
            <div className="panel-header">
              <div>
                <div className="eyebrow">{t("catalogSnapshot")}</div>
                <h3>{t("coursesByCategory")}</h3>
              </div>
            </div>
            <div className="chart-frame chart-frame--medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <CartesianGrid vertical={false} stroke="#dbe5f0" />
                  <XAxis dataKey="name" hide />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <Tooltip />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]}>
                    {categoryData.map((item) => (
                      <Cell key={item.name} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
