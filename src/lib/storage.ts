import type { AiSettings, ConnectionProfile, LanguageCode } from "../types";

const PROFILES_KEY = "moodle-analyzer-web:profiles";
const LANGUAGE_KEY = "moodle-analyzer-web:language";
const AI_SETTINGS_KEY = "moodle-analyzer-web:ai-settings";

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  model: "",
  apiKey: "",
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadProfiles(): ConnectionProfile[] {
  const profiles = safeRead<ConnectionProfile[]>(PROFILES_KEY, []);
  return [...profiles].sort((left, right) => {
    return right.lastUsed.localeCompare(left.lastUsed);
  });
}

export function upsertProfile(profile: Omit<ConnectionProfile, "lastUsed">): ConnectionProfile[] {
  const profiles = loadProfiles();
  const next: ConnectionProfile = { ...profile, lastUsed: new Date().toISOString() };
  const index = profiles.findIndex((item) => item.name === profile.name);

  if (index >= 0) {
    profiles[index] = next;
  } else {
    profiles.push(next);
  }

  safeWrite(PROFILES_KEY, profiles);
  return loadProfiles();
}

export function deleteProfile(name: string): ConnectionProfile[] {
  const profiles = loadProfiles().filter((profile) => profile.name !== name);
  safeWrite(PROFILES_KEY, profiles);
  return profiles;
}

export function loadLanguage(): LanguageCode {
  const language = safeRead<LanguageCode>(LANGUAGE_KEY, "en");
  return language;
}

export function saveLanguage(language: LanguageCode): void {
  safeWrite(LANGUAGE_KEY, language);
}

export function loadAiSettings(): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...safeRead<Partial<AiSettings>>(AI_SETTINGS_KEY, {}),
  };
}

export function saveAiSettings(settings: AiSettings): AiSettings {
  const next = { ...DEFAULT_AI_SETTINGS, ...settings };
  safeWrite(AI_SETTINGS_KEY, next);
  return next;
}
