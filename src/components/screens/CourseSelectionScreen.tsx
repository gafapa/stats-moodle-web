import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { ChevronRight, Globe, LayoutDashboard, RefreshCcw, Search, UserRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MetricTile } from "../common/MetricTile";
import { RISK_COLORS } from "../../constants/ui";
import { MoodleClient } from "../../api/moodleClient";
import type { CourseSummary } from "../../types";

export type CourseSelectionScreenProps = {
  client: MoodleClient;
  defaultThreshold: number;
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
      setError(nextError instanceof Error ? nextError.message : "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }, [props.client]);

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

  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((course) => {
      const key = String(course.categoryname ?? course.category ?? "Uncategorized");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].map(([name, total], index) => ({
      name,
      total,
      fill: [RISK_COLORS.low, "#0f7b6c", "#df8e2f", RISK_COLORS.high][index % 4],
    })).slice(0, 6);
  }, [courses]);

  return (
    <main className="courses-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <div className="eyebrow">Connected to {props.client.siteName || "Moodle"}</div>
          <h2>Choose the course to analyze</h2>
          <p>The web app mirrors the desktop workflow: course selection, passing threshold, aggregated analysis, and student-level inspection.</p>
        </div>
        <div className="hero-stats">
          <MetricTile label="Available courses" value={String(courses.length)} tone="accent" />
          <MetricTile label="Mode" value={mode === "mine" ? "My courses" : "All courses"} tone="neutral" />
          <MetricTile label="User" value={props.client.userFullName || "Authenticated"} tone="neutral" />
        </div>
      </section>

      <section className="surface course-controls">
        <div className="segmented-control">
          <button className={mode === "mine" ? "is-active" : ""} onClick={() => setMode("mine")}>
            <UserRound size={16} />
            My courses
          </button>
          <button className={mode === "all" ? "is-active" : ""} onClick={() => setMode("all")}>
            <Globe size={16} />
            All courses
          </button>
        </div>
        <label className="inline-input">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or key" />
        </label>
        <label className="threshold-input">
          <span>Pass threshold</span>
          <input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="decimal" />
        </label>
        <button className="ghost-button" onClick={() => void loadCourses(mode)}>
          <RefreshCcw size={16} />
          Refresh
        </button>
        <button
          className="primary-button"
          disabled={!selectedCourse || loading}
          onClick={() => selectedCourse && void props.onAnalyze(selectedCourse, Number(threshold) || props.defaultThreshold)}
        >
          <LayoutDashboard size={16} />
          Analyze course
        </button>
      </section>

      <section className="course-grid">
        <section className="surface course-list-surface">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Course list</div>
              <h3>{mode === "mine" ? "Your enrolled courses" : "All visible courses"}</h3>
            </div>
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {loading ? <div className="empty-note">Loading courses...</div> : null}
          {!loading ? (
            <div className="course-list">
              {filteredCourses.map((course) => (
                <button
                  key={course.id}
                  className={`course-item ${selectedCourseId === course.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <span>
                    <strong>{course.fullname ?? course.shortname ?? `Course ${course.id}`}</strong>
                    <small>{course.categoryname ?? course.category ?? "Uncategorized"}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : null}
          {selectedCourse ? (
            <div className="selected-course-summary">
              <h4>{selectedCourse.fullname ?? selectedCourse.shortname}</h4>
              <p>{selectedCourse.categoryname ?? selectedCourse.category ?? "Uncategorized"}</p>
              <dl>
                <div>
                  <dt>Course id</dt>
                  <dd>{selectedCourse.id}</dd>
                </div>
                <div>
                  <dt>Shortname</dt>
                  <dd>{selectedCourse.shortname ?? "N/A"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>

        <section className="surface analytics-preview">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Catalog snapshot</div>
              <h3>Courses by category</h3>
            </div>
          </div>
          <div className="chart-frame chart-frame--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid vertical={false} stroke="#eadfcb" />
                <XAxis dataKey="name" hide />
                <YAxis allowDecimals={false} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {categoryData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </section>
    </main>
  );
}
