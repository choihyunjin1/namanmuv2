import React, { useEffect, useMemo, useState } from "react";
import { Clock3, Search, WandSparkles } from "lucide-react";
import { getAssetTaxonomy } from "./assetTaxonomyRules.js";
import { getAllowedHostKinds } from "./hostEligibilityRules.js";
import {
  STUDIO_CATALOG_ASSETS,
  STUDIO_CATALOG_CATEGORIES,
  getCatalogAssetsByCategory
} from "./studioCatalog.js";
import { EDITOR_GRID } from "./editorDefaults.js";

const PASCAL_ICON_BASE = "/assets/pascal-icons";
const STUDIO_CATALOG_HOME_ICON_SRC = `${PASCAL_ICON_BASE}/build.webp`;
const PLACEMENT_POLICY_LABELS = {
  "draw-room": "room-draw",
  "draw-wall": "wall-draw",
  "floor-structural": "floor-free",
  "floor-stair": "stair-place",
  "roof-accessory": "roof-feature",
  "roof-attached": "roof-place",
  "wall-attached": "wall-attach",
  "wall-opening": "wall-opening"
};
const PLACEMENT_POLICY_BADGE_LABELS = {
  "draw-room": "room",
  "draw-wall": "wall",
  "floor-structural": "floor",
  "floor-stair": "stair",
  "roof-accessory": "roof+",
  "roof-attached": "roof",
  "wall-attached": "attach",
  "wall-opening": "open"
};
const HOST_KIND_LABELS = {
  floor: "floor",
  room: "room",
  roof: "roof",
  "structural-wall": "wall",
  unknown: "unknown"
};
const ASSET_STATUS_LABELS = {
  "coming-soon": "soon",
  partial: "partial",
  ready: "ready"
};
const PREVIEW_QUALITY_LABELS = {
  bim: "BIM",
  component: "component",
  generated: "generated",
  planned: "planned",
  proxy: "proxy"
};
const PLACEMENT_COPY_LABELS = {
  "draw-room": "방 그리기",
  "draw-wall": "벽 그리기",
  "floor-free": "바닥 자유 배치",
  "floor-stair": "계단 배치",
  "floor-structural": "구조 배치",
  "roof-accessory": "지붕 부착",
  "roof-attached": "방 상단 부착",
  "wall-attached": "벽 부착",
  "wall-opening": "벽 개구부"
};
const INTERACTION_VERB_LABELS = {
  "draw-room": "그리기",
  "draw-wall": "그리기",
  "floor-free": "드래그",
  "floor-stair": "드래그",
  "floor-structural": "드래그",
  "roof-accessory": "부착",
  "roof-attached": "부착",
  "wall-attached": "벽배치",
  "wall-opening": "개구부"
};
const PLACEMENT_HINTS = {
  "draw-room": "바닥에서 범위를 드래그해 방을 만든다",
  "draw-wall": "바닥에서 시작점과 끝점을 지정해 벽을 그린다",
  "floor-free": "바닥 또는 작업층 평면에 드래그해 배치한다",
  "floor-stair": "바닥에 배치하고 계단 방향을 조정한다",
  "floor-structural": "작업층 평면에 구조 부재로 배치한다",
  "roof-accessory": "방 위 지붕을 기준으로 부착한다",
  "roof-attached": "선택한 방 상단에 지붕을 생성한다",
  "wall-attached": "벽 위 위치를 지정해 부착한다",
  "wall-opening": "벽 위 위치를 지정해 개구부를 만든다"
};
const CATALOG_SOURCE_TABS = [
  { id: "all", label: "All" },
  { id: "pascal", label: "Pascal" },
  { id: "generated", label: "Generated" },
  { id: "mine", label: "Mine" },
  { id: "community", label: "Community" }
];
const DEFAULT_RECOMMENDATION_LIMIT = 5;
const DEFAULT_RECOMMENDATION_PARCEL = {
  areaM2: EDITOR_GRID.parcelWidth * EDITOR_GRID.parcelDepth,
  depthM: EDITOR_GRID.parcelDepth,
  maxBuildingCoverageRatio: 0.6,
  maxFloorAreaRatio: 1,
  widthM: EDITOR_GRID.parcelWidth,
  zone: "제1종일반주거지역"
};

const ASSET_PREVIEW_BY_CATEGORY = {
  column: { accent: "#ebe1c6", kind: "column", materialLabel: "support", trim: "#9f9275" },
  door: { accent: "#f0d3a2", kind: "door", materialLabel: "entry", trim: "#594435" },
  "exterior-trim": { accent: "#f5efe4", kind: "trim", materialLabel: "trim", trim: "#8f7f6b" },
  gate: { accent: "#c6b19a", kind: "gate", materialLabel: "gate", trim: "#5f5246" },
  railing: { accent: "#c9d0cc", kind: "railing", materialLabel: "rail", trim: "#66716c" },
  roof: { accent: "#e4bc76", kind: "roof", materialLabel: "roof", trim: "#6d5d49" },
  "roof-decor": { accent: "#f1d7a2", kind: "roof-decor", materialLabel: "decor", trim: "#7b6a53" },
  "roof-pattern": { accent: "#8ea8b5", kind: "roof-tile", materialLabel: "tile", trim: "#51636d" },
  "roof-trim": { accent: "#d2b589", kind: "roof-trim", materialLabel: "eave", trim: "#625341" },
  spandrel: { accent: "#f4f1e8", kind: "spandrel", materialLabel: "band", trim: "#817668" },
  "stairs-ladder": { accent: "#c8c9be", kind: "stair", materialLabel: "stair", trim: "#69716c" },
  "wall-pattern": { accent: "#c88b70", kind: "wall-finish", materialLabel: "finish", trim: "#714d40" },
  "wall-tool": { accent: "#91c9bc", kind: "wall", materialLabel: "wall", trim: "#3f7b70" },
  window: { accent: "#9cd1dc", kind: "window", materialLabel: "glass", trim: "#3b6b78" }
};

const ASSET_PREVIEW_BY_SHAPE = {
  beam: { kind: "beam", materialLabel: "linear" },
  box: { kind: "block", materialLabel: "block" },
  column: { kind: "column", materialLabel: "support" },
  door: { kind: "door", materialLabel: "entry" },
  gable: { kind: "gable-roof", materialLabel: "gable" },
  gate: { kind: "gate", materialLabel: "gate" },
  hip: { kind: "hip-roof", materialLabel: "hip" },
  ladder: { kind: "ladder", materialLabel: "ladder" },
  railing: { kind: "railing", materialLabel: "rail" },
  room: { kind: "room", materialLabel: "room" },
  shed: { kind: "shed-roof", materialLabel: "shed" },
  slab: { kind: "slab-roof", materialLabel: "flat" },
  stairs: { kind: "stair", materialLabel: "stair" },
  tile: { kind: "surface", materialLabel: "finish" },
  trim: { kind: "trim", materialLabel: "trim" },
  wall: { kind: "wall", materialLabel: "wall" },
  "wall-line": { kind: "wall-line", materialLabel: "draw" },
  window: { kind: "window", materialLabel: "glass" },
  "window-wide": { kind: "wide-window", materialLabel: "wide" }
};

function getStairCardDescriptor(asset) {
  if (asset.placementMode !== "floor-stair") return null;
  const kind = asset.stair?.kind ?? (asset.shape === "ladder" ? "ladder" : "stair");
  const layout = kind === "ladder"
    ? "ladder"
    : asset.stair?.layout ?? asset.stairType ?? (Number(asset.landingDepth ?? asset.stair?.landingDepth ?? 0) > 0 ? "landing" : "straight");
  const stepCount = Number(asset.stepCount ?? asset.stair?.stepCount ?? 0);
  const landingDepth = Number(asset.landingDepth ?? asset.stair?.landingDepth ?? 0);
  const layoutLabel = kind === "ladder" ? "ladder" : layout === "landing" ? "landing" : "straight";
  const stepLabel = stepCount > 0 ? `${stepCount} ${kind === "ladder" ? "rungs" : "steps"}` : null;
  const landingLabel = kind !== "ladder" && landingDepth > 0 ? `${landingDepth}m landing` : null;
  const runLabel = Number.isFinite(Number(asset.stairRun)) ? `${asset.stairRun}m run` : null;

  return {
    badgeLabel: stepCount > 0 ? `${kind === "ladder" ? "ladder" : "stair"} ${stepCount}` : layoutLabel,
    materialLabel: asset.previewMaterialLabel ?? layoutLabel,
    metaLabel: [stepLabel, landingLabel ?? runLabel].filter(Boolean).join(" · ")
  };
}

function getAssetPreviewMeta(asset) {
  const categoryPreview = ASSET_PREVIEW_BY_CATEGORY[asset.categoryId] ?? {};
  const shapePreview = ASSET_PREVIEW_BY_SHAPE[asset.shape] ?? {};
  const stairPreview = getStairCardDescriptor(asset);
  return {
    accent: asset.previewAccent ?? categoryPreview.accent ?? asset.color ?? "#d8f36a",
    kind: asset.previewKind ?? shapePreview.kind ?? categoryPreview.kind ?? "asset",
    materialLabel: asset.previewMaterialLabel ?? stairPreview?.materialLabel ?? shapePreview.materialLabel ?? categoryPreview.materialLabel ?? "asset",
    swatch: asset.previewSwatch ?? asset.color ?? categoryPreview.accent ?? "#d8f36a",
    thumbnailSrc: asset.thumbnailSrc ?? null,
    trim: asset.previewTrim ?? categoryPreview.trim ?? "#ffffff"
  };
}

function getAssetSourceId(asset) {
  return asset.sourceId ?? asset.librarySource ?? asset.source ?? "pascal";
}

function matchesCatalogSource(asset, sourceId) {
  return sourceId === "all" || getAssetSourceId(asset) === sourceId;
}

function CatalogPreview({ asset, badgeLabel, iconSrc, shape }) {
  const preview = getAssetPreviewMeta(asset);
  const previewStyle = {
    "--asset-accent": preview.accent,
    "--asset-swatch": preview.swatch,
    "--asset-trim": preview.trim
  };

  return (
    <div
      className={`studio-catalog-preview has-asset-preview is-${shape} is-preview-${preview.kind}`}
      data-badge={badgeLabel}
      data-preview-kind={preview.kind}
      style={previewStyle}
    >
      {preview.thumbnailSrc ? <img alt="" className="studio-catalog-preview-thumb" draggable="false" src={preview.thumbnailSrc} /> : null}
      <span className="studio-catalog-preview-scene" aria-hidden="true">
        <span className="studio-catalog-preview-ground" />
        <span className="studio-catalog-preview-primitive" />
      </span>
      {iconSrc ? <img alt="" className="studio-catalog-preview-icon" draggable="false" src={iconSrc} /> : null}
      <span className="studio-catalog-preview-swatches" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="studio-catalog-preview-kind">{preview.materialLabel}</span>
    </div>
  );
}

function getPlacementLabel(asset) {
  if (asset.placementMode === "draw-wall") return "벽";
  if (asset.placementMode === "draw-room") return "방";
  if (asset.placementMode === "wall-opening") return "개구부";
  if (asset.placementMode === "wall-attached") return "벽부착";
  if (asset.placementMode === "roof-attached") return "지붕";
  if (asset.placementMode === "roof-accessory") return "장식";
  if (asset.placementMode === "floor-structural") return "구조";
  if (asset.placementMode === "floor-stair") return "계단";
  return "자산";
}

function getPlacementBadgeLabel(asset) {
  if (asset.placementMode === "draw-wall") return "draw";
  if (asset.placementMode === "draw-room") return "room";
  if (asset.placementMode === "wall-opening") return "opening";
  if (asset.placementMode === "wall-attached") return "wall";
  if (asset.placementMode === "roof-attached" || asset.placementMode === "roof-accessory") return "roof";
  if (asset.placementMode === "floor-structural") return "floor";
  if (asset.placementMode === "floor-stair") return getStairCardDescriptor(asset)?.badgeLabel ?? "stair";
  if (asset.shape === "room") return "room";
  return "asset";
}

function getPlacementPolicyLabel(asset) {
  return PLACEMENT_POLICY_LABELS[asset.placementMode] ?? (asset.placementMode ? "place" : "asset");
}

function getReadablePlacementLabel(asset) {
  return asset.placementTitle ?? PLACEMENT_COPY_LABELS[asset.placementMode] ?? getPlacementPolicyLabel(asset);
}

function getInteractionVerb(asset, isDrawTool = false) {
  if (asset.interactionVerb) return asset.interactionVerb;
  if (isDrawTool) return "그리기";
  return INTERACTION_VERB_LABELS[asset.placementMode] ?? "드래그";
}

function getPlacementHint(asset) {
  if (asset.placementHint) return asset.placementHint;
  if (asset.attachmentTarget === "stair") return "계단 선택 후 난간 부착 정책으로 확장 예정";
  return PLACEMENT_HINTS[asset.placementMode] ?? "에디터 씬에 배치한다";
}

function getAssetStatus(asset) {
  if (asset.status) return asset.status;
  if (asset.attachmentTarget === "stair") return "partial";
  return "ready";
}

function getAssetStatusLabel(asset) {
  return ASSET_STATUS_LABELS[getAssetStatus(asset)] ?? "ready";
}

function getPreviewQuality(asset) {
  if (asset.previewQuality) return asset.previewQuality;
  if (asset.categoryId === "stairs-ladder" || asset.categoryId === "roof") return "component";
  if (asset.status === "coming-soon") return "planned";
  return "proxy";
}

function getPreviewQualityLabel(asset) {
  return PREVIEW_QUALITY_LABELS[getPreviewQuality(asset)] ?? "proxy";
}

function getCategoryPlacementSummary(assets) {
  const policies = [...new Set(assets.map(getPlacementPolicyLabel))].filter(Boolean);
  if (!policies.length) return "asset";
  if (policies.length <= 3) return policies.join(" / ");
  return `${policies.slice(0, 2).join(" / ")} +${policies.length - 2}`;
}

function getCategoryPlacementBadgeSummary(assets) {
  const policies = [...new Set(assets.map((asset) => PLACEMENT_POLICY_BADGE_LABELS[asset.placementMode] ?? getPlacementPolicyLabel(asset)))].filter(Boolean);
  if (!policies.length) return "asset";
  if (policies.length === 1) return policies[0];
  if (policies.length === 2) return policies.join("+");
  return `${policies[0]}+${policies.length - 1}`;
}

function getAssetMetaLabel(asset) {
  if (asset.placementMode === "floor-stair") return getStairCardDescriptor(asset)?.metaLabel || "stair";
  if (asset.openingSize) return `${asset.openingSize[0]}x${asset.openingSize[1]}m`;
  if (asset.attachmentSize) return `${asset.attachmentSize[0]}x${asset.attachmentSize[1]}m`;
  if (asset.size) return `${asset.size[0]}x${asset.size[2] ?? asset.size[1]}m`;
  return "custom";
}

function getAssetHostLabel(asset) {
  const hosts = getAllowedHostKinds(asset).map((hostKind) => HOST_KIND_LABELS[hostKind] ?? hostKind);
  if (!hosts.length) return "free";
  if (hosts.length === 1) return `${hosts[0]} host`;
  return `${hosts.join("/")} host`;
}

function getAssetTaxonomyLabel(asset) {
  const taxonomy = getAssetTaxonomy(asset);
  return `${taxonomy.phase}/${taxonomy.system}`;
}

function getAssetIconSrc(asset) {
  if (asset.iconSrc) return asset.iconSrc;
  if (asset.categoryId === "roof" || asset.categoryId === "roof-decor" || asset.categoryId === "roof-trim") {
    return `${PASCAL_ICON_BASE}/roof.webp`;
  }
  if (asset.categoryId === "roof-pattern" || asset.categoryId === "wall-pattern") return `${PASCAL_ICON_BASE}/paint.webp`;
  if (asset.categoryId === "wall-tool") {
    if (asset.placementMode === "draw-room" || asset.shape === "room") return `${PASCAL_ICON_BASE}/custom-room.webp`;
    if (asset.id === "test-basement") return `${PASCAL_ICON_BASE}/floor.webp`;
    return `${PASCAL_ICON_BASE}/wall.webp`;
  }
  if (asset.categoryId === "door") return `${PASCAL_ICON_BASE}/door.webp`;
  if (asset.categoryId === "window") return `${PASCAL_ICON_BASE}/window.webp`;
  if (asset.categoryId === "exterior-trim" || asset.categoryId === "spandrel") return `${PASCAL_ICON_BASE}/wallcut.webp`;
  if (asset.categoryId === "column") return `${PASCAL_ICON_BASE}/column.webp`;
  if (asset.categoryId === "gate" || asset.categoryId === "railing") return `${PASCAL_ICON_BASE}/fence.webp`;
  if (asset.categoryId === "stairs-ladder") return `${PASCAL_ICON_BASE}/stairs.webp`;
  return `${PASCAL_ICON_BASE}/cube.webp`;
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

function getAssetRecommendations(payload) {
  const recommendations = Array.isArray(payload?.data?.recommendations)
    ? payload.data.recommendations
    : Array.isArray(payload?.recommendations)
      ? payload.recommendations
      : Array.isArray(payload)
        ? payload
        : [];

  return recommendations
    .map((recommendation) => {
      const asset = recommendation?.asset ?? recommendation;
      if (!asset?.id) return null;

      return {
        asset,
        fit: recommendation?.fit ?? null,
        reasons: Array.isArray(recommendation?.reasons) ? recommendation.reasons : [],
        score: Number.isFinite(Number(recommendation?.score)) ? Number(recommendation.score) : null
      };
    })
    .filter(Boolean);
}

function getAssetDedupKey(asset) {
  return asset?.assetSourceId ?? asset?.metadata?.sourceAssetId ?? asset?.id ?? "";
}

function getRecommendationScoreLabel(score) {
  if (!Number.isFinite(score)) return null;
  return `score ${Number(score.toFixed(2))}`;
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
  const [generationPrompt, setGenerationPrompt] = useState("");
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
  const canGenerateAsset = Boolean(onGenerateAsset) && generationPrompt.trim().length > 0 && generationStatus?.state !== "loading";
  const canGenerateBriefScene = Boolean(onGenerateSceneFromBrief) && generationPrompt.trim().length > 0 && generationStatus?.state !== "loading";
  const recommendationPrompt = generationPrompt.trim() || searchTerm.trim();
  const recommendationParcelLabel = `${DEFAULT_RECOMMENDATION_PARCEL.zone} · ${DEFAULT_RECOMMENDATION_PARCEL.widthM}x${DEFAULT_RECOMMENDATION_PARCEL.depthM}m · BCR ${Math.round(DEFAULT_RECOMMENDATION_PARCEL.maxBuildingCoverageRatio * 100)}% · FAR ${Math.round(DEFAULT_RECOMMENDATION_PARCEL.maxFloorAreaRatio * 100)}%`;
  const recommendationStatusLabel = assetRecommendation.status === "loading"
    ? "프롬프트/토지조건 기반 추천 중"
    : assetRecommendation.status === "ready"
      ? `${assetRecommendation.recommendations.length}개 추천 · 프롬프트/토지조건 기반`
      : assetRecommendation.status === "empty"
        ? "추천 결과 없음 · 기존 카탈로그 사용 가능"
        : assetRecommendation.status === "offline"
          ? "추천 API offline · 기존 카탈로그 사용 가능"
          : "프롬프트/토지조건 기반 추천";
  const canRecommendAssets = recommendationPrompt.length > 0 && assetRecommendation.status !== "loading";

  const handleGenerateSubmit = async (event) => {
    event.preventDefault();
    const prompt = generationPrompt.trim();
    if (!prompt || !onGenerateAsset) return;
    const result = await onGenerateAsset(prompt);
    if (result?.ok !== false) {
      setGenerationPrompt("");
      setSourceFilter("generated");
    }
  };

  const handleGenerateBriefScene = async () => {
    const prompt = generationPrompt.trim();
    if (!prompt || !onGenerateSceneFromBrief) return;
    const result = await onGenerateSceneFromBrief(prompt);
    if (result?.ok !== false) {
      setGenerationPrompt("");
      setSourceFilter("all");
    }
  };

  const handleRecommendAssets = async () => {
    const prompt = recommendationPrompt;
    if (!prompt) return;

    setAssetRecommendation({
      message: "",
      prompt,
      recommendations: [],
      status: "loading"
    });

    try {
      const response = await fetch("/api/assets/recommend", {
        body: JSON.stringify({
          limit: DEFAULT_RECOMMENDATION_LIMIT,
          parcel: DEFAULT_RECOMMENDATION_PARCEL,
          prompt
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      if (!response.ok) throw new Error(`Asset recommendation failed: ${response.status}`);

      const payload = await response.json();
      if (payload?.ok === false) throw new Error(payload.message ?? "Asset recommendation failed");

      const recommendations = getAssetRecommendations(payload);
      setAssetRecommendation({
        message: payload?.data?.rationale?.summary ?? "",
        prompt,
        recommendations,
        status: recommendations.length ? "ready" : "empty"
      });
    } catch (error) {
      setAssetRecommendation({
        message: error?.message ?? "추천 자산을 불러오지 못했습니다.",
        prompt,
        recommendations: [],
        status: "offline"
      });
    }
  };

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
            <form className="studio-catalog-generator" onSubmit={handleGenerateSubmit}>
              <label>
                <WandSparkles size={14} />
                <input
                  aria-label="자연어 3D 자산 생성"
                  onChange={(event) => setGenerationPrompt(event.target.value)}
                  placeholder="자연어로 CAD 초안 생성"
                  type="text"
                  value={generationPrompt}
                />
              </label>
              <button disabled={!canGenerateAsset} type="submit">
                {generationStatus?.state === "loading" ? "생성중" : "Generate"}
              </button>
              <button disabled={!canGenerateBriefScene} onClick={handleGenerateBriefScene} type="button">
                집 초안
              </button>
              {generationStatus?.message ? <span>{generationStatus.message}</span> : null}
            </form>
            <div
              className="studio-catalog-recent studio-catalog-recommendations"
              aria-label="프롬프트와 토지조건 기반 추천 자산"
              data-state={assetRecommendation.status}
              title={`프롬프트: ${recommendationPrompt || "입력 필요"} · 토지조건: ${recommendationParcelLabel}`}
            >
              <WandSparkles size={14} />
              <button disabled={!canRecommendAssets} onClick={handleRecommendAssets} type="button">
                {assetRecommendation.status === "loading" ? "추천중" : "추천"}
              </button>
              <span role="status">
                {recommendationStatusLabel}
              </span>
              {assetRecommendation.recommendations.map((recommendation) => {
                const { asset } = recommendation;
                const reason = recommendation.reasons[0];
                const scoreLabel = getRecommendationScoreLabel(recommendation.score);
                return (
                  <button
                    className="studio-catalog-recommendation-result"
                    draggable
                    key={asset.id}
                    onClick={() => onAssetPick(asset)}
                    onDragEnd={() => onDragAssetStart(null)}
                    onDragStart={(event) => {
                      onAssetPick(asset.placementMode ? asset : null);
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("application/x-ploton-asset", asset.id);
                      onDragAssetStart(asset);
                    }}
                    title={[
                      asset.label ?? asset.id,
                      scoreLabel,
                      reason,
                      assetRecommendation.prompt ? `prompt: ${assetRecommendation.prompt}` : null,
                      `parcel: ${recommendationParcelLabel}`
                    ].filter(Boolean).join(" · ")}
                    type="button"
                  >
                    {asset.label ?? asset.id}
                  </button>
                );
              })}
            </div>
            <div className="studio-catalog-source-tabs" aria-label="자산 소스">
              {CATALOG_SOURCE_TABS.map((source) => (
                <button
                  aria-pressed={sourceFilter === source.id}
                  className={sourceFilter === source.id ? "is-active" : ""}
                  key={source.id}
                  onClick={() => setSourceFilter(source.id)}
                  title={`${source.label} · ${sourceCounts[source.id] ?? 0} assets`}
                  type="button"
                >
                  <span>{source.label}</span>
                  <em>{sourceCounts[source.id] ?? 0}</em>
                </button>
              ))}
            </div>
            {recentAssets.length ? (
              <div className="studio-catalog-recent" aria-label="최근 사용 자산">
                <Clock3 size={14} />
                {recentAssets.map((asset) => (
                  <button key={asset.id} onClick={() => onAssetPick(asset)} title={asset.label} type="button">
                    {asset.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="studio-catalog-assets" aria-label="카테고리 자산">
            {assets.map((asset) => {
              const isDrawTool = ["draw-room", "draw-wall"].includes(asset.placementMode);
              const isPlacementTool = Boolean(asset.placementMode);
              const isActive = asset.id === activeAssetId;
              const category = STUDIO_CATALOG_CATEGORIES.find((item) => item.id === asset.categoryId);
              const placementLabel = getPlacementLabel(asset);
              const placementBadgeLabel = getPlacementBadgeLabel(asset);
              const placementPolicyLabel = getReadablePlacementLabel(asset);
              const placementHint = getPlacementHint(asset);
              const sizeLabel = getAssetMetaLabel(asset);
              const hostLabel = getAssetHostLabel(asset);
              const taxonomyLabel = getAssetTaxonomyLabel(asset);
              const previewMeta = getAssetPreviewMeta(asset);
              const assetStatus = getAssetStatus(asset);
              const assetStatusLabel = getAssetStatusLabel(asset);
              const interactionVerb = getInteractionVerb(asset, isDrawTool);
              const previewQuality = getPreviewQuality(asset);
              const previewQualityLabel = getPreviewQualityLabel(asset);
              const isComingSoon = assetStatus === "coming-soon";
              const metaLabel = normalizedSearch ? category?.label ?? sizeLabel : sizeLabel;
              return (
                <button
                  aria-disabled={isComingSoon ? "true" : undefined}
                  aria-label={`${asset.label}, ${assetStatusLabel}, ${previewQualityLabel}, ${placementBadgeLabel}, ${previewMeta.materialLabel}, ${sizeLabel}, ${hostLabel}, ${taxonomyLabel}, ${placementHint}`}
                  aria-pressed={isActive}
                  className={[
                    "studio-catalog-asset-card",
                    isPlacementTool ? "is-tool" : "",
                    isDrawTool ? "is-draw-tool" : "is-draggable",
                    assetStatus ? `is-status-${assetStatus}` : "",
                    previewQuality ? `is-quality-${previewQuality}` : "",
                    isActive ? "is-active" : ""
                  ].filter(Boolean).join(" ")}
                  data-action={isDrawTool ? "click-tool" : "drag-asset"}
                  data-action-label={interactionVerb}
                  data-badge={placementBadgeLabel}
                  data-disabled-reason={isComingSoon ? asset.disabledReason ?? "후속 구현 예정" : undefined}
                  data-meta={sizeLabel}
                  data-placement={placementLabel}
                  data-policy={hostLabel}
                  data-preview-kind={previewMeta.kind}
                  data-preview-quality={previewQuality}
                  data-status={assetStatus}
                  data-swatch={previewMeta.swatch}
                  disabled={isComingSoon}
                  draggable={!isDrawTool && !isComingSoon}
                  key={asset.id}
                  onClick={() => {
                    if (isComingSoon) return;
                    onAssetPick(asset);
                  }}
                  onDragStart={(event) => {
                    if (isComingSoon) {
                      event.preventDefault();
                      return;
                    }
                    if (isDrawTool) {
                      event.preventDefault();
                      onAssetPick(asset);
                      return;
                    }
                    onAssetPick(asset.placementMode ? asset : null);
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/x-ploton-asset", asset.id);
                    onDragAssetStart(asset);
                  }}
                  onDragEnd={() => onDragAssetStart(null)}
                  title={`${asset.label} · ${assetStatusLabel} · ${previewQualityLabel} · ${placementBadgeLabel} · ${sizeLabel} · ${hostLabel} · ${taxonomyLabel} · ${placementPolicyLabel} · ${placementHint}`}
                  type="button"
                >
                  <span className="studio-catalog-asset-mode">{placementBadgeLabel}</span>
                  <CatalogPreview asset={asset} badgeLabel={placementBadgeLabel} iconSrc={getAssetIconSrc(asset)} shape={asset.shape} />
                  <span className="studio-catalog-asset-content">
                    <span className="studio-catalog-asset-title">{asset.label}</span>
                    <span className="studio-catalog-asset-status-row">
                      <small>{assetStatusLabel}</small>
                      <em>{previewQualityLabel}</em>
                      <strong>{interactionVerb}</strong>
                    </span>
                    <span className="studio-catalog-asset-material">
                      <i style={{ "--asset-swatch": previewMeta.swatch }} />
                      <span>{previewMeta.materialLabel}</span>
                    </span>
                    <span className="studio-catalog-asset-meta-row">
                      <small>{metaLabel}</small>
                      <em>{hostLabel}</em>
                    </span>
                    <span className="studio-catalog-asset-meta-row is-taxonomy">
                      <small>{taxonomyLabel}</small>
                      <em>{placementPolicyLabel}</em>
                    </span>
                  </span>
                </button>
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
