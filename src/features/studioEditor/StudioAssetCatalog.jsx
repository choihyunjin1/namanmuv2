import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  STUDIO_CATALOG_ASSETS,
  STUDIO_CATALOG_CATEGORIES,
  getCatalogAssetsByCategory
} from "./studioCatalog.js";
import { StudioAssetCatalogCard } from "./StudioAssetCatalogCard.jsx";
import { StudioAssetGenerationControls } from "./StudioAssetGenerationControls.jsx";
import { CATALOG_SOURCE_TABS, StudioAssetCatalogSourceTabs } from "./StudioAssetCatalogSourceTabs.jsx";
import { StudioAssetRecentStrip } from "./StudioAssetRecentStrip.jsx";
import {
  STUDIO_CATALOG_HOME_ICON_SRC,
  getCategoryPlacementBadgeSummary,
  getCategoryPlacementSummary,
  getStairCardDescriptor
} from "./studioAssetCatalogDisplay.js";

function getAssetSourceId(asset) {
  return asset.sourceId ?? asset.librarySource ?? asset.source ?? "pascal";
}

function matchesCatalogSource(asset, sourceId) {
  return sourceId === "all" || getAssetSourceId(asset) === sourceId;
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getAssetApiResults(payload) {
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

function getAssetDedupKey(asset) {
  return asset?.assetSourceId ?? asset?.metadata?.sourceAssetId ?? asset?.id ?? "";
}

export function StudioAssetCatalog({
  activeCategoryId,
  activeAssetId,
  assets: catalogAssets = STUDIO_CATALOG_ASSETS,
  collapsed = false,
  generationStatus = null,
  onCategoryChange,
  onCollapseToggle,
  onAssetPick,
  onDragAssetStart,
  onGenerateAsset,
  onGenerateSceneFromBrief,
  onResizeStart,
  recentAssetIds = []
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [assetApiSearch, setAssetApiSearch] = useState({
    query: "",
    results: [],
    status: "idle"
  });
  const [sourceFilter, setSourceFilter] = useState("all");
  const sourceAssets = useMemo(
    () => catalogAssets.filter((asset) => matchesCatalogSource(asset, sourceFilter)),
    [catalogAssets, sourceFilter]
  );
  const categoryAssets = useMemo(
    () => sourceAssets.filter((asset) => asset.categoryId === activeCategoryId),
    [activeCategoryId, sourceAssets]
  );
  const normalizedSearch = normalizeSearchText(searchTerm);
  const localSearchAssets = useMemo(() => {
    if (!normalizedSearch) return [];
    return sourceAssets.filter((asset) => {
      const category = STUDIO_CATALOG_CATEGORIES.find((item) => item.id === asset.categoryId);
      const stairDescriptor = getStairCardDescriptor(asset);
      return [
        asset.label,
        asset.id,
        asset.placementMode,
        asset.stairType,
        asset.previewMaterialLabel,
        asset.placementTitle,
        asset.placementHint,
        asset.status,
        asset.previewQuality,
        stairDescriptor?.badgeLabel,
        stairDescriptor?.metaLabel,
        category?.label
      ]
        .some((field) => normalizeSearchText(field).includes(normalizedSearch));
    });
  }, [normalizedSearch, sourceAssets]);
  const assets = useMemo(() => {
    if (!normalizedSearch) return categoryAssets;

    const activeApiResults = assetApiSearch.query === searchTerm.trim() ? assetApiSearch.results : [];
    const apiResultsByDedupKey = new Map(activeApiResults.map((asset) => [getAssetDedupKey(asset), asset]).filter(([key]) => key));
    const catalogAssetIds = new Set(catalogAssets.map(getAssetDedupKey).filter(Boolean));
    const mergedAssets = localSearchAssets.map((asset) => {
      const apiAsset = apiResultsByDedupKey.get(getAssetDedupKey(asset));
      if (!apiAsset) return asset;
      return {
        ...asset,
        cost: asset.cost ?? apiAsset.cost,
        optimizedModelUrl: asset.optimizedModelUrl ?? apiAsset.optimizedModelUrl,
        originalModelUrl: asset.originalModelUrl ?? apiAsset.originalModelUrl,
        runtime: asset.runtime ?? apiAsset.runtime,
        score: apiAsset.score,
        sourceLabel: asset.sourceLabel ?? apiAsset.sourceLabel,
        sourceType: asset.sourceType ?? apiAsset.sourceType,
        metadata: {
          ...(apiAsset.metadata ?? {}),
          ...(asset.metadata ?? {})
        }
      };
    });
    const mergedAssetIds = new Set(mergedAssets.map(getAssetDedupKey).filter(Boolean));

    activeApiResults.forEach((asset) => {
      const dedupKey = getAssetDedupKey(asset);
      if (!asset?.id || catalogAssetIds.has(dedupKey) || mergedAssetIds.has(dedupKey)) return;
      mergedAssets.push(asset);
      mergedAssetIds.add(dedupKey);
    });

    return mergedAssets;
  }, [assetApiSearch.query, assetApiSearch.results, catalogAssets, categoryAssets, localSearchAssets, normalizedSearch, searchTerm]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setAssetApiSearch({
        query: "",
        results: [],
        status: "idle"
      });
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setAssetApiSearch((current) => ({
        query,
        results: current.query === query ? current.results : [],
        status: "loading"
      }));

      try {
        const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Asset search failed: ${response.status}`);

        const payload = await response.json();
        if (payload?.ok === false) throw new Error(payload.message ?? "Asset search failed");

        setAssetApiSearch({
          query,
          results: getAssetApiResults(payload).filter((asset) => asset?.id),
          status: "ready"
        });
      } catch (error) {
        if (error?.name === "AbortError") return;
        setAssetApiSearch({
          query,
          results: [],
          status: "offline"
        });
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchTerm]);

  const categoryCounts = useMemo(
    () =>
      STUDIO_CATALOG_CATEGORIES.reduce((counts, category) => {
        counts[category.id] = sourceAssets.filter((asset) => asset.categoryId === category.id).length;
        return counts;
      }, {}),
    [sourceAssets]
  );
  const categorySummaries = useMemo(
    () =>
      STUDIO_CATALOG_CATEGORIES.reduce((summaries, category) => {
        const summaryAssets = sourceAssets.filter((asset) => asset.categoryId === category.id);
        summaries[category.id] = {
          count: summaryAssets.length,
          policyBadge: getCategoryPlacementBadgeSummary(summaryAssets),
          policySummary: getCategoryPlacementSummary(summaryAssets)
        };
        return summaries;
      }, {}),
    [sourceAssets]
  );
  const sourceCounts = useMemo(
    () =>
      CATALOG_SOURCE_TABS.reduce((counts, source) => {
        counts[source.id] = source.id === "all"
          ? catalogAssets.length
          : catalogAssets.filter((asset) => matchesCatalogSource(asset, source.id)).length;
        return counts;
      }, {}),
    [catalogAssets]
  );
  const recentAssets = useMemo(
    () =>
      recentAssetIds
        .map((assetId) => catalogAssets.find((asset) => asset.id === assetId))
        .filter((asset) => asset && matchesCatalogSource(asset, sourceFilter))
        .slice(0, 6),
    [catalogAssets, recentAssetIds, sourceFilter]
  );
  const [hoveredCategoryId, setHoveredCategoryId] = useState(null);
  const activeCategory = useMemo(
    () =>
      STUDIO_CATALOG_CATEGORIES.find((category) => category.id === activeCategoryId) ??
      STUDIO_CATALOG_CATEGORIES[0],
    [activeCategoryId]
  );
  const hoveredCategory = useMemo(
    () => STUDIO_CATALOG_CATEGORIES.find((category) => category.id === hoveredCategoryId),
    [hoveredCategoryId]
  );
  const categoryReadout = hoveredCategory?.label ?? activeCategory?.label ?? "자산";
  const categoryReadoutCount = hoveredCategory
    ? categoryCounts[hoveredCategory.id] ?? 0
    : categoryAssets.length;
  const categoryReadoutPolicy = hoveredCategory
    ? categorySummaries[hoveredCategory.id]?.policyBadge ?? "asset"
    : categorySummaries[activeCategory?.id]?.policyBadge ?? "asset";
  const crumbLabel = normalizedSearch ? "전체 검색" : activeCategory?.label ?? "자산";
  const categoryPolicySummary = useMemo(() => getCategoryPlacementSummary(categoryAssets), [categoryAssets]);
  const activeCategoryPolicyBadge = categorySummaries[activeCategory?.id]?.policyBadge ?? "asset";
  const showAssetApiOffline =
    normalizedSearch.length >= 2 && assetApiSearch.query === searchTerm.trim() && assetApiSearch.status === "offline";

  return (
    <section
      className={`studio-asset-catalog${collapsed ? " is-collapsed" : ""}`}
      aria-label="자산 카탈로그"
      aria-expanded={!collapsed}
      data-collapsed={collapsed ? "true" : "false"}
      onDragOver={(event) => event.stopPropagation()}
      onDrop={(event) => event.stopPropagation()}
    >
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
            <strong>{categoryReadout}</strong>
            <span className="studio-catalog-readout-count">{categoryReadoutCount}</span>
            <em>{categoryReadoutPolicy}</em>
          </div>
        </div>
        <div className="studio-catalog-categories" aria-label="자산 카테고리">
          {STUDIO_CATALOG_CATEGORIES.map((category) => {
            const isActiveCategory = category.id === activeCategoryId;
            const categoryCount = categoryCounts[category.id] ?? 0;
            const categorySummary = categorySummaries[category.id] ?? { policyBadge: "asset", policySummary: "asset" };
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
                  onCategoryChange(category.id);
                }}
                onBlur={() => setHoveredCategoryId(null)}
                onFocus={() => setHoveredCategoryId(category.id)}
                onMouseEnter={() => setHoveredCategoryId(category.id)}
                onMouseLeave={() => setHoveredCategoryId(null)}
                title={`${category.label} · ${categoryCount}개 · ${categorySummary.policySummary}`}
                type="button"
              >
                {category.iconSrc ? <img alt="" draggable="false" src={category.iconSrc} /> : <category.icon size={18} />}
                <span className="studio-catalog-category-count" aria-hidden="true">{categoryCount}</span>
                <span className="studio-catalog-category-policy" aria-hidden="true">{categorySummary.policyBadge}</span>
              </button>
            );
          })}
        </div>
      </div>

      {collapsed ? null : (
        <div className="studio-catalog-browser">
          <div className="studio-catalog-browser-bar">
            <div className="studio-catalog-context-header studio-catalog-crumb" aria-live="polite">
              <div className="studio-catalog-context-title">
                <strong>{crumbLabel}</strong>
                <span>{assets.length} items</span>
              </div>
              <div className="studio-catalog-policy-row" aria-label={`배치 정책 ${categoryPolicySummary}`}>
                <span className="studio-catalog-policy-count">{assets.length} assets</span>
                <span className="studio-catalog-policy-badge">{activeCategoryPolicyBadge}</span>
                <span className="studio-catalog-policy-summary">{categoryPolicySummary}</span>
              </div>
            </div>
            <label className="studio-catalog-search">
              <Search size={15} />
              <input
                aria-label="자산 검색"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="자산 검색"
                type="search"
                value={searchTerm}
              />
              {showAssetApiOffline ? (
                <span className="studio-catalog-asset-api-status" role="status">
                  asset API offline
                </span>
              ) : null}
            </label>
            <StudioAssetGenerationControls
              generationStatus={generationStatus}
              onAssetPick={onAssetPick}
              onDragAssetStart={onDragAssetStart}
              onGenerateAsset={onGenerateAsset}
              onGenerateSceneFromBrief={onGenerateSceneFromBrief}
              onSourceFilterChange={setSourceFilter}
              searchTerm={searchTerm}
            />
            <StudioAssetCatalogSourceTabs
              onSourceFilterChange={setSourceFilter}
              sourceCounts={sourceCounts}
              sourceFilter={sourceFilter}
            />
            <StudioAssetRecentStrip onAssetPick={onAssetPick} recentAssets={recentAssets} />
          </div>

          <div className="studio-catalog-assets" aria-label="카테고리 자산">
            {assets.map((asset) => {
              const category = STUDIO_CATALOG_CATEGORIES.find((item) => item.id === asset.categoryId);
              return (
                <StudioAssetCatalogCard
                  asset={asset}
                  categoryLabel={category?.label}
                  isActive={asset.id === activeAssetId}
                  key={asset.id}
                  onAssetPick={onAssetPick}
                  onDragAssetStart={onDragAssetStart}
                  searchActive={Boolean(normalizedSearch)}
                />
              );
            })}
          </div>
        </div>
      )}
      {collapsed ? null : (
        <button
          aria-label="카탈로그 너비 조절"
          className="studio-catalog-resize-handle"
          onPointerDown={onResizeStart}
          title="카탈로그 너비 조절"
          type="button"
        />
      )}
    </section>
  );
}
