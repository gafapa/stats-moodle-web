export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${round(value, digits).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return round(value, digits).toFixed(digits);
}

export function formatDateFromTimestamp(timestamp?: number | null): string {
  if (!timestamp) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadDataFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

export function downloadCsvFile(filename: string, rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(String(row[header] ?? ""))).join(",")),
  ];

  downloadDataFile(filename, lines.join("\n"), "text/csv;charset=utf-8");
}

export function downloadJsonFile(filename: string, value: unknown): void {
  downloadDataFile(filename, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
