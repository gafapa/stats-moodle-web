import type { JSX } from "react";

export function TabBar({
  activeTab,
  items,
  onChange,
}: {
  activeTab: string;
  items: Array<{ id: string; label: string }>;
  onChange: (tabId: string) => void;
}): JSX.Element {
  return (
    <div className="tab-bar" role="tablist" aria-label="Section navigation">
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
