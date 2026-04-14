import type { JSX } from "react";
import { Save } from "lucide-react";

import { translate } from "../../lib/i18n";
import type { LanguageCode } from "../../types";

export function ReportPane({
  title,
  markdown,
  loading,
  error,
  language,
  onDownload,
}: {
  title: string;
  markdown: string;
  loading: boolean;
  error: string | null;
  language: LanguageCode;
  onDownload: () => void;
}): JSX.Element {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  return (
    <div className="report-pane">
      <div className="report-pane__header">
        <div>
          <div className="eyebrow">{t("aiOutput")}</div>
          <h4>{title}</h4>
        </div>
        <button className="ghost-button" disabled={!markdown} onClick={onDownload}>
          <Save size={16} />
          {t("downloadMarkdown")}
        </button>
      </div>
      {loading ? <div className="empty-note">{t("generatingReport")}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {!loading && !error && !markdown ? <div className="empty-note">{t("noReportGeneratedYet")}</div> : null}
      {markdown ? <pre className="report-pane__content">{markdown}</pre> : null}
    </div>
  );
}
