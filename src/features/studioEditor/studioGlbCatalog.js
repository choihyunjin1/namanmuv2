const DEFAULT_CATALOG_URL = "/assets/models/catalog.json";
const DEFAULT_ASSET_SIZE = [1.2, 1.2, 1.2];
const HOUSE_SHELL_SIZE = [8, 4.8, 7];

const CATEGORY_BY_COMPONENT_KIND = {
  beam: "exterior-trim",
  column: "column",
  door: "door",
  railing: "railing",
  slab: "wall-tool",
  stair: "stairs-ladder",
  "wall-panel": "wall-tool",
  window: "window"
};

const CATEGORY_BY_BIM_TYPE = {
  IfcBeam: "exterior-trim",
  IfcColumn: "column",
  IfcDoor: "door",
  IfcRailing: "railing",
  IfcSlab: "wall-tool",
  IfcStair: "stairs-ladder",
  IfcWall: "wall-tool",
  IfcWallStandardCase: "wall-tool",
  IfcWindow: "window"
};

const COLOR_BY_CATEGORY = {
  column: "#d9d1bf",
  door: "#b28a63",
  "exterior-trim": "#e5ddd0",
  railing: "#9ca69f",
  "stairs-ladder": "#b9b6a7",
  "wall-tool": "#c9c5b7",
  window: "#9ecbd6"
};

function asFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampDimension(value, fallback = 1) {
  const number = asFiniteNumber(value);
  if (number === null || number <= 0) return fallback;
  return Number(Math.min(18, Math.max(0.08, number)).toFixed(3));
}

function getAuditDimensions(asset) {
  const dimensions =
    asset?.quality?.assetAudit?.bounds?.dimensions ??
    asset?.assetAudit?.bounds?.dimensions ??
    asset?.component?.dimensions ??
    asset?.dimensions;
  if (!Array.isArray(dimensions) || dimensions.length < 3) return null;
  return dimensions.map((dimension) => asFiniteNumber(dimension));
}

function normalizeSize(asset, categoryId) {
  const dimensions = getAuditDimensions(asset);
  if (!dimensions) return asset?.type === "house-shell" ? HOUSE_SHELL_SIZE : DEFAULT_ASSET_SIZE;
  const normalized = [
    clampDimension(dimensions[0], DEFAULT_ASSET_SIZE[0]),
    clampDimension(dimensions[1], DEFAULT_ASSET_SIZE[1]),
    clampDimension(dimensions[2], DEFAULT_ASSET_SIZE[2])
  ];

  if (asset?.type === "house-shell") {
    return normalized.map((dimension, index) => clampDimension(dimension, HOUSE_SHELL_SIZE[index]));
  }

  if (categoryId === "door" || categoryId === "window") {
    return [
      Math.max(0.12, normalized[0]),
      Math.max(0.7, normalized[1]),
      Math.max(0.7, normalized[2])
    ];
  }

  return normalized;
}

function getCategoryId(asset) {
  if (asset?.type === "house-shell") return "wall-tool";
  return CATEGORY_BY_COMPONENT_KIND[asset?.componentKind] ?? CATEGORY_BY_BIM_TYPE[asset?.bimType] ?? "wall-tool";
}

function getShape(asset, categoryId) {
  if (asset?.type === "house-shell") return "box";
  if (categoryId === "column") return "column";
  if (categoryId === "door") return "door";
  if (categoryId === "railing") return "railing";
  if (categoryId === "stairs-ladder") return "stairs";
  if (categoryId === "window") return "window";
  if (asset?.componentKind === "beam") return "beam";
  if (asset?.componentKind === "wall-panel") return "wall";
  return "box";
}

function getPlacementMode(asset, categoryId) {
  if (asset?.type === "house-shell") return "floor-free";
  if (categoryId === "stairs-ladder") return "floor-stair";
  if (categoryId === "column") return "floor-structural";
  return "floor-free";
}

function getPreviewMaterialLabel(asset, categoryId) {
  if (asset?.type === "house-shell") return "BIM house";
  if (asset?.bimType) return asset.bimType.replace(/^Ifc/, "");
  if (asset?.componentKind) return asset.componentKind;
  return categoryId;
}

function getSearchText(asset) {
  return [
    asset?.id,
    asset?.label,
    asset?.type,
    asset?.componentKind,
    asset?.bimType,
    asset?.source,
    ...(Array.isArray(asset?.tags) ? asset.tags : [])
  ]
    .filter(Boolean)
    .join(" ");
}

export function normalizeStudioGlbCatalog(rawCatalog) {
  const sourceAssets = Array.isArray(rawCatalog?.assets) ? rawCatalog.assets : [];
  return sourceAssets
    .filter((asset) => asset?.id && (asset?.originalUrl || asset?.url))
    .map((asset) => {
      const categoryId = getCategoryId(asset);
      const size = normalizeSize(asset, categoryId);
      const placementMode = getPlacementMode(asset, categoryId);
      const modelUrl = asset.originalUrl ?? asset.url;

      return {
        id: `glb-${asset.id}`,
        assetSourceId: asset.id,
        categoryId,
        color: COLOR_BY_CATEGORY[categoryId] ?? "#b9beb7",
        componentKind: asset.componentKind ?? null,
        format: "glb",
        label: asset.label ?? asset.id,
        metadataUrl: asset.metadataUrl ?? null,
        modelUrl,
        optimizedModelUrl: asset.optimizedUrl ?? asset.url ?? modelUrl,
        originalModelUrl: asset.originalUrl ?? modelUrl,
        placementHint: asset.type === "house-shell"
          ? "부지 위에 전체 BIM 외관 시안을 배치한다"
          : "로컬 GLB 자산을 작업층 평면에 배치한다",
        placementMode,
        previewKind: asset.type === "house-shell" ? "block" : undefined,
        previewMaterialLabel: getPreviewMaterialLabel(asset, categoryId),
        previewQuality: asset.sourceType === "ifc" || asset.bimType ? "bim" : "component",
        previewSwatch: COLOR_BY_CATEGORY[categoryId] ?? "#b9beb7",
        rawCatalogUrl: DEFAULT_CATALOG_URL,
        reviewStatus: asset.reviewStatus ?? "review-required",
        shape: getShape(asset, categoryId),
        size,
        source: "pascal",
        sourceId: "pascal",
        sourceLabel: asset.source ?? "",
        sourceType: asset.sourceType ?? "",
        status: asset.reviewStatus === "approved" ? "ready" : "partial",
        supportKind: placementMode === "floor-structural" ? "column" : undefined,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
        taxonomyPhase: "asset",
        thumbnailSrc: asset.thumbnailUrl ?? null,
        url: modelUrl,
        runtime: {
          estimatedDownloadMb: asset.performance?.estimatedDownloadMb ?? null,
          loadStrategy: asset.performance?.loadStrategy ?? "on-demand",
          originalSizeBytes: asset.originalSizeBytes ?? asset.compression?.originalSizeBytes ?? null,
          optimizedSizeBytes: asset.sizeBytes ?? asset.compression?.optimizedSizeBytes ?? null,
          runtimeUrl: modelUrl,
          sizeBytes: asset.sizeBytes ?? null
        },
        metadata: {
          bimType: asset.bimType ?? null,
          componentKind: asset.componentKind ?? null,
          entityCounts: asset.entityCounts ?? {},
          sourceAssetId: asset.id,
          sourceLabel: asset.source ?? "",
          sourceType: asset.sourceType ?? "",
          technicalGrade: asset.technicalGrade ?? asset.quality?.technicalGrade ?? null,
          technicalScore: asset.technicalScore ?? asset.quality?.technicalScore ?? null
        },
        searchText: getSearchText(asset)
      };
    });
}

export async function loadStudioGlbCatalog(fetchImpl = globalThis.fetch, catalogUrl = DEFAULT_CATALOG_URL) {
  if (typeof fetchImpl !== "function") return [];
  const response = await fetchImpl(catalogUrl, { cache: "no-cache" });
  if (!response.ok) throw new Error(`GLB catalog load failed: ${response.status}`);
  return normalizeStudioGlbCatalog(await response.json());
}
