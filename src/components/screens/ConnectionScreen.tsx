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
  const t = (key: Parameters<typeof translate>[1]) => translate(props.language, key);

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
          <div className="eyebrow">{t("profiles")}</div>
          <h2>{t("reusableEntryPoints")}</h2>
          <p>{t("profilesHelp")}</p>
        </div>
        <div className="profile-list">
          {props.profiles.length === 0 ? <div className="empty-note">{t("noSavedProfilesYet")}</div> : null}
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
            <div className="eyebrow">{t("connection")}</div>
            <h2>{t("directMoodleAccess")}</h2>
            <p>{t("connectionHelpPrimary")}</p>
            <p>{t("connectionHelpSecondary")}</p>
          </div>
          <button className="ghost-button" onClick={() => setShowAiSettings(true)}>
            <Brain size={16} />
            {t("aiSettings")}
          </button>
        </div>

        <div className={`bridge-banner ${props.extensionBridgeAvailable ? "is-available" : "is-missing"}`}>
          <Brain size={16} />
          <span>{props.extensionBridgeAvailable ? t("extensionDetected") : t("extensionMissing")}</span>
        </div>

        {!props.extensionBridgeAvailable ? (
          <div className="extension-install-warning">
            <div className="extension-install-warning__header">
              <AlertTriangle size={18} />
              <strong>{t("extensionRequired")}</strong>
            </div>
            <p>{t("extensionMissingBody")}</p>
            <ol>
              <li>{t("openChromeExtensions")}</li>
              <li>{t("enableDeveloperMode")}</li>
              <li>{t("loadUnpacked")}</li>
              <li>{t("selectExtensionProject")}</li>
              <li>{t("reloadPage")}</li>
            </ol>
          </div>
        ) : null}

        <form className="grid-form" onSubmit={(event) => { event.preventDefault(); void props.onConnect(form); }}>
          <label>
            <span>{t("profileName")}</span>
            <input value={form.profileName} onChange={(event) => setForm((current) => ({ ...current, profileName: event.target.value }))} placeholder={t("myMoodle")} />
          </label>
          <label>
            <span>{t("moodleUrl")}</span>
            <input required value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://moodle.example.com" />
          </label>
          <label>
            <span>{t("token")}</span>
            <input value={form.token} onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))} placeholder={t("pasteExistingToken")} />
          </label>
          <label>
            <span>{t("username")}</span>
            <input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder={t("optionalWhenTokenPresent")} />
          </label>
          <label>
            <span>{t("password")}</span>
            <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={t("onlyUsedToRequestToken")} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.saveProfile} onChange={(event) => setForm((current) => ({ ...current, saveProfile: event.target.checked }))} />
            <span>{t("saveProfile")}</span>
          </label>

          <div className="form-note">
            <KeyRound size={16} />
            {t("generateToken")}
          </div>
          {props.error ? <div className="error-banner">{props.error}</div> : null}
          <button className="primary-button primary-button--wide" disabled={props.loading} type="submit">
            {props.loading ? <LoaderCircle className="spin" size={16} /> : <GraduationCap size={16} />}
            {t("connect")}
          </button>
        </form>
      </section>

      {showAiSettings ? (
        <AiSettingsDialog
          initialSettings={props.aiSettings}
          language={props.language}
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
