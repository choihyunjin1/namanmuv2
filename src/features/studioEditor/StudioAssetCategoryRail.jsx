import React, { useMemo, useState } from "react";
import { STUDIO_CATALOG_HOME_ICON_SRC } from "./studioAssetCatalogDisplay.js";

export function StudioAssetCategoryRail({
  activeCategoryId,
  categories,
  categoryCounts = {},
  categorySummaries = {},
  collapsed = false,
  onCategoryChange,
  onCollapseToggle
}) {
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) ?? categories[0],
    [activeCategoryId, categories]
  );
  const hoveredCategory = useMemo(
    () => categories.find((category) => category.id === hoveredCategoryId),
    [categories, hoveredCategoryId]
  );
  const readoutCategory = hoveredCategory ?? activeCategory;
  const readoutCount = readoutCategory ? categoryCounts[readoutCategory.id] ?? 0 : 0;
  const readoutPolicy = readoutCategory ? categorySummaries[readoutCategory.id]?.policyBadge ?? "asset" : "asset";

  return (
    <div className="studio-catalog-home-panel">
      <div className="studio-catalog-house-column">
        <div className="studio-catalog-house-card" aria-hidden="true">
          <img alt="" draggable="false" src={STUDIO_CATALOG_HOME_ICON_SRC} />
          <span />
        </div>
        <button
          aria-label={collapsed ? "카탈로그 펼치기" : "카탈로그 접기"}
          className={`studio-catalog-collapse-toggle${collapsed ? " is-collapsed" : ""}`}
          onClick={onCollapseToggle}
          title={collapsed ? "카탈로그 펼치기" : "카탈로그 접기"}
          type="button"
        >
          {collapsed ? "›" : "‹"}
        </button>
        <div className="studio-catalog-category-readout" aria-live="polite">
          <strong>{readoutCategory?.label ?? "자산"}</strong>
          <span className="studio-catalog-readout-count">{readoutCount}</span>
          <em>{readoutPolicy}</em>
        </div>
      </div>
      <div className="studio-catalog-categories" aria-label="자산 카테고리">
        {categories.map((category) => {
          const isActiveCategory = category.id === activeCategoryId;
          const categoryCount = categoryCounts[category.id] ?? 0;
          const categorySummary = categorySummaries[category.id] ?? { policyBadge: "asset", policySummary: "asset" };
          const Icon = category.icon;

          return (
            <button
              aria-label={`${category.label}, ${categoryCount}개, ${categorySummary.policySummary}`}
              aria-pressed={isActiveCategory}
              className={[
                "studio-catalog-category-button",
                isActiveCategory ? "is-active" : "",
                collapsed && isActiveCategory ? "is-rail-active" : ""
              ].filter(Boolean).join(" ")}
              data-category-id={category.id}
              data-count={categoryCount}
              data-policy={categorySummary.policySummary}
              data-policy-badge={categorySummary.policyBadge}
              data-tooltip={category.label}
              key={category.id}
              onClick={() => {
                if (collapsed) onCollapseToggle?.();
                onCategoryChange?.(category.id);
              }}
              onBlur={() => setHoveredCategoryId(null)}
              onFocus={() => setHoveredCategoryId(category.id)}
              onMouseEnter={() => setHoveredCategoryId(category.id)}
              onMouseLeave={() => setHoveredCategoryId(null)}
              title={`${category.label} · ${categoryCount}개 · ${categorySummary.policySummary}`}
              type="button"
            >
              {category.iconSrc ? <img alt="" draggable="false" src={category.iconSrc} /> : <Icon size={18} />}
              <span className="studio-catalog-category-count" aria-hidden="true">{categoryCount}</span>
              <span className="studio-catalog-category-policy" aria-hidden="true">{categorySummary.policyBadge}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
