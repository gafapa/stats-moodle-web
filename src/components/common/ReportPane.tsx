import type { JSX } from "react";
import { Save } from "lucide-react";

export function ReportPane({
  title,
  markdown,
  loading,
  error,
  onDownload,
}: {
  title: string;
  markdown: string;
  loading: boolean;
  error: string | null;
  onDownload: () => void;
}): JSX.Element {
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
