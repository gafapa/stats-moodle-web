import { useState } from "react";
import type { JSX } from "react";
import { motion } from "framer-motion";
import type { AiSettings } from "../../types";

export function AiSettingsDialog({
  initialSettings,
  onClose,
  onSave,
}: {
  initialSettings: AiSettings;
  onClose: () => void;
  onSave: (settings: AiSettings) => void;
}): JSX.Element {
  const [form, setForm] = useState(initialSettings);

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
