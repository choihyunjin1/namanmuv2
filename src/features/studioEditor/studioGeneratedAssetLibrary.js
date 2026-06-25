export const STUDIO_GENERATED_ASSET_STORAGE_KEY = "ploton:studio-editor:generated-assets:v1";

const GENERATED_ASSET_LIMIT = 60;

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSize(size) {
  const source = Array.isArray(size) ? size : [1, 1, 1];
  return [0, 1, 2].map((index) => {
    const value = Number(source[index]);
    return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : 1;
  });
}

function sanitizeText(value, fallback) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : fallback;
}

export function loadStudioGeneratedAssets(storage = globalThis.localStorage) {
  if (!storage) return [];
  const payload = safeParseJson(storage.getItem(STUDIO_GENERATED_ASSET_STORAGE_KEY), []);
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((asset) => asset?.id && asset?.categoryId && asset?.label)
    .slice(0, GENERATED_ASSET_LIMIT);
}

export function saveStudioGeneratedAssets(assets, storage = globalThis.localStorage) {
  if (!storage) return [];
  const nextAssets = Array.isArray(assets) ? assets.slice(0, GENERATED_ASSET_LIMIT) : [];
  storage.setItem(STUDIO_GENERATED_ASSET_STORAGE_KEY, JSON.stringify(nextAssets));
  return nextAssets;
}

export function createGeneratedCatalogAssetFromJob(job) {
  const sourceAsset = job?.asset;
  if (!job?.id || !sourceAsset?.id) return null;

  return {
    ...sourceAsset,
    color: sourceAsset.color ?? "#bca987",
    generatedAt: job.createdAt ?? new Date().toISOString(),
    generationJobId: job.id,
    generationPrompt: job.prompt ?? "",
    id: sourceAsset.id,
    label: sanitizeText(sourceAsset.label, "AI 생성 자산"),
    librarySource: "generated",
    metadata: {
      ...(sourceAsset.metadata ?? {}),
      cadScriptFormat: sourceAsset.cadScriptFormat ?? "openscad",
      engine: job.engine?.adapter ?? sourceAsset.engine ?? "ploton-text-to-cad",
      promptHash: job.promptHash,
      scenePlan: job.scenePlan ?? sourceAsset.metadata?.scenePlan ?? null,
      scenePlanSummary: sourceAsset.metadata?.scenePlanSummary ?? job.scenePlanSummary ?? null,
      sourceJobId: job.id,
      workerMode: job.engine?.mode
    },
    placementMode: sourceAsset.placementMode ?? "floor-free",
    previewMaterialLabel: sourceAsset.previewMaterialLabel ?? "generated",
    previewQuality: "generated",
    shape: sourceAsset.shape ?? "box",
    size: normalizeSize(sourceAsset.size),
    sourceId: "generated",
    status: job.status === "ready" ? "ready" : "partial"
  };
}

export function upsertStudioGeneratedAsset(assets, nextAsset) {
  if (!nextAsset) return assets ?? [];
  const currentAssets = Array.isArray(assets) ? assets : [];
  const deduped = currentAssets.filter((asset) => asset.id !== nextAsset.id);
  return [nextAsset, ...deduped].slice(0, GENERATED_ASSET_LIMIT);
}
