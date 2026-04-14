import { useState } from "react";
import type { JSX } from "react";
import { AlertTriangle, Brain, ChevronRight, GraduationCap, KeyRound, LoaderCircle } from "lucide-react";

import { AiSettingsDialog } from "../common/AiSettingsDialog";
import { DEFAULT_FORM } from "../../constants/ui";
import { translate } from "../../lib/i18n";
import type { AiSettings, ConnectFormValues, ConnectionProfile, LanguageCode } from "../../types";

export type ConnectionScreenProps = {
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

export function ConnectionScreen(props: ConnectionScreenProps): JSX.Element {
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
          <div className="eyebrow">{translate(props.language, "profiles")}</div>
          <h2>Reusable entry points</h2>
          <p>Profiles are stored locally in the browser. Passwords are never persisted.</p>
        </div>
        <div className="profile-list">
          {props.profiles.length === 0 ? <div className="empty-note">No saved profiles yet.</div> : null}
          {props.profiles.map((profile) => (
            <button key={profile.name} className="profile-chip" onClick={() => fillFromProfile(profile)}>
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
            <div className="eyebrow">{translate(props.language, "connection")}</div>
            <h2>Direct Moodle access from the browser</h2>
            <p>The app uses the Moodle REST API directly. Token-based access is the most reliable option for a frontend-only deployment.</p>
            <p>If the Chrome bridge extension is installed, the app can route Moodle requests through the extension instead of the page.</p>
          </div>
          <button className="ghost-button" onClick={() => setShowAiSettings(true)}>
            <Brain size={16} />
            {translate(props.language, "aiSettings")}
          </button>
        </div>

        <div className={`bridge-banner ${props.extensionBridgeAvailable ? "is-available" : "is-missing"}`}>
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
            <p>This app can detect the bridge automatically, but it is not installed in the current browser profile.</p>
            <ol>
              <li>Open <code>chrome://extensions</code></li>
              <li>Enable <strong>Developer mode</strong></li>
              <li>Click <strong>Load unpacked</strong></li>
              <li>Select <code>D:\ProyectosIA\proxy extension</code></li>
              <li>Reload this page and confirm that the bridge is detected</li>
            </ol>
          </div>
        ) : null}

        <form className="grid-form" onSubmit={(event) => { event.preventDefault(); void props.onConnect(form); }}>
          <label>
            <span>{translate(props.language, "profileName")}</span>
            <input value={form.profileName} onChange={(event) => setForm((current) => ({ ...current, profileName: event.target.value }))} placeholder="My Moodle" />
          </label>
          <label>
            <span>{translate(props.language, "moodleUrl")}</span>
            <input required value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://moodle.example.com" />
          </label>
          <label>
            <span>{translate(props.language, "token")}</span>
            <input value={form.token} onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))} placeholder="Paste an existing web service token" />
          </label>
          <label>
            <span>{translate(props.language, "username")}</span>
            <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="Optional when token is present" />
          </label>
          <label>
            <span>{translate(props.language, "password")}</span>
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Only used to request a token" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.saveProfile} onChange={(event) => setForm((current) => ({ ...current, saveProfile: event.target.checked }))} />
            <span>{translate(props.language, "saveProfile")}</span>
          </label>

          <div className="form-note">
            <KeyRound size={16} />
            {translate(props.language, "generateToken")}
          </div>
          {props.error ? <div className="error-banner">{props.error}</div> : null}
          <button className="primary-button" disabled={props.loading} type="submit">
            {props.loading ? <LoaderCircle className="spin" size={16} /> : <GraduationCap size={16} />}
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
