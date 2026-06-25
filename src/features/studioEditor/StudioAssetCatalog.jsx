import React, { useEffect, useMemo, useState } from "react";
import {
  STUDIO_CATALOG_ASSETS,
  STUDIO_CATALOG_CATEGORIES,
  getCatalogAssetsByCategory
} from "./studioCatalog.js";
import { StudioAssetAiLeadingTile } from "./StudioAssetAiLeadingTile.jsx";
import { StudioAssetCatalogCard } from "./StudioAssetCatalogCard.jsx";
import { StudioAssetCategoryRail } from "./StudioAssetCategoryRail.jsx";
import { StudioAssetCatalogSearchHeader } from "./StudioAssetCatalogSearchHeader.jsx";
import { StudioAssetGenerationControls } from "./StudioAssetGenerationControls.jsx";
import { CATALOG_SOURCE_TABS, StudioAssetCatalogSourceTabs } from "./StudioAssetCatalogSourceTabs.jsx";
import { StudioAssetRecentStrip } from "./StudioAssetRecentStrip.jsx";
import {
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

function getRecommendationScoreLabel(score) {
  const number = Number(score);
  if (!Number.isFinite(number)) return null;
  return `score ${Number(number.toFixed(2))}`;
}

function getRecommendedCatalogAssets(recommendation) {
  if (recommendation?.status !== "ready" || !Array.isArray(recommendation.recommendations)) return [];

  const seen = new Set();
  return recommendation.recommendations
    .map((item) => {
      const asset = item?.asset;
      const dedupKey = getAssetDedupKey(asset);
      if (!asset?.id || !dedupKey || seen.has(dedupKey)) return null;
      seen.add(dedupKey);

      return {
        ...asset,
        recommendationPrompt: recommendation.prompt ?? "",
        recommendationReason: Array.isArray(item.reasons) ? item.reasons[0] ?? "" : "",
        recommendationScore: Number.isFinite(Number(item.score)) ? Number(item.score) : null,
        recommendationScoreLabel: getRecommendationScoreLabel(item.score),
        status: asset.status ?? "ready"
      };
    })
    .filter(Boolean);
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
  const [assetRecommendation, setAssetRecommendation] = useState({
    message: "",
    prompt: "",
    recommendations: [],
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
  const recommendedAssets = useMemo(
    () => getRecommendedCatalogAssets(assetRecommendation),
    [assetRecommendation]
  );
  const recommendedAssetKeys = useMemo(
    () => new Set(recommendedAssets.map(getAssetDedupKey).filter(Boolean)),
    [recommendedAssets]
  );
  const visibleAssets = useMemo(
    () => assets.filter((asset) => !recommendedAssetKeys.has(getAssetDedupKey(asset))),
    [assets, recommendedAssetKeys]
  );

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
  const activeCategory = useMemo(
    () =>
      STUDIO_CATALOG_CATEGORIES.find((category) => category.id === activeCategoryId) ??
      STUDIO_CATALOG_CATEGORIES[0],
    [activeCategoryId]
  );
  const crumbLabel = normalizedSearch ? "전체 검색" : activeCategory?.label ?? "자산";
  const categoryPolicySummary = useMemo(() => getCategoryPlacementSummary(categoryAssets), [categoryAssets]);
  const activeCategoryPolicyBadge = categorySummaries[activeCategory?.id]?.policyBadge ?? "asset";
  const showAssetApiOffline =
    normalizedSearch.length >= 2 && assetApiSearch.query === searchTerm.trim() && assetApiSearch.status === "offline";
  const visibleAssetCount = visibleAssets.length + recommendedAssets.length;

  return (
    <section
      className={`studio-asset-catalog${collapsed ? " is-collapsed" : ""}`}
      aria-label="자산 카탈로그"
      aria-expanded={!collapsed}
      data-collapsed={collapsed ? "true" : "false"}
      onDragOver={(event) => event.stopPropagation()}
      onDrop={(event) => event.stopPropagation()}
    >
      <StudioAssetCategoryRail
        activeCategoryId={activeCategoryId}
        categories={STUDIO_CATALOG_CATEGORIES}
        categoryCounts={categoryCounts}
        categorySummaries={categorySummaries}
        collapsed={collapsed}
        onCategoryChange={onCategoryChange}
        onCollapseToggle={onCollapseToggle}
      />

      {collapsed ? null : (
        <div className="studio-catalog-browser">
          <div className="studio-catalog-browser-bar">
            <StudioAssetCatalogSearchHeader
              activeCategoryPolicyBadge={activeCategoryPolicyBadge}
              assetCount={visibleAssetCount}
              categoryPolicySummary={categoryPolicySummary}
              crumbLabel={crumbLabel}
              onSearchTermChange={setSearchTerm}
              searchTerm={searchTerm}
              showAssetApiOffline={showAssetApiOffline}
            />
            <StudioAssetGenerationControls
              generationStatus={generationStatus}
              onAssetPick={onAssetPick}
              onDragAssetStart={onDragAssetStart}
              onGenerateAsset={onGenerateAsset}
              onGenerateSceneFromBrief={onGenerateSceneFromBrief}
              onRecommendationChange={setAssetRecommendation}
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
            <StudioAssetAiLeadingTile
              generationStatus={generationStatus}
              onGenerateSceneFromBrief={onGenerateSceneFromBrief}
              prompt={searchTerm}
            />
            {recommendedAssets.map((asset) => {
              const category = STUDIO_CATALOG_CATEGORIES.find((item) => item.id === asset.categoryId);
              return (
                <StudioAssetCatalogCard
                  asset={asset}
                  categoryLabel={category?.label}
                  isActive={asset.id === activeAssetId}
                  key={`recommendation-${asset.id}`}
                  onAssetPick={onAssetPick}
                  onDragAssetStart={onDragAssetStart}
                  searchActive
                />
              );
            })}
            {visibleAssets.map((asset) => {
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
