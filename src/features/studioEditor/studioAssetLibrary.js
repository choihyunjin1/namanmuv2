export const STUDIO_ASSET_LIBRARY_STORAGE_KEY = "ploton:studio-editor:asset-library:v1";

const LIBRARY_LIMIT = 80;

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeAssetLabel(value, fallback = "내 자산") {
  const label = String(value ?? "").replace(/\s+/g, " ").trim();
  return label ? label.slice(0, 40) : fallback;
}

function normalizeSize(size) {
  const [width = 1, height = 1, depth = 1] = Array.isArray(size) ? size : [1, 1, 1];
  return [
    Number(Math.max(0.1, width).toFixed(2)),
    Number(Math.max(0.1, height).toFixed(2)),
    Number(Math.max(0.1, depth).toFixed(2))
  ];
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function normalizeVector(vector, fallback = [0, 0, 0]) {
  const source = Array.isArray(vector) ? vector : fallback;
  return fallback.map((fallbackValue, index) => {
    const value = Number(source[index]);
    return Number.isFinite(value) ? Number(value.toFixed(3)) : fallbackValue;
  });
}

function sanitizeEditorMetadata(metadata) {
  const nextMetadata = cloneJson(metadata ?? {}) ?? {};
  nextMetadata.editor = {};
  return nextMetadata;
}

function createObjectSnapshot(object, normalizedSize) {
  const snapshot = cloneJson(object);
  if (!snapshot) return null;

  snapshot.metadata = sanitizeEditorMetadata(snapshot.metadata);
  snapshot.position = normalizeVector(snapshot.position, [0, 0, 0]);
  snapshot.rotation = normalizeVector(snapshot.rotation, [0, 0, 0]);
  snapshot.size = normalizedSize;
  if (snapshot.room) {
    snapshot.room = {
      ...snapshot.room,
      attachments: Array.isArray(snapshot.room.attachments) ? snapshot.room.attachments : [],
      openings: Array.isArray(snapshot.room.openings) ? snapshot.room.openings : []
    };
  }
  if (snapshot.wallAttachments && !Array.isArray(snapshot.wallAttachments)) snapshot.wallAttachments = [];
  if (snapshot.wallOpenings && !Array.isArray(snapshot.wallOpenings)) snapshot.wallOpenings = [];
  return snapshot;
}

export function loadStudioAssetLibrary(storage = globalThis.localStorage) {
  if (!storage) return [];
  const payload = safeParseJson(storage.getItem(STUDIO_ASSET_LIBRARY_STORAGE_KEY), []);
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((asset) => asset?.id && asset?.categoryId && asset?.label)
    .slice(0, LIBRARY_LIMIT);
}

export function saveStudioAssetLibrary(assets, storage = globalThis.localStorage) {
  if (!storage) return [];
  const nextAssets = Array.isArray(assets) ? assets.slice(0, LIBRARY_LIMIT) : [];
  storage.setItem(STUDIO_ASSET_LIBRARY_STORAGE_KEY, JSON.stringify(nextAssets));
  return nextAssets;
}

export function createLibraryAssetFromObject(object, options = {}) {
  if (!object?.id) return null;

  const savedAt = options.savedAt ?? new Date().toISOString();
  const size = normalizeSize(object.size);
  const label = sanitizeAssetLabel(options.label ?? object.name, "내 건축 자산");
  const sourceCategoryId = object.categoryId ?? "";
  const categoryId = object.type === "room" || object.supportKind === "wall"
    ? "wall-tool"
    : sourceCategoryId === "column"
      ? "column"
      : ["gate", "railing", "stairs-ladder"].includes(sourceCategoryId)
        ? sourceCategoryId
        : "gate";
  const placementMode = categoryId === "wall-tool" || categoryId === "column"
    ? "floor-structural"
    : "floor-free";
  const sourceKind = object.type === "room"
    ? "saved-room-mass"
    : object.supportKind === "wall"
      ? "saved-wall-part"
      : object.placementMode === "floor-stair"
        ? "saved-stair"
        : "saved-object";
  const shape = object.type === "room"
    ? "box"
    : object.shape === "curved-wall"
      ? "box"
      : object.shape ?? "box";
  const sourceSnapshot = createObjectSnapshot(object, size);

  return {
    id: `mine-${object.id}-${Date.parse(savedAt) || Date.now()}`,
    categoryId,
    color: object.color ?? "#9bb8af",
    label,
    librarySource: "mine",
    placementHint: "Mine 라이브러리에 저장한 로컬 자산을 작업층 바닥에 다시 배치한다",
    placementMode,
    placementTitle: "내 자산 배치",
    prefabKind: "single-object",
    prefabVersion: 1,
    previewMaterialLabel: sourceKind.replace(/^saved-/, ""),
    previewQuality: "component",
    savedAt,
    shape,
    size,
    sourceId: "mine",
    sourceObjectId: object.id,
    sourceObjectType: object.type ?? object.placementMode ?? "object",
    sourceSnapshot
  };
}

export function upsertStudioLibraryAsset(assets, nextAsset) {
  if (!nextAsset) return assets ?? [];
  const currentAssets = Array.isArray(assets) ? assets : [];
  const deduped = currentAssets.filter((asset) => asset.id !== nextAsset.id);
  return [nextAsset, ...deduped].slice(0, LIBRARY_LIMIT);
}
