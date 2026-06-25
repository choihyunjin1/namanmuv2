import { getAssetTaxonomy } from "./assetTaxonomyRules.js";
import { getAllowedHostKinds } from "./hostEligibilityRules.js";

const PASCAL_ICON_BASE = "/assets/pascal-icons";

export const STUDIO_CATALOG_HOME_ICON_SRC = `${PASCAL_ICON_BASE}/build.webp`;

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

export function getStairCardDescriptor(asset) {
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

export function getAssetPreviewMeta(asset) {
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

export function getPlacementLabel(asset) {
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

export function getPlacementBadgeLabel(asset) {
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

export function getPlacementPolicyLabel(asset) {
  return PLACEMENT_POLICY_LABELS[asset.placementMode] ?? (asset.placementMode ? "place" : "asset");
}

export function getReadablePlacementLabel(asset) {
  return asset.placementTitle ?? PLACEMENT_COPY_LABELS[asset.placementMode] ?? getPlacementPolicyLabel(asset);
}

export function getInteractionVerb(asset, isDrawTool = false) {
  if (asset.interactionVerb) return asset.interactionVerb;
  if (isDrawTool) return "그리기";
  return INTERACTION_VERB_LABELS[asset.placementMode] ?? "드래그";
}

export function getPlacementHint(asset) {
  if (asset.placementHint) return asset.placementHint;
  if (asset.attachmentTarget === "stair") return "계단 선택 후 난간 부착 정책으로 확장 예정";
  return PLACEMENT_HINTS[asset.placementMode] ?? "에디터 씬에 배치한다";
}

export function getAssetStatus(asset) {
  if (asset.status) return asset.status;
  if (asset.attachmentTarget === "stair") return "partial";
  return "ready";
}

export function getAssetStatusLabel(asset) {
  return ASSET_STATUS_LABELS[getAssetStatus(asset)] ?? "ready";
}

export function getPreviewQuality(asset) {
  if (asset.previewQuality) return asset.previewQuality;
  if (asset.categoryId === "stairs-ladder" || asset.categoryId === "roof") return "component";
  if (asset.status === "coming-soon") return "planned";
  return "proxy";
}

export function getPreviewQualityLabel(asset) {
  return PREVIEW_QUALITY_LABELS[getPreviewQuality(asset)] ?? "proxy";
}

export function getCategoryPlacementSummary(assets) {
  const policies = [...new Set(assets.map(getPlacementPolicyLabel))].filter(Boolean);
  if (!policies.length) return "asset";
  if (policies.length <= 3) return policies.join(" / ");
  return `${policies.slice(0, 2).join(" / ")} +${policies.length - 2}`;
}

export function getCategoryPlacementBadgeSummary(assets) {
  const policies = [...new Set(assets.map((asset) => PLACEMENT_POLICY_BADGE_LABELS[asset.placementMode] ?? getPlacementPolicyLabel(asset)))].filter(Boolean);
  if (!policies.length) return "asset";
  if (policies.length === 1) return policies[0];
  if (policies.length === 2) return policies.join("+");
  return `${policies[0]}+${policies.length - 1}`;
}

export function getAssetMetaLabel(asset) {
  if (asset.placementMode === "floor-stair") return getStairCardDescriptor(asset)?.metaLabel || "stair";
  if (asset.openingSize) return `${asset.openingSize[0]}x${asset.openingSize[1]}m`;
  if (asset.attachmentSize) return `${asset.attachmentSize[0]}x${asset.attachmentSize[1]}m`;
  if (asset.size) return `${asset.size[0]}x${asset.size[2] ?? asset.size[1]}m`;
  return "custom";
}

export function getAssetHostLabel(asset) {
  const hosts = getAllowedHostKinds(asset).map((hostKind) => HOST_KIND_LABELS[hostKind] ?? hostKind);
  if (!hosts.length) return "free";
  if (hosts.length === 1) return `${hosts[0]} host`;
  return `${hosts.join("/")} host`;
}

export function getAssetTaxonomyLabel(asset) {
  const taxonomy = getAssetTaxonomy(asset);
  return `${taxonomy.phase}/${taxonomy.system}`;
}

export function getAssetIconSrc(asset) {
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
