import type { JSX } from "react";

export function TabBar({
  activeTab,
  ariaLabel,
  items,
  onChange,
  variant = "default",
}: {
  activeTab: string;
  ariaLabel: string;
  items: Array<{ id: string; label: string }>;
  onChange: (tabId: string) => void;
  variant?: "default" | "subtle";
}): JSX.Element {
  return (
    <div className={`tab-bar ${variant === "subtle" ? "tab-bar--subtle" : ""}`} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`tab-button ${activeTab === item.id ? "is-active" : ""}`}
          role="tab"
          type="button"
          aria-selected={activeTab === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
