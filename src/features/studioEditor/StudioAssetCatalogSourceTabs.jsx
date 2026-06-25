import React from "react";

export const CATALOG_SOURCE_TABS = [
  { id: "all", label: "All" },
  { id: "pascal", label: "Pascal" },
  { id: "generated", label: "Generated" },
  { id: "mine", label: "Mine" },
  { id: "community", label: "Community" }
];

export function StudioAssetCatalogSourceTabs({
  onSourceFilterChange,
  sourceCounts = {},
  sourceFilter,
  sources = CATALOG_SOURCE_TABS
}) {
  return (
    <div className="studio-catalog-source-tabs" aria-label="자산 소스">
      {sources.map((source) => (
        <button
          aria-pressed={sourceFilter === source.id}
          className={sourceFilter === source.id ? "is-active" : ""}
          key={source.id}
          onClick={() => onSourceFilterChange?.(source.id)}
          title={`${source.label} · ${sourceCounts[source.id] ?? 0} assets`}
          type="button"
        >
          <span>{source.label}</span>
          <em>{sourceCounts[source.id] ?? 0}</em>
        </button>
      ))}
    </div>
  );
}
