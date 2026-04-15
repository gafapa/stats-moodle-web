import { useEffect, useState } from "react";
import type { JSX } from "react";
import { AnimatePresence } from "framer-motion";
import { Globe, LogOut } from "lucide-react";

import { MoodleClient } from "./api/moodleClient";
import { CourseAnalyzer } from "./analysis/courseAnalyzer";
import { DataCollector } from "./analysis/dataCollector";
import { LoadingOverlay } from "./components/common/LoadingOverlay";
import { ConnectionScreen } from "./components/screens/ConnectionScreen";
import { CourseSelectionScreen } from "./components/screens/CourseSelectionScreen";
import { DashboardScreen } from "./components/screens/DashboardScreen";
import { StudentDetailScreen } from "./components/screens/StudentDetailScreen";
import {
  initializeExtensionBridge,
  isExtensionBridgeAvailable,
  subscribeExtensionBridgeAvailability,
} from "./lib/extensionBridge";
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
} from "./types";

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
      setConnectError(error instanceof Error ? error.message : t("connectionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyze(course: CourseSummary, passThresholdPct: number): Promise<void> {
    if (!session) {
      return;
    }

    setBusy(true);
    setProgressMessage(t("preparingAnalysis"));
    setProgressPercent(0);

    try {
      const collector = new DataCollector(session.client);
      const collected = await collector.collectCourseData(course.id, course, (message, percent) => {
        setProgressMessage(message);
        setProgressPercent(percent);
      });
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
      ) : analysis && activeStudent ? (
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
          onAnalyze={handleAnalyze}
        />
      )}

      <AnimatePresence>
        {busy ? <LoadingOverlay message={progressMessage} percent={progressPercent} /> : null}
      </AnimatePresence>
    </div>
  );
}

export default App;
