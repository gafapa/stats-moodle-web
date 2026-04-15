import { lazy, Suspense, useEffect, useState } from "react";
import type { JSX } from "react";
import { AnimatePresence } from "framer-motion";
import { Globe, LogOut } from "lucide-react";

import { MoodleClient } from "./api/moodleClient";
import { CourseAnalyzer } from "./analysis/courseAnalyzer";
import { DataCollector } from "./analysis/dataCollector";
import { LoadingOverlay } from "./components/common/LoadingOverlay";
import { ConnectionScreen } from "./components/screens/ConnectionScreen";
import {
  initializeExtensionBridge,
  isExtensionBridgeAvailable,
  subscribeExtensionBridgeAvailability,
} from "./lib/extensionBridge";
import { loadCachedAnalysis, saveCachedAnalysis } from "./lib/analysisCache";
import { supportedLanguages, translate } from "./lib/i18n";
import {
  deleteProfile,
  loadAiSettings,
  loadLanguage,
  loadProfiles,
  logRuntimeIssue,
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
} from "./types";

const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 4;

const CourseSelectionScreen = lazy(async () => {
  const module = await import("./components/screens/CourseSelectionScreen");
  return { default: module.CourseSelectionScreen };
});

const DashboardScreen = lazy(async () => {
  const module = await import("./components/screens/DashboardScreen");
  return { default: module.DashboardScreen };
});

const StudentDetailScreen = lazy(async () => {
  const module = await import("./components/screens/StudentDetailScreen");
  return { default: module.StudentDetailScreen };
});

function ScreenFallback({ title }: { title: string }): JSX.Element {
  return (
    <main className="courses-layout">
      <section className="surface surface--hero">
        <div className="hero-copy">
          <div className="eyebrow">React + Vite</div>
          <h2>{title}</h2>
          <p>Loading workspace...</p>
        </div>
      </section>
    </main>
  );
}

function App(): JSX.Element {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() => loadProfiles());
  const [language, setLanguage] = useState<LanguageCode>(() => loadLanguage());
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [extensionBridgeAvailable, setExtensionBridgeAvailable] = useState<boolean>(() => isExtensionBridgeAvailable());
  const [session, setSession] = useState<{ client: MoodleClient } | null>(null);
  const [analysis, setAnalysis] = useState<CourseAnalysis | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState(translate(loadLanguage(), "waiting"));
  const [progressPercent, setProgressPercent] = useState(0);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  useEffect(() => {
    initializeExtensionBridge();
    return subscribeExtensionBridgeAvailability(setExtensionBridgeAvailable);
  }, []);

  const activeStudent = analysis?.students.find((student) => student.id === selectedStudentId) ?? null;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  async function handleConnect(values: ConnectFormValues): Promise<void> {
    setBusy(true);
    setConnectError(null);
    setAnalysisError(null);

    try {
      const client = values.token.trim()
        ? await MoodleClient.fromToken(values.baseUrl, values.token.trim())
        : await MoodleClient.fromCredentials(values.baseUrl, values.username.trim(), values.password);

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
      logRuntimeIssue({
        scope: "connection",
        message: "Connection failed",
        detail: error instanceof Error ? error.message : "Unknown connection error",
      });
      setConnectError(error instanceof Error ? error.message : t("connectionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze(course: CourseSummary, passThresholdPct: number): Promise<void> {
    if (!session) {
      return;
    }

    setAnalysisError(null);

    const cached = await loadCachedAnalysis(session.client.baseUrl, course.id, passThresholdPct).catch(() => null);
    if (cached) {
      setAnalysis(cached.analysis);
      setSelectedStudentId(null);

      const ageMs = Date.now() - new Date(cached.savedAt).getTime();
      if (ageMs <= CACHE_MAX_AGE_MS) {
        return;
      }
    }

    setBusy(true);
    setProgressMessage(cached ? "Refreshing cached analysis" : t("preparingAnalysis"));
    setProgressPercent(cached ? 10 : 0);

    try {
      const collector = new DataCollector(session.client);
      const collected = await collector.collectCourseData(course.id, course, (message, percent) => {
        setProgressMessage(message);
        setProgressPercent(percent);
      });
      const nextAnalysis = new CourseAnalyzer(passThresholdPct).analyze(collected);
      setAnalysis(nextAnalysis);
      setSelectedStudentId(null);
      await saveCachedAnalysis(session.client.baseUrl, course.id, passThresholdPct, nextAnalysis).catch(() => undefined);
    } catch (error) {
      logRuntimeIssue({
        scope: "analysis",
        message: "Course analysis failed",
        detail: error instanceof Error ? error.message : "Unknown analysis error",
      });
      setAnalysisError(error instanceof Error ? error.message : "Unable to analyze the selected course.");
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect(): void {
    setSession(null);
    setAnalysis(null);
    setSelectedStudentId(null);
    setConnectError(null);
    setAnalysisError(null);
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
          <div className="eyebrow">{t("runtimeLabel")}</div>
          <h1>{t("appName")}</h1>
          <p>{t("appTagline")}</p>
        </div>
        <div className="topbar__actions">
          <label className="language-picker">
            <Globe size={16} />
            <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageCode)}>
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
      ) : (
        <Suspense fallback={<ScreenFallback title={t("waiting")} />}>
          {analysis && activeStudent ? (
            <StudentDetailScreen
              client={session.client}
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
              language={language}
              defaultThreshold={50}
              externalError={analysisError}
              onAnalyze={handleAnalyze}
            />
          )}
        </Suspense>
      )}

      <AnimatePresence>
        {busy ? <LoadingOverlay message={progressMessage} percent={progressPercent} /> : null}
      </AnimatePresence>
    </div>
  );
}

export default App;
