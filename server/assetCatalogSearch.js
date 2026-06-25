import { readFile } from "node:fs/promises";
import path from "node:path";

const MODEL_CATALOG_PATH = path.join("public", "assets", "models", "catalog.json");
const COST_CATALOG_PATH = path.join("public", "assets", "models", "cost-catalog.json");
const STUDIO_CATALOG_CATEGORY_IDS = new Set([
  "roof",
  "roof-decor",
  "roof-pattern",
  "roof-trim",
  "exterior-trim",
  "wall-tool",
  "door",
  "window",
  "wall-pattern",
  "spandrel",
  "column",
  "gate",
  "stairs-ladder",
  "railing"
]);
const FALLBACK_STUDIO_CATEGORY_ID = "wall-tool";

const CATEGORY_BY_COMPONENT_KIND = {
  beam: "exterior-trim",
  "cladding-panel": "wall-pattern",
  column: "column",
  "curtain-wall": "wall-tool",
  deck: "exterior-trim",
  door: "door",
  equipment: "roof-decor",
  fence: "railing",
  foundation: "wall-tool",
  landscape: "wall-tool",
  pergola: "exterior-trim",
  roof: "roof",
  site: "wall-tool",
  slab: "wall-tool",
  stair: "stairs-ladder",
  "wall-panel": "wall-tool",
  window: "window"
};

const CATEGORY_BY_BIM_TYPE = {
  IfcBeam: "exterior-trim",
  IfcBuildingElementProxy: "wall-tool",
  IfcColumn: "column",
  IfcCovering: "wall-pattern",
  IfcCurtainWall: "wall-tool",
  IfcDoor: "door",
  IfcEnergyConversionDevice: "roof-decor",
  IfcFooting: "wall-tool",
  IfcGeographicElement: "wall-tool",
  IfcRailing: "railing",
  IfcRoof: "roof",
  IfcSlab: "wall-tool",
  IfcSpace: "wall-tool",
  IfcStair: "stairs-ladder",
  IfcStairFlight: "stairs-ladder",
  IfcWall: "wall-tool",
  IfcWallStandardCase: "wall-tool",
  IfcWindow: "window"
};

const STUDIO_CATEGORY_ALIASES = {
  "detached-house-shell": "wall-tool",
  fence: "railing",
  "house-shell": "wall-tool",
  landscape: "wall-tool",
  "local-asset": "wall-tool",
  site: "wall-tool",
  stair: "stairs-ladder",
  stairs: "stairs-ladder"
};

const PLACEMENT_BY_COMPONENT_KIND = {
  beam: "wall-attached",
  "cladding-panel": "wall-attached",
  column: "floor-structural",
  "curtain-wall": "floor-structural",
  deck: "floor-free",
  door: "wall-opening",
  equipment: "roof-accessory",
  fence: "floor-free",
  foundation: "floor-structural",
  landscape: "floor-structural",
  pergola: "floor-free",
  roof: "roof-attached",
  site: "floor-structural",
  slab: "floor-structural",
  stair: "floor-stair",
  "wall-panel": "wall-attached",
  window: "wall-opening"
};

const SHAPE_BY_COMPONENT_KIND = {
  beam: "beam",
  "cladding-panel": "tile",
  column: "column",
  "curtain-wall": "wall",
  deck: "box",
  door: "door",
  equipment: "box",
  fence: "railing",
  foundation: "box",
  landscape: "box",
  pergola: "box",
  roof: "gable",
  site: "slab",
  slab: "box",
  "wall-panel": "wall",
  window: "window-wide"
};

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function normalizeQuery(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function queryTokens(query) {
  return normalizeText(query).split(/[\s,;/|]+/).filter(Boolean);
}

function cloneJson(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

async function readJsonFile(filePath) {
  try {
    return { ok: true, data: JSON.parse(await readFile(filePath, "utf8")) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code ?? "JSON_PARSE_ERROR",
        message: error.message
      }
    };
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeVector(values, fallback = [1, 1, 1]) {
  const source = Array.isArray(values) ? values : fallback;
  return fallback.map((fallbackValue, index) => {
    const number = finiteNumber(source[index]);
    return number && number > 0 ? Number(number.toFixed(3)) : fallbackValue;
  });
}

function firstVector(...candidates) {
  return candidates.find((candidate) =>
    Array.isArray(candidate) &&
    candidate.length >= 3 &&
    candidate.some((value) => {
      const number = finiteNumber(value);
      return number && number > 0;
    })
  );
}

function assetBoundsSize(asset, costItem) {
  const bounds = firstVector(
    asset?.assetAudit?.bounds?.dimensions,
    asset?.quality?.assetAudit?.bounds?.dimensions,
    costItem?.quantityBasis?.runtimeBoundsExtent,
    costItem?.quantityBasis?.originalSourceBoundsExtent
  );
  return normalizeVector(bounds, [1, 1, 1]);
}

function inferComponentKind(asset) {
  return asset?.componentKind ?? asset?.component?.kind ?? "";
}

function isHouseShellAsset(asset) {
  return String(asset?.type ?? "").includes("house-shell");
}

function normalizeStudioCategoryId(value, fallback = FALLBACK_STUDIO_CATEGORY_ID) {
  const categoryId = String(value ?? "").trim();
  if (STUDIO_CATALOG_CATEGORY_IDS.has(categoryId)) return categoryId;

  const alias = STUDIO_CATEGORY_ALIASES[categoryId];
  if (STUDIO_CATALOG_CATEGORY_IDS.has(alias)) return alias;

  return fallback;
}

function inferCategoryId(asset) {
  if (isHouseShellAsset(asset)) return "wall-tool";
  if (asset?.categoryId) return normalizeStudioCategoryId(asset.categoryId);
  if (asset?.category) return normalizeStudioCategoryId(asset.category);

  const componentKind = inferComponentKind(asset);
  if (CATEGORY_BY_COMPONENT_KIND[componentKind]) return normalizeStudioCategoryId(CATEGORY_BY_COMPONENT_KIND[componentKind]);
  if (CATEGORY_BY_BIM_TYPE[asset?.bimType]) return normalizeStudioCategoryId(CATEGORY_BY_BIM_TYPE[asset.bimType]);
  if (asset?.type) return normalizeStudioCategoryId(asset.type);
  return FALLBACK_STUDIO_CATEGORY_ID;
}

function inferPlacementMode(asset, categoryId = null) {
  if (asset?.placementMode) return asset.placementMode;
  if (isHouseShellAsset(asset)) return "floor-free";

  const componentKind = inferComponentKind(asset);
  if (PLACEMENT_BY_COMPONENT_KIND[componentKind]) return PLACEMENT_BY_COMPONENT_KIND[componentKind];
  if (categoryId === "wall-tool" || categoryId === "column") return "floor-structural";
  if (categoryId === "roof") return "roof-attached";
  if (categoryId === "roof-decor" || categoryId === "roof-pattern" || categoryId === "roof-trim") return "roof-accessory";
  return "floor-free";
}

function inferRoofShape(asset) {
  const text = normalizeText([asset?.id, asset?.label, ...(asset?.tags ?? [])].join(" "));
  if (text.includes("hip")) return "hip";
  if (text.includes("flat")) return "slab";
  if (text.includes("shed")) return "shed";
  return "gable";
}

function inferShape(asset) {
  if (asset?.shape) return asset.shape;

  const componentKind = inferComponentKind(asset);
  if (componentKind === "roof") return inferRoofShape(asset);
  if (SHAPE_BY_COMPONENT_KIND[componentKind]) return SHAPE_BY_COMPONENT_KIND[componentKind];
  return "box";
}

function inferPreviewQuality(asset) {
  if (asset?.previewQuality) return asset.previewQuality;
  const tags = new Set(Array.isArray(asset?.tags) ? asset.tags : []);
  if (asset?.type === "component" || tags.has("component-ready")) return "component";
  if (String(asset?.type ?? "").includes("generated") || tags.has("local-ai-generated")) return "generated";
  if (asset?.sourceType === "ifc" || asset?.bimType || tags.has("ifc-derived")) return "bim";
  return "proxy";
}

function inferPreviewMaterialLabel(asset) {
  return asset?.previewMaterialLabel || inferComponentKind(asset) || asset?.type || "asset";
}

function normalizeCostCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  return {
    source: candidate.source ?? null,
    sourceLabel: candidate.sourceLabel ?? null,
    confidence: candidate.confidence ?? null,
    purpose: candidate.purpose ?? null,
    classificationName: candidate.classificationName ?? null,
    productIdNo: candidate.productIdNo ?? null,
    name: candidate.name ?? null,
    unit: candidate.unit ?? null,
    unitPriceKrw: candidate.unitPriceKrw ?? null,
    vat: candidate.vat ?? null,
    deliveryCondition: candidate.deliveryCondition ?? null,
    noticeDate: candidate.noticeDate ?? null,
    score: candidate.score ?? null
  };
}

function summarizeCost(costItem) {
  if (!costItem || typeof costItem !== "object") return null;
  const costing = costItem.costing ?? {};
  return {
    assetId: costItem.assetId ?? null,
    family: costItem.family ?? null,
    role: costItem.role ?? null,
    costClass: costItem.costClass ?? null,
    catalogStatus: costItem.catalogStatus ?? null,
    reviewStatus: costItem.reviewStatus ?? null,
    quantityBasis: cloneJson(costItem.quantityBasis ?? null),
    primary: normalizeCostCandidate(costing.primary),
    alternatives: Array.isArray(costing.alternatives)
      ? costing.alternatives.slice(0, 3).map(normalizeCostCandidate).filter(Boolean)
      : [],
    defaultRoughCostKrw: costing.defaultRoughCostKrw ?? null,
    limitations: Array.isArray(costing.limitations) ? costing.limitations : []
  };
}

function createCostIndex(costCatalog) {
  const items = Array.isArray(costCatalog?.items) ? costCatalog.items : [];
  return new Map(items.filter((item) => item?.assetId).map((item) => [item.assetId, item]));
}

function openingSizeFromBounds(size) {
  const width = Math.max(size[0] ?? 1, size[2] ?? 0.16);
  return [Number(width.toFixed(3)), Number((size[1] ?? 1).toFixed(3))];
}

function attachmentSizeFromBounds(size) {
  return [Number((size[0] ?? 1).toFixed(3)), Number((size[1] ?? 0.3).toFixed(3))];
}

function editorPlacementFields(result, asset) {
  if (result.placementMode === "wall-opening") {
    return {
      openingSize: asset.openingSize ?? openingSizeFromBounds(result.size),
      openingType: inferComponentKind(asset) === "door" ? "door" : "window"
    };
  }

  if (result.placementMode === "wall-attached") {
    return {
      attachmentSize: asset.attachmentSize ?? attachmentSizeFromBounds(result.size),
      attachDepth: asset.attachDepth ?? Math.max(0.04, Number((result.size[2] ?? 0.08).toFixed(3)))
    };
  }

  if (result.placementMode === "floor-structural" && result.categoryId === "column") {
    return { supportKind: "column" };
  }

  if (result.placementMode === "floor-structural") {
    return {
      supportKind: "wall",
      wallHeight: result.size[1] ?? 2.7,
      wallThickness: result.size[2] ?? 0.16
    };
  }

  return {};
}

function resolveModelUrls(asset) {
  const modelUrl = asset.originalUrl ?? asset.modelUrl ?? asset.url ?? asset.optimizedUrl ?? null;
  const originalModelUrl = asset.originalUrl ?? modelUrl;
  const optimizedModelUrl = asset.optimizedUrl ?? asset.url ?? asset.modelUrl ?? modelUrl;
  return { modelUrl, optimizedModelUrl, originalModelUrl };
}

function runtimeMetadata(asset, urls) {
  const optimizedSizeBytes = finiteNumber(asset.sizeBytes ?? asset.compression?.optimizedSizeBytes);
  const originalSizeBytes = finiteNumber(asset.originalSizeBytes ?? asset.compression?.originalSizeBytes);
  const sizeBytes = urls.modelUrl === urls.originalModelUrl
    ? originalSizeBytes ?? optimizedSizeBytes
    : optimizedSizeBytes ?? originalSizeBytes;

  return {
    estimatedDownloadMb: finiteNumber(asset.performance?.estimatedDownloadMb),
    loadStrategy: asset.performance?.loadStrategy ?? asset.runtimePolicy ?? null,
    optimizedSizeBytes,
    originalSizeBytes,
    runtimeUrl: urls.modelUrl,
    sizeBytes
  };
}

export function normalizeAssetForEditor(asset, costItem = null) {
  if (!asset?.id) return null;

  const cost = summarizeCost(costItem);
  const size = asset.size ?? assetBoundsSize(asset, costItem);
  const categoryId = inferCategoryId(asset);
  const urls = resolveModelUrls(asset);
  const result = {
    id: asset.id,
    assetSourceId: asset.id,
    label: asset.label ?? asset.id,
    categoryId,
    placementMode: inferPlacementMode(asset, categoryId),
    shape: inferShape(asset),
    size,
    modelUrl: urls.modelUrl,
    optimizedModelUrl: urls.optimizedModelUrl,
    originalModelUrl: urls.originalModelUrl,
    optimizedUrl: asset.optimizedUrl ?? null,
    url: asset.url ?? null,
    thumbnailSrc: asset.thumbnailSrc ?? asset.thumbnailUrl ?? asset.thumbnail?.url ?? null,
    sourceId: asset.sourceId ?? asset.sourceType ?? "local",
    librarySource: asset.librarySource ?? "local",
    previewQuality: inferPreviewQuality(asset),
    previewMaterialLabel: inferPreviewMaterialLabel(asset),
    runtime: runtimeMetadata(asset, urls),
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    cost,
    type: asset.type ?? null,
    bimType: asset.bimType ?? null,
    componentKind: inferComponentKind(asset) || null,
    source: asset.source ?? null,
    sourceLabel: asset.source ?? asset.label ?? asset.id,
    sourceType: asset.sourceType ?? null,
    status: asset.reviewStatus ?? "unknown",
    metadata: {
      bimType: asset.bimType ?? null,
      componentKind: inferComponentKind(asset) || null,
      entityCounts: cloneJson(asset.entityCounts ?? null),
      sourceAssetId: asset.id,
      sourceLabel: asset.source ?? asset.label ?? asset.id,
      sourceType: asset.sourceType ?? null,
      technicalGrade: asset.technicalGrade ?? asset.quality?.technicalGrade ?? null,
      technicalScore: asset.technicalScore ?? asset.quality?.technicalScore ?? null
    }
  };

  return {
    ...result,
    ...editorPlacementFields(result, asset)
  };
}

function metadataText(asset, cost) {
  return JSON.stringify({
    assetAudit: asset?.assetAudit,
    bimType: asset?.bimType,
    component: asset?.component,
    concept: asset?.concept,
    cost,
    designPreset: asset?.designPreset,
    entityCounts: asset?.entityCounts,
    materialPreset: asset?.materialPreset,
    metadata: asset?.metadata,
    parcel: asset?.parcel,
    quality: asset?.quality,
    reviewStatus: asset?.reviewStatus,
    schema: asset?.schema,
    sourceEntities: asset?.sourceEntities,
    sourceProjectStats: asset?.sourceProjectStats
  });
}

function weightedSearchFields(result, asset) {
  return [
    { text: result.label, weight: 12 },
    { text: result.id, weight: 8 },
    { text: result.categoryId, weight: 8 },
    { text: asset?.category, weight: 8 },
    { text: asset?.type, weight: 7 },
    { text: result.componentKind, weight: 7 },
    { text: result.bimType, weight: 6 },
    { text: result.sourceType, weight: 5 },
    { text: result.source, weight: 4 },
    { text: result.tags.join(" "), weight: 4 },
    { text: metadataText(asset, result.cost), weight: 1 }
  ];
}

export function scoreAssetResult(result, asset, query) {
  const normalizedQuery = normalizeText(query);
  const tokens = queryTokens(query);
  if (!tokens.length) return 1;

  return weightedSearchFields(result, asset).reduce((score, field) => {
    const text = normalizeText(field.text);
    if (!text) return score;

    let nextScore = score;
    if (text === normalizedQuery) nextScore += field.weight * 5;
    else if (normalizedQuery && text.includes(normalizedQuery)) nextScore += field.weight * 3;

    const fieldTokens = new Set(text.split(/[\s,;/|_-]+/).filter(Boolean));
    for (const token of tokens) {
      if (text === token) nextScore += field.weight * 3;
      else if (fieldTokens.has(token)) nextScore += field.weight * 2;
      else if (text.includes(token)) nextScore += field.weight;
    }

    return nextScore;
  }, 0);
}

function emptyData(query) {
  return { facets: emptyFacets(), query, total: 0, results: [] };
}

function emptyFacets() {
  return {
    byCategory: {},
    byCostClass: {},
    byPreviewQuality: {},
    bySourceType: {},
    pricedCount: 0,
    topCostClasses: []
  };
}

function incrementFacet(target, key) {
  const label = key || "unknown";
  target[label] = (target[label] ?? 0) + 1;
}

function buildSearchFacets(results) {
  const facets = emptyFacets();
  for (const result of results) {
    incrementFacet(facets.byCategory, result.categoryId);
    incrementFacet(facets.byCostClass, result.cost?.costClass);
    incrementFacet(facets.byPreviewQuality, result.previewQuality);
    incrementFacet(facets.bySourceType, result.sourceType);
    if (result.cost?.primary?.unitPriceKrw || result.cost?.defaultRoughCostKrw) facets.pricedCount += 1;
  }
  facets.topCostClasses = Object.entries(facets.byCostClass)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "ko-KR"))
    .slice(0, 5)
    .map(([costClass, count]) => ({ costClass, count }));
  return facets;
}

export async function searchAssetCatalog(rawQuery = "", options = {}) {
  const query = normalizeQuery(rawQuery);
  const rootDir = options.rootDir ?? process.cwd();
  const catalogPath = options.catalogPath ?? path.resolve(rootDir, MODEL_CATALOG_PATH);
  const costCatalogPath = options.costCatalogPath ?? path.resolve(rootDir, COST_CATALOG_PATH);

  const catalog = await readJsonFile(catalogPath);
  if (!catalog.ok) {
    return {
      ok: false,
      code: "ASSET_CATALOG_UNAVAILABLE",
      message: "Asset catalog could not be loaded.",
      data: emptyData(query)
    };
  }

  const costCatalog = await readJsonFile(costCatalogPath);
  const costIndex = createCostIndex(costCatalog.ok ? costCatalog.data : null);
  const assets = Array.isArray(catalog.data?.assets) ? catalog.data.assets : [];
  const scoredResults = assets
    .map((asset) => {
      const result = normalizeAssetForEditor(asset, costIndex.get(asset.id));
      if (!result) return null;
      return { result, score: scoreAssetResult(result, asset, query) };
    })
    .filter((entry) => entry && (!query || entry.score > 0))
    .sort((first, second) => second.score - first.score || first.result.label.localeCompare(second.result.label, "ko-KR"));

  return {
    ok: true,
    data: {
      facets: buildSearchFacets(scoredResults.map(({ result }) => result)),
      query,
      total: scoredResults.length,
      results: scoredResults.map(({ result, score }) => ({
        ...result,
        score
      }))
    }
  };
}
