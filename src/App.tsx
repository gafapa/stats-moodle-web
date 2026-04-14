import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  ChevronRight,
  Globe,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MoodleClient } from "./api/moodleClient";
import { CourseAnalyzer } from "./analysis/courseAnalyzer";
import { DataCollector } from "./analysis/dataCollector";
import { generateCourseReport, generateStudentReport } from "./analysis/reportAgent";
import {
  initializeExtensionBridge,
  isExtensionBridgeAvailable,
  subscribeExtensionBridgeAvailability,
} from "./lib/extensionBridge";
import { downloadTextFile, formatNumber, formatPercent, slugify } from "./lib/format";
import { supportedLanguages, translate } from "./lib/i18n";
import {
  deleteProfile,
  loadAiSettings,
  loadLanguage,
  loadProfiles,
  saveAiSettings,
  saveLanguage,
  upsertProfile,
} from "./lib/storage";
import type {
  AiSettings,
  ConnectFormValues,
  ConnectionProfile,
  CourseAnalysis,
  CourseSummary,
  LanguageCode,
  RiskLevel,
  StudentAnalysis,
} from "./types";

const RISK_COLORS: Record<RiskLevel, string> = {
  high: "#b54a2a",
  medium: "#df8e2f",
  low: "#2e7d5b",
};

const DEFAULT_FORM: ConnectFormValues = {
  profileName: "",
  baseUrl: "",
  token: "",
  username: "",
  password: "",
  saveProfile: true,
};

function App(): JSX.Element {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() => loadProfiles());
  const [language, setLanguage] = useState<LanguageCode>(() => loadLanguage());
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [extensionBridgeAvailable, setExtensionBridgeAvailable] = useState<boolean>(
    () => isExtensionBridgeAvailable(),
  );
  const [session, setSession] = useState<{ client: MoodleClient } | null>(null);
  const [analysis, setAnalysis] = useState<CourseAnalysis | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Waiting");
  const [progressPercent, setProgressPercent] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  useEffect(() => {
    initializeExtensionBridge();
    return subscribeExtensionBridgeAvailability(setExtensionBridgeAvailable);
  }, []);

  const activeStudent =
    analysis?.students.find((student) => student.id === selectedStudentId) ?? null;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  async function handleConnect(values: ConnectFormValues): Promise<void> {
    setBusy(true);
    setConnectError(null);

    try {
      const client = values.token.trim()
        ? await MoodleClient.fromToken(values.baseUrl, values.token.trim())
        : await MoodleClient.fromCredentials(
            values.baseUrl,
            values.username.trim(),
            values.password,
          );

      if (values.saveProfile && values.profileName.trim()) {
        setProfiles(
          upsertProfile({
            name: values.profileName.trim(),
            url: values.baseUrl.trim(),
            token: client.token,
            username: values.username.trim() || undefined,
          }),
        );
      }

      setSession({ client });
      setAnalysis(null);
      setSelectedStudentId(null);
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : "Connection failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze(
    course: CourseSummary,
    passThresholdPct: number,
  ): Promise<void> {
    if (!session) {
      return;
    }

    setBusy(true);
    setProgressMessage("Preparing analysis");
    setProgressPercent(0);

    try {
      const collector = new DataCollector(session.client);
      const collected = await collector.collectCourseData(
        course.id,
        course,
        (message, percent) => {
          setProgressMessage(message);
          setProgressPercent(percent);
        },
      );
      const nextAnalysis = new CourseAnalyzer(passThresholdPct).analyze(collected);
      setAnalysis(nextAnalysis);
      setSelectedStudentId(null);
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect(): void {
    setSession(null);
    setAnalysis(null);
    setSelectedStudentId(null);
    setConnectError(null);
  }

  function handleSaveAiSettings(next: AiSettings): void {
    setAiSettings(saveAiSettings(next));
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient--left" />
      <div className="ambient ambient--right" />
      <header className="topbar">
        <div>
          <div className="eyebrow">React + Vite + Moodle REST</div>
          <h1>{t("appName")}</h1>
          <p>{t("appTagline")}</p>
        </div>
        <div className="topbar__actions">
          <label className="language-picker">
            <Globe size={16} />
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as LanguageCode)
              }
            >
              {Object.entries(supportedLanguages).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {session ? (
            <button className="ghost-button" onClick={handleDisconnect}>
              <LogOut size={16} />
              {t("disconnect")}
            </button>
          ) : null}
        </div>
      </header>

      {!session ? (
        <ConnectionScreen
          profiles={profiles}
          language={language}
          aiSettings={aiSettings}
          extensionBridgeAvailable={extensionBridgeAvailable}
          loading={busy}
          error={connectError}
          onDeleteProfile={(name) => setProfiles(deleteProfile(name))}
          onConnect={handleConnect}
          onSaveAiSettings={handleSaveAiSettings}
        />
      ) : analysis && activeStudent ? (
        <StudentDetailScreen
          analysis={analysis}
          aiSettings={aiSettings}
          language={language}
          student={activeStudent}
          onBack={() => setSelectedStudentId(null)}
        />
      ) : analysis ? (
        <DashboardScreen
          analysis={analysis}
          aiSettings={aiSettings}
          language={language}
          onBack={() => setAnalysis(null)}
          onOpenStudent={(studentId) => setSelectedStudentId(studentId)}
        />
      ) : (
        <CourseSelectionScreen
          client={session.client}
          defaultThreshold={50}
          onAnalyze={handleAnalyze}
        />
      )}

      <AnimatePresence>
        {busy ? (
          <LoadingOverlay
            message={progressMessage}
            percent={progressPercent}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type ConnectionScreenProps = {
  profiles: ConnectionProfile[];
  language: LanguageCode;
  aiSettings: AiSettings;
  extensionBridgeAvailable: boolean;
  loading: boolean;
  error: string | null;
  onDeleteProfile: (name: string) => void;
  onConnect: (values: ConnectFormValues) => Promise<void>;
  onSaveAiSettings: (settings: AiSettings) => void;
};

function ConnectionScreen(props: ConnectionScreenProps): JSX.Element {
  const [form, setForm] = useState<ConnectFormValues>(DEFAULT_FORM);
  const [showAiSettings, setShowAiSettings] = useState(false);

  function fillFromProfile(profile: ConnectionProfile): void {
    setForm({
      profileName: profile.name,
      baseUrl: profile.url,
      token: profile.token,
      username: profile.username ?? "",
      password: "",
      saveProfile: true,
    });
  }

  return (
    <main className="connect-layout">
      <section className="profile-rail surface surface--dark">
        <div>
          <div className="eyebrow">
            {translate(props.language, "profiles")}
          </div>
          <h2>Reusable entry points</h2>
          <p>
            Profiles are stored locally in the browser. Passwords are never
            persisted.
          </p>
        </div>
        <div className="profile-list">
          {props.profiles.length === 0 ? (
            <div className="empty-note">No saved profiles yet.</div>
          ) : null}
          {props.profiles.map((profile) => (
            <button
              key={profile.name}
              className="profile-chip"
              onClick={() => fillFromProfile(profile)}
            >
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.url}</small>
              </span>
              <span className="profile-chip__actions">
                <ChevronRight size={16} />
                <span
                  className="profile-chip__delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onDeleteProfile(profile.name);
                  }}
                >
                  x
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="surface connect-form">
        <div className="form-header">
          <div>
            <div className="eyebrow">
              {translate(props.language, "connection")}
            </div>
            <h2>Direct Moodle access from the browser</h2>
            <p>
              The app uses the Moodle REST API directly. Token-based access is
              the most reliable option for a frontend-only deployment.
            </p>
            <p>
              If the Chrome bridge extension is installed, the app can route
              Moodle requests through the extension instead of the page.
            </p>
          </div>
          <button
            className="ghost-button"
            onClick={() => setShowAiSettings(true)}
          >
            <Brain size={16} />
            {translate(props.language, "aiSettings")}
          </button>
        </div>

        <div
          className={`bridge-banner ${props.extensionBridgeAvailable ? "is-available" : "is-missing"}`}
        >
          <Brain size={16} />
          <span>
            {props.extensionBridgeAvailable
              ? "Chrome extension bridge detected. Moodle requests will use the extension."
              : "Chrome extension bridge not detected. You need to install it if the Moodle server blocks browser requests with CORS."}
          </span>
        </div>

        {!props.extensionBridgeAvailable ? (
          <div className="extension-install-warning">
            <div className="extension-install-warning__header">
              <AlertTriangle size={18} />
              <strong>Chrome extension required for CORS-blocked Moodle sites</strong>
            </div>
            <p>
              This app can detect the bridge automatically, but it is not installed in the current browser profile.
            </p>
            <ol>
              <li>Open <code>chrome://extensions</code></li>
              <li>Enable <strong>Developer mode</strong></li>
              <li>Click <strong>Load unpacked</strong></li>
              <li>Select the <code>extension/</code> folder from this repository</li>
              <li>Reload this page and confirm that the bridge is detected</li>
            </ol>
          </div>
        ) : null}

        <form
          className="grid-form"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onConnect(form);
          }}
        >
          <label>
            <span>{translate(props.language, "profileName")}</span>
            <input
              value={form.profileName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  profileName: event.target.value,
                }))
              }
              placeholder="My Moodle"
            />
          </label>
          <label>
            <span>{translate(props.language, "moodleUrl")}</span>
            <input
              required
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, baseUrl: event.target.value }))
              }
              placeholder="https://moodle.example.com"
            />
          </label>
          <label>
            <span>{translate(props.language, "token")}</span>
            <input
              value={form.token}
              onChange={(event) =>
                setForm((current) => ({ ...current, token: event.target.value }))
              }
              placeholder="Paste an existing web service token"
            />
          </label>
          <label>
            <span>{translate(props.language, "username")}</span>
            <input
              value={form.username}
              onChange={(event) =>
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="Optional when token is present"
            />
          </label>
          <label>
            <span>{translate(props.language, "password")}</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder="Only used to request a token"
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.saveProfile}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  saveProfile: event.target.checked,
                }))
              }
            />
            <span>{translate(props.language, "saveProfile")}</span>
          </label>

          <div className="form-note">
            <KeyRound size={16} />
            {translate(props.language, "generateToken")}
          </div>
          {props.error ? <div className="error-banner">{props.error}</div> : null}
          <button className="primary-button" disabled={props.loading} type="submit">
            {props.loading ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <GraduationCap size={16} />
            )}
            {translate(props.language, "connect")}
          </button>
        </form>
      </section>

      {showAiSettings ? (
        <AiSettingsDialog
          initialSettings={props.aiSettings}
          onClose={() => setShowAiSettings(false)}
          onSave={(settings) => {
            props.onSaveAiSettings(settings);
            setShowAiSettings(false);
          }}
        />
      ) : null}
    </main>
  );
}

type CourseSelectionScreenProps = {
  client: MoodleClient;
  defaultThreshold: number;
  onAnalyze: (course: CourseSummary, passThresholdPct: number) => Promise<void>;
};

function CourseSelectionScreen(
  props: CourseSelectionScreenProps,
): JSX.Element {
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
      const nextCourses =
        activeMode === "mine"
          ? await props.client.getMyCourses()
          : await props.client.getAllCourses();
      setCourses(nextCourses);
      setSelectedCourseId((current) => current ?? nextCourses[0]?.id ?? null);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to load courses.",
      );
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

  const selectedCourse =
    filteredCourses.find((course) => course.id === selectedCourseId) ??
    courses.find((course) => course.id === selectedCourseId) ??
    null;
  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    courses.forEach((course) => {
      const key = String(course.categoryname ?? course.category ?? "Uncategorized");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([name, total]) => ({ name, total }))
      .slice(0, 6);
  }, [courses]);

  return (
    <main className="courses-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <div className="eyebrow">Connected to {props.client.siteName || "Moodle"}</div>
          <h2>Choose the course to analyze</h2>
          <p>
            The web app mirrors the desktop workflow: course selection, passing
            threshold, aggregated analysis, and student-level inspection.
          </p>
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
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or key"
          />
        </label>
        <label className="threshold-input">
          <span>Pass threshold</span>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        <button className="ghost-button" onClick={() => void loadCourses(mode)}>
          <RefreshCcw size={16} />
          Reload
        </button>
        <button
          className="primary-button"
          disabled={!selectedCourse || loading}
          onClick={() => {
            const passThreshold = Number(threshold.replace(",", "."));
            if (
              !selectedCourse ||
              Number.isNaN(passThreshold) ||
              passThreshold <= 0 ||
              passThreshold > 100
            ) {
              return;
            }
            void props.onAnalyze(selectedCourse, passThreshold);
          }}
        >
          <LayoutDashboard size={16} />
          Analyze course
        </button>
      </section>

      <section className="course-grid">
        <div className="surface course-list-surface">
          {loading ? <div className="empty-note">Loading courses...</div> : null}
          {error ? <div className="error-banner">{error}</div> : null}
          {!loading && !error ? (
            <div className="course-list">
              {filteredCourses.map((course) => (
                <button
                  key={course.id}
                  className={`course-item ${selectedCourseId === course.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <div>
                    <strong>{course.fullname ?? course.shortname ?? `Course ${course.id}`}</strong>
                    <small>
                      {course.shortname ?? "No shortname"} · {course.categoryname ?? course.category ?? "Uncategorized"}
                    </small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="surface analytics-preview">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Course inventory</div>
              <h3>Category distribution</h3>
            </div>
          </div>
          <div className="chart-frame chart-frame--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <CartesianGrid vertical={false} stroke="#eadfcb" />
                <XAxis dataKey="name" hide />
                <YAxis allowDecimals={false} stroke="#7a6d5a" />
                <Tooltip />
                <Bar dataKey="total" fill="#0f7b6c" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {selectedCourse ? (
            <div className="selected-course-summary">
              <h4>{selectedCourse.fullname ?? selectedCourse.shortname}</h4>
              <p>
                {selectedCourse.categoryname ??
                  selectedCourse.category ??
                  "Uncategorized"}
              </p>
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
        </div>
      </section>
    </main>
  );
}

type DashboardScreenProps = {
  analysis: CourseAnalysis;
  aiSettings: AiSettings;
  language: LanguageCode;
  onBack: () => void;
  onOpenStudent: (studentId: number) => void;
};

function DashboardScreen(props: DashboardScreenProps): JSX.Element {
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

  const riskData = [
    { name: "High", value: props.analysis.courseMetrics.atRiskHigh, fill: RISK_COLORS.high },
    { name: "Medium", value: props.analysis.courseMetrics.atRiskMedium, fill: RISK_COLORS.medium },
    { name: "Low", value: props.analysis.courseMetrics.atRiskLow, fill: RISK_COLORS.low },
  ];

  const gradeDistributionData = Object.entries(
    props.analysis.courseMetrics.gradeDistribution,
  ).map(([name, total]) => ({
    name,
    total,
  }));

  const scatterData = students.map((student) => ({
    name: student.fullname,
    engagement: Number(formatNumber(student.metrics.engagementScore, 1)),
    grade: student.metrics.finalGradePct ?? student.prediction.predictedGradePct,
    riskProbability: student.prediction.riskProbability,
  }));

  async function handleGenerateReport(): Promise<void> {
    setReportLoading(true);
    setReportError(null);
    try {
      const markdown = await generateCourseReport(
        props.analysis,
        props.aiSettings,
        props.language,
      );
      setReport(markdown);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Unable to generate report.",
      );
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
          <h2>
            {props.analysis.course.fullname ??
              props.analysis.course.shortname ??
              "Course analysis"}
          </h2>
          <p>
            Pass threshold: {props.analysis.passThresholdPct}% · Logs available:{" "}
            {props.analysis.logsAvailable ? "yes" : "no"}
          </p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile
            label="Students"
            value={String(props.analysis.courseMetrics.totalStudents)}
            tone="accent"
          />
          <MetricTile
            label="Average engagement"
            value={formatPercent(props.analysis.courseMetrics.avgEngagement, 0)}
            tone="neutral"
          />
          <MetricTile
            label="Average grade"
            value={formatPercent(props.analysis.courseMetrics.avgGradePct, 0)}
            tone="neutral"
          />
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
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={scatterData} fill="#b54a2a" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartSurface>
        <section className="surface recommendations-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Teacher signals</div>
              <h3>Recommended actions</h3>
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
            onDownload={() =>
              downloadTextFile(
                `${slugify(props.analysis.course.fullname ?? "course")}-report.md`,
                report,
              )
            }
          />
        </section>
      </section>

      <section className="surface student-table-surface">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Student list</div>
            <h3>Risk-ranked roster</h3>
          </div>
          <label className="inline-input inline-input--tight">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students"
            />
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
            <button
              key={student.id}
              className="student-row"
              onClick={() => props.onOpenStudent(student.id)}
            >
              <span>
                <strong>{student.fullname}</strong>
                <small>{student.email || "No email"}</small>
              </span>
              <span
                className="risk-badge"
                style={{
                  backgroundColor: `${RISK_COLORS[student.riskLevel]}22`,
                  color: RISK_COLORS[student.riskLevel],
                }}
              >
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
    </main>
  );
}

type StudentDetailScreenProps = {
  analysis: CourseAnalysis;
  aiSettings: AiSettings;
  language: LanguageCode;
  student: StudentAnalysis;
  onBack: () => void;
};

function StudentDetailScreen(props: StudentDetailScreenProps): JSX.Element {
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const percentileData = useMemo(() => {
    const metrics = props.analysis.students.map((student) => student.metrics);
    const subject = props.student.metrics;
    const fields: Array<{ label: string; value: number | null; values: number[] }> = [
      {
        label: "Engagement",
        value: subject.engagementScore,
        values: metrics.map((item) => item.engagementScore),
      },
      {
        label: "Completion",
        value: subject.completionRate,
        values: metrics.map((item) => item.completionRate ?? 0),
      },
      {
        label: "Submission",
        value: subject.submissionRate,
        values: metrics.map((item) => item.submissionRate ?? 0),
      },
      {
        label: "Quiz average",
        value: subject.quizAvgPct,
        values: metrics.map((item) => item.quizAvgPct ?? 0),
      },
    ];

    return fields.map((field) => {
      const current = field.value ?? 0;
      const percentile =
        field.values.filter((value) => value <= current).length /
        Math.max(field.values.length, 1);
      return {
        label: field.label,
        percentile: Math.round(percentile * 100),
      };
    });
  }, [props.analysis.students, props.student.metrics]);

  const gradeTimeline = useMemo(() => {
    return props.student.metrics.gradeItems
      .filter((item) => item.gradePct !== null)
      .sort((left, right) => (left.gradedAt ?? 0) - (right.gradedAt ?? 0))
      .map((item) => ({
        name: item.name,
        grade: item.gradePct ?? 0,
      }));
  }, [props.student.metrics.gradeItems]);

  const activityBars = [
    { name: "Completion", value: props.student.metrics.completionRate ?? 0 },
    { name: "Submissions", value: props.student.metrics.submissionRate ?? 0 },
    { name: "On time", value: props.student.metrics.onTimeRate ?? 0 },
    { name: "Quizzes", value: props.student.metrics.quizCoverageRate ?? 0 },
    { name: "Engagement", value: props.student.metrics.engagementScore },
  ];

  async function handleGenerateReport(): Promise<void> {
    setReportLoading(true);
    setReportError(null);
    try {
      const markdown = await generateStudentReport(
        props.analysis,
        props.student,
        props.aiSettings,
        props.language,
      );
      setReport(markdown);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Unable to generate report.",
      );
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
          <p>
            {props.student.email || "No email available"} · Last access:{" "}
            {props.student.metrics.lastAccessLabel}
          </p>
        </div>
        <div className="hero-stats hero-stats--compact">
          <MetricTile
            label="Risk"
            value={props.student.riskLevel}
            tone={
              props.student.riskLevel === "high"
                ? "danger"
                : props.student.riskLevel === "medium"
                  ? "warning"
                  : "success"
            }
          />
          <MetricTile
            label="Current grade"
            value={formatPercent(props.student.metrics.finalGradePct, 0)}
            tone="neutral"
          />
          <MetricTile
            label="Predicted grade"
            value={formatPercent(props.student.prediction.predictedGradePct, 0)}
            tone="neutral"
          />
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

      <section className="dashboard-grid">
        <ChartSurface title="Grade timeline">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={gradeTimeline}>
              <CartesianGrid vertical={false} stroke="#eadfcb" />
              <XAxis dataKey="name" hide />
              <YAxis stroke="#7a6d5a" />
              <Tooltip />
              <Line type="monotone" dataKey="grade" stroke="#b54a2a" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
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
          <ReportPane
            title="Student AI report"
            markdown={report}
            loading={reportLoading}
            error={reportError}
            onDownload={() =>
              downloadTextFile(`${slugify(props.student.fullname)}-report.md`, report)
            }
          />
        </section>
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
    </main>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: "accent" | "neutral" | "danger" | "warning" | "success" }): JSX.Element {
  return (
    <div className={`metric-tile metric-tile--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartSurface({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="surface chart-surface">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Visualization</div>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="chart-frame">{children}</div>
    </section>
  );
}

function ReportPane({ title, markdown, loading, error, onDownload }: { title: string; markdown: string; loading: boolean; error: string | null; onDownload: () => void }): JSX.Element {
  return (
    <div className="report-pane">
      <div className="report-pane__header">
        <div>
          <div className="eyebrow">AI output</div>
          <h4>{title}</h4>
        </div>
        <button className="ghost-button" disabled={!markdown} onClick={onDownload}>
          <Save size={16} />
          Download markdown
        </button>
      </div>
      {loading ? <div className="empty-note">Generating report...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {!loading && !error && !markdown ? <div className="empty-note">No report generated yet.</div> : null}
      {markdown ? <pre className="report-pane__content">{markdown}</pre> : null}
    </div>
  );
}

function AiSettingsDialog({ initialSettings, onClose, onSave }: { initialSettings: AiSettings; onClose: () => void; onSave: (settings: AiSettings) => void }): JSX.Element {
  const [form, setForm] = useState(initialSettings);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <motion.div className="modal-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <div className="eyebrow">Optional local AI</div>
            <h3>OpenAI-compatible report endpoint</h3>
          </div>
        </div>
        <form className="grid-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
          <label>
            <span>Provider</span>
            <select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as AiSettings["provider"] }))}>
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            <span>Base URL</span>
            <input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="http://127.0.0.1:11434" />
          </label>
          <label>
            <span>Model</span>
            <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="llama3.1:latest" />
          </label>
          <label>
            <span>API key</span>
            <input value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Optional" />
          </label>
          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              Close
            </button>
            <button className="primary-button" type="submit">
              Save settings
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function LoadingOverlay({ message, percent }: { message: string; percent: number }): JSX.Element {
  return (
    <motion.div className="loading-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="loading-card" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }}>
        <LoaderCircle className="spin" size={22} />
        <div>
          <strong>{message}</strong>
          <span>{percent}%</span>
        </div>
        <div className="loading-bar">
          <div className="loading-bar__fill" style={{ width: `${percent}%` }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default App;
