import { useState } from "react";
import type { JSX } from "react";
import { motion } from "framer-motion";

import { translate } from "../../lib/i18n";
import type { AiSettings, LanguageCode } from "../../types";

export function AiSettingsDialog({
  initialSettings,
  language,
  onClose,
  onSave,
}: {
  initialSettings: AiSettings;
  language: LanguageCode;
  onClose: () => void;
  onSave: (settings: AiSettings) => void;
}): JSX.Element {
  const [form, setForm] = useState(initialSettings);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <motion.div
        className="modal-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <div className="eyebrow">{t("optionalLocalAi")}</div>
            <h3>{t("aiEndpoint")}</h3>
          </div>
        </div>
        <form className="grid-form" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
          <label>
            <span>{t("provider")}</span>
            <select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as AiSettings["provider"] }))}>
              <option value="ollama">Ollama</option>
              <option value="lmstudio">LM Studio</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            <span>{t("baseUrl")}</span>
            <input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="http://127.0.0.1:11434" />
          </label>
          <label>
            <span>{t("model")}</span>
            <input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="llama3.1:latest" />
          </label>
          <label>
            <span>{t("apiKey")}</span>
            <input value={form.apiKey} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Optional" />
          </label>
          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              {t("close")}
            </button>
            <button className="primary-button" type="submit">
              {t("saveSettings")}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
