import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Cuboid, Layers3, PanelRightClose } from "lucide-react";
import {
  CAMERA_VIEW_OPTIONS,
  EDITOR_FLOORS,
  EDITOR_GRID,
  EDITOR_TOOLS,
  getBuildableFootprint,
  getFloorBaseY
} from "./editorDefaults.js";
import { getEditorInteractionMode } from "./editorInteractionMode.js";
import { isObjectHidden, isObjectLocked } from "./editorObjectState.js";
import { EditorViewport } from "./EditorViewport.jsx";
import { collectAttachmentNodes, findAttachmentNode, summarizeAttachmentNodes } from "./attachmentNodeRules.js";
import { getAssetTaxonomy, normalizeAssetCatalogTaxonomy, summarizeAssetTaxonomy } from "./assetTaxonomyRules.js";
import { validateCatalogPolicy } from "./catalogPolicyRules.js";
import { buildStudioFloorplanInterop } from "./floorplanInterop.js";
import { getAllowedHostKinds, validateHostEligibility } from "./hostEligibilityRules.js";
import { applyOpeningPatch } from "./openingEditRules.js";
import { collectOpeningNodes, findOpeningNode, summarizeOpeningNodes } from "./openingNodeRules.js";
import {
  canOverlapSameCategory,
  canPlaceOnFloor,
  PLACEMENT_REASON_LABELS,
  requiresRoomHost,
  requiresWallHost,
  validateRoomPlacement
} from "./placementRules.js";
import { buildStudioPascalSceneGraph } from "./pascalSceneGraph.js";
import { createRoofAccessoryObjectForRoom, createRoofObjectForRoom } from "./roofPlacementRules.js";
import { validateStraightStairPlacement } from "./stairPlacementRules.js";
import { StudioAssetCatalog } from "./StudioAssetCatalog.jsx";
import { StudioEditorHeader } from "./StudioEditorHeader.jsx";
import {
  StudioEditorCanvasHud,
  StudioEditorToolbar,
  StudioEditorViewDisplayBar,
  StudioEmptySceneGuide,
  StudioSelectionActionBar,
  StudioViewportFloorStack,
  VIEW_DISPLAY_CAMERA_OPTIONS,
  WALL_VIEW_MODES
} from "./StudioEditorViewportChrome.jsx";
import { StudioSceneOutliner } from "./StudioSceneOutliner.jsx";
import {
  createLibraryAssetFromObject,
  loadStudioAssetLibrary,
  saveStudioAssetLibrary,
  upsertStudioLibraryAsset
} from "./studioAssetLibrary.js";
import {
  createGeneratedCatalogAssetFromJob,
  loadStudioGeneratedAssets,
  saveStudioGeneratedAssets,
  upsertStudioGeneratedAsset
} from "./studioGeneratedAssetLibrary.js";
import { STUDIO_CATALOG_ASSETS, STUDIO_CATALOG_CATEGORIES, getCatalogAsset } from "./studioCatalog.js";
import { loadStudioGlbCatalog } from "./studioGlbCatalog.js";
import { useStudioEditorState } from "./useStudioEditorState.js";
import {
  collectJoinableWalls,
  getWallEndpoints,
  getMergedWallGeometry,
  getSupportKind,
  getWallSegment,
  isStructuralWallObject
} from "./wallJoinRules.js";
import { createPascalWallDraft } from "./wallDraftEngine.js";
import { decomposeRoomToWalls, findRectangularWallRoom } from "./wallRoomRules.js";
import {
  buildWallEndpointResizeTopology,
  buildWallNormalMoveTopology,
  remapWallFeaturesToSegment
} from "./wallTopologyRules.js";
import { applyWallAttachmentPatch } from "./wallAttachmentEditRules.js";
import { normalizeWallSegmentPatch } from "./wallSegmentEditRules.js";

const EDITOR_HISTORY_LIMIT = 50;
const CATALOG_WIDTH_MIN = 300;
const CATALOG_WIDTH_MAX = 520;
const STUDIO_EDITOR_PROJECT_ID = "studio-editor-default";
const STUDIO_EDITOR_STORAGE_KEY = "ploton:studio-editor:default";
const STUDIO_EDITOR_SCHEMA_VERSION = 2;
const STUDIO_PROJECT_EXPORT_SCHEMA_VERSION = 1;
const STUDIO_WORKFLOW_MODES = [
  {
    description: "층, 객체, 개구부를 탐색합니다.",
    id: "scene",
    icon: Layers3,
    label: "Scene"
  },
  {
    description: "방, 벽, 지붕 같은 건축 도구를 배치합니다.",
    id: "build",
    icon: Cuboid,
    label: "Build"
  },
  {
    description: "창문, 문, 계단, 외장 자산을 배치합니다.",
    id: "items",
    icon: Cuboid,
    label: "Items"
  },
  {
    description: "층, 보기, 스냅 상태를 확인합니다.",
    id: "settings",
    icon: PanelRightClose,
    label: "Setup"
  }
];
const INTERACTION_MODE_LABELS = {
  "attach-roof": "roof attach",
  "draw-room": "room draw",
  "draw-wall": "wall draw",
  erase: "erase",
  "move-wall-attachment": "attachment move",
  "move-wall-opening": "opening move",
  move: "move",
  "place-wall-attachment": "wall attach",
  "place-wall-opening": "opening place",
  rotate: "rotate",
  scale: "scale",
  select: "select"
};
const PLACEMENT_BLOCKED_LABELS = {
  "footprint-overlap": "blocked footprint",
  "out-of-bounds": "blocked boundary",
  "out-of-wall": "blocked out-of-wall",
  "requires-wall-host": "blocked wall host",
  overlap: "blocked overlap",
  "same-position": "blocked same position",
  "unsupported-overhang": "blocked support"
};
const CAMERA_VIEW_ALIASES = {
  "2d": "top",
  "3d": "orbit",
  plan: "top",
  "plan-view": "top",
  topdown: "top",
  "top-down": "top"
};
const CAMERA_VIEW_IDS = new Set(VIEW_DISPLAY_CAMERA_OPTIONS.map((option) => option.id));

function normalizeCameraView(value) {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  const cameraView = CAMERA_VIEW_ALIASES[key] ?? key;
  return CAMERA_VIEW_IDS.has(cameraView) ? cameraView : "orbit";
}

function clampCatalogWidth(value) {
  return Math.min(CATALOG_WIDTH_MAX, Math.max(CATALOG_WIDTH_MIN, value));
}

function formatExportTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsText(file, "utf-8");
  });
}

function createProjectExportEnvelope(kind, data) {
  return {
    data,
    exportedAt: new Date().toISOString(),
    exporter: "ploton-studio-editor",
    kind,
    projectId: STUDIO_EDITOR_PROJECT_ID,
    schemaVersion: STUDIO_PROJECT_EXPORT_SCHEMA_VERSION
  };
}

function unwrapImportedScenePayload(payload) {
  if (payload?.kind === "ploton-studio-scene" && payload?.data) return payload.data;
  if (payload?.exporter === "ploton-studio-editor" && payload?.kind === "ploton-studio-scene" && payload?.data) {
    return payload.data;
  }
  return payload;
}

function areSameIdLists(first = [], second = []) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function getEditorObjectFloor(object) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  return 1;
}

function buildFloorStackSummary(objects = [], activeFloor = 1) {
  const byFloor = new Map();
  const ensureFloor = (floor) => {
    const normalizedFloor = Math.max(EDITOR_FLOORS.min, Math.round(Number(floor) || EDITOR_FLOORS.min));
    if (!byFloor.has(normalizedFloor)) {
      byFloor.set(normalizedFloor, {
        floor: normalizedFloor,
        hiddenCount: 0,
        lockedCount: 0,
        objectCount: 0,
        roomCount: 0
      });
    }
    return byFloor.get(normalizedFloor);
  };

  for (const floor of [EDITOR_FLOORS.min, activeFloor - 1, activeFloor, activeFloor + 1]) {
    if (floor >= EDITOR_FLOORS.min) ensureFloor(floor);
  }

  objects.forEach((object) => {
    const floor = getEditorObjectFloor(object);
    const summary = ensureFloor(floor);
    summary.objectCount += 1;
    if (object.type === "room") summary.roomCount += 1;
    if (isObjectHidden(object)) summary.hiddenCount += 1;
    if (isObjectLocked(object)) summary.lockedCount += 1;
  });

  return [...byFloor.values()]
    .sort((first, second) => second.floor - first.floor)
    .map((summary) => ({
      ...summary,
      active: summary.floor === activeFloor,
      allHidden: summary.objectCount > 0 && summary.hiddenCount === summary.objectCount,
      allLocked: summary.objectCount > 0 && summary.lockedCount === summary.objectCount,
      baseY: getFloorBaseY(summary.floor),
      occupied: summary.objectCount > 0
    }));
}

function formatInspectorMeters(value) {
  return `${Number(value ?? 0).toFixed(2).replace(/\.?0+$/, "")}m`;
}

function formatInspectorBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${Number((bytes / (1024 * 1024)).toFixed(2))}MB`;
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(1))}KB`;
  return `${Math.round(bytes)}B`;
}

function formatInspectorKrw(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

function getAssetFileName(url) {
  if (!url) return null;
  return String(url).split(/[?#]/)[0].split("/").filter(Boolean).at(-1) ?? String(url);
}

function getObjectAssetDetails(object) {
  if (!object?.modelUrl && !object?.metadata?.sourceAssetId && !object?.metadata?.cost) return null;
  const runtime = object.metadata?.runtime ?? object.runtime ?? {};
  const sourceMetadata = object.metadata?.sourceAssetMetadata ?? {};
  const cost = object.metadata?.cost ?? object.cost ?? null;
  const primaryCost = cost?.primary?.unitPriceKrw ?? cost?.defaultRoughCostKrw ?? null;
  const sourceId = object.metadata?.sourceAssetId ?? object.assetId ?? object.id;
  const sourceLabel = object.metadata?.sourceAssetLabel ?? object.metadata?.sourceLabel ?? object.name ?? sourceId;
  const quality = [
    object.metadata?.previewQuality,
    sourceMetadata.technicalGrade ? `grade ${sourceMetadata.technicalGrade}` : null,
    sourceMetadata.bimType ?? object.metadata?.sourceType
  ].filter(Boolean).join(" · ");

  return {
    costEstimate: formatInspectorKrw(primaryCost),
    fileName: getAssetFileName(object.modelUrl ?? object.metadata?.modelUrl),
    modelSize: formatInspectorBytes(runtime.sizeBytes ?? runtime.originalSizeBytes ?? runtime.optimizedSizeBytes),
    quality,
    source: [sourceLabel, sourceId && sourceId !== sourceLabel ? sourceId : null].filter(Boolean).join(" · ")
  };
}

function getObjectSizeLabel(object) {
  if (!object) return "none";
  if (isStructuralWallObject(object)) {
    const segment = getWallSegment(object);
    return `${formatInspectorMeters(segment.width)} L · ${formatInspectorMeters(segment.height)} H · ${formatInspectorMeters(segment.thickness)} T`;
  }
  const [width = 1, height = 1, depth = 1] = object.size ?? [1, 1, 1];
  return `${formatInspectorMeters(width)} W · ${formatInspectorMeters(height)} H · ${formatInspectorMeters(depth)} D`;
}

function getOpeningSizeLabel(opening) {
  if (!opening) return "none";
  return `${formatInspectorMeters(opening.width)} W · ${formatInspectorMeters(opening.height)} H · sill ${formatInspectorMeters(opening.sillHeight)}`;
}

function getAttachmentSizeLabel(attachment) {
  if (!attachment) return "none";
  return `${formatInspectorMeters(attachment.width)} W · ${formatInspectorMeters(attachment.height)} H`;
}

function formatInspectorInput(value) {
  return Number(value ?? 0).toFixed(2);
}

function formatInspectorDegrees(radians) {
  return Math.round((((radians ?? 0) * 180) / Math.PI + 360) % 360);
}

const HOST_KIND_DISPLAY_LABELS = {
  floor: "floor",
  room: "room",
  roof: "roof",
  "structural-wall": "wall",
  unknown: "unknown"
};

function formatHostKind(hostKind) {
  return HOST_KIND_DISPLAY_LABELS[hostKind] ?? hostKind ?? "unknown";
}

function formatAllowedHosts(asset) {
  return getAllowedHostKinds(asset).map(formatHostKind).join(" / ");
}

function getDirectTransformEditSource(historyKey, fallback) {
  if (typeof historyKey === "string" && historyKey.startsWith("inspector-")) return historyKey;
  if (typeof historyKey === "string" && historyKey.startsWith("keyboard")) return historyKey;
  return fallback;
}

function formatPlacementBlockedReason(reason) {
  if (!reason) return "blocked";
  return PLACEMENT_BLOCKED_LABELS[reason] ?? `blocked ${reason}`;
}

function getHostedPreviewHost(preview, objects = []) {
  if (!preview) return null;
  const hostId = preview.roomId ?? preview.wallObjectId ?? null;
  if (!hostId) return null;
  return objects.find((object) => object.id === hostId) ?? null;
}

function getPlacementFeedback({
  activePlacementAsset,
  objects,
  roomDraft,
  wallAttachmentPreview,
  wallDraft,
  wallOpeningPreview
}) {
  const preview =
    wallOpeningPreview
      ? { data: wallOpeningPreview, kind: "opening" }
      : wallAttachmentPreview
        ? { data: wallAttachmentPreview, kind: "attachment" }
        : null;

  if (preview) {
    const host = getHostedPreviewHost(preview.data, objects);
    const hostLabel = host?.name ?? (preview.data.wallObjectId ? "wall host" : preview.data.roomId ? "room host" : "wall");
    return {
      hostLabel: `host ${hostLabel}`,
      statusLabel: preview.data.valid
        ? `ready ${preview.kind}`
        : formatPlacementBlockedReason(preview.data.invalidReason),
      tone: preview.data.valid ? "valid" : "invalid"
    };
  }

  const draft = wallDraft ?? roomDraft;
  if (draft) {
    return {
      hostLabel: "host floor",
      statusLabel: draft.valid ? "ready footprint" : formatPlacementBlockedReason(draft.invalidReason),
      tone: draft.valid ? "valid" : "invalid"
    };
  }

  if (activePlacementAsset) {
    const allowedHosts = formatAllowedHosts(activePlacementAsset);
    const action = ["wall-opening", "wall-attached"].includes(activePlacementAsset.placementMode)
      ? "target wall"
      : activePlacementAsset.placementMode === "roof-attached"
        ? "target room"
        : activePlacementAsset.placementMode === "roof-accessory"
          ? "target roof"
          : "target floor";
    return {
      hostLabel: `host ${allowedHosts}`,
      statusLabel: action,
      tone: "pending"
    };
  }

  return {
    hostLabel: "host none",
    statusLabel: "idle",
    tone: "idle"
  };
}

function getAssetPolicyContext(source = {}, fallback = {}) {
  const assetId = source?.assetId ?? source?.id ?? fallback?.assetId ?? fallback?.id;
  const catalogAsset = assetId ? getCatalogAsset(assetId) : null;

  return {
    ...fallback,
    ...(catalogAsset ?? {}),
    ...source,
    id: catalogAsset?.id ?? assetId ?? source?.id ?? fallback?.id ?? "unknown-asset"
  };
}

function getSelectionPolicyDetails(source = {}, host = null, fallback = {}) {
  const assetContext = getAssetPolicyContext(source, fallback);
  const taxonomy = getAssetTaxonomy(assetContext);
  const hostEligibility = validateHostEligibility(assetContext, host);
  const hostStatus = hostEligibility.allowed ? "valid" : "invalid";

  return {
    allowedHosts: formatAllowedHosts(assetContext),
    currentHost: `${formatHostKind(hostEligibility.hostKind)} · ${hostStatus}`,
    taxonomy: `${taxonomy.phase}/${taxonomy.system}/${taxonomy.editKind}`
  };
}

function InspectorControlRow({ ariaLabel, disabled = false, label, max, min, onChange, step = 0.5, unit = "m", value }) {
  return (
    <label className="studio-editor-control-row">
      <span>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) onChange(nextValue);
        }}
        step={step}
        type="number"
        value={formatInspectorInput(value)}
      />
      <em>{unit}</em>
    </label>
  );
}

function StudioWorkflowSettingsPanel({
  activeFloor,
  cameraView,
  gridVisible,
  objectCount,
  openingCount,
  roomCount,
  snapEnabled,
  wallViewMode
}) {
  const cameraLabel = CAMERA_VIEW_OPTIONS.find((option) => option.id === cameraView)?.label ?? cameraView;

  return (
    <section className="studio-workflow-settings" aria-label="작업 설정">
      <div className="studio-editor-panel-title">
        <PanelRightClose size={17} />
        <strong>Setup</strong>
      </div>
      <dl className="studio-editor-metrics">
        <div>
          <dt>층</dt>
          <dd>{activeFloor}F</dd>
        </div>
        <div>
          <dt>카메라</dt>
          <dd>{cameraLabel}</dd>
        </div>
        <div>
          <dt>그리드</dt>
          <dd>{gridVisible ? "ON" : "OFF"}</dd>
        </div>
        <div>
          <dt>스냅</dt>
          <dd>{snapEnabled ? `${EDITOR_GRID.snapStep}m` : "OFF"}</dd>
        </div>
        <div>
          <dt>벽 보기</dt>
          <dd>{wallViewMode}</dd>
        </div>
        <div>
          <dt>객체</dt>
          <dd>{objectCount}</dd>
        </div>
        <div>
          <dt>방</dt>
          <dd>{roomCount}</dd>
        </div>
        <div>
          <dt>개구부</dt>
          <dd>{openingCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function StudioWorkflowPanel({
  activeAssetId,
  activeCategoryId,
  activeFloor,
  activeMode,
  assets,
  cameraView,
  catalogCollapsed,
  gridVisible,
  objectCount,
  objects,
  onAssetPick,
  onCategoryChange,
  onCollapseToggle,
  onDragAssetStart,
  onFloorFocus,
  onGenerateAsset,
  onGenerateSceneFromBrief,
  onModeChange,
  onResizeStart,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  onSetFloorHidden,
  onSetFloorLocked,
  onToggleHidden,
  onToggleLocked,
  openingCount,
  recentAssetIds,
  roomCount,
  selectedAttachmentId,
  selectedObjectId,
  selectedObjectIds,
  selectedOpeningId,
  generationStatus,
  snapEnabled,
  wallViewMode
}) {
  const mode = STUDIO_WORKFLOW_MODES.find((item) => item.id === activeMode) ?? STUDIO_WORKFLOW_MODES[1];
  const assetMode = activeMode === "build" || activeMode === "items";

  return (
    <aside className={`studio-workflow-shell is-${mode.id}${catalogCollapsed && assetMode ? " is-context-collapsed" : ""}`} aria-label="작업 모드">
      <nav className="studio-workflow-rail" aria-label="워크플로우">
        {STUDIO_WORKFLOW_MODES.map((item) => {
          const Icon = item.icon;
          const active = item.id === mode.id;
          return (
            <button
              aria-label={`${item.label}: ${item.description}`}
              aria-pressed={active}
              className={active ? "is-active" : ""}
              key={item.id}
              onClick={() => onModeChange(item.id)}
              title={`${item.label} · ${item.description}`}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="studio-workflow-context">
        {mode.id === "scene" ? (
          <StudioSceneOutliner
            activeFloor={activeFloor}
            objects={objects}
            onFloorFocus={onFloorFocus}
            onSelectAttachment={onSelectAttachment}
            onSelectObject={onSelectObject}
            onSelectOpening={onSelectOpening}
            onSetFloorHidden={onSetFloorHidden}
            onSetFloorLocked={onSetFloorLocked}
            onToggleHidden={onToggleHidden}
            onToggleLocked={onToggleLocked}
            selectedAttachmentId={selectedAttachmentId}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            selectedOpeningId={selectedOpeningId}
          />
        ) : mode.id === "settings" ? (
          <StudioWorkflowSettingsPanel
            activeFloor={activeFloor}
            cameraView={cameraView}
            gridVisible={gridVisible}
            objectCount={objectCount}
            openingCount={openingCount}
            roomCount={roomCount}
            snapEnabled={snapEnabled}
            wallViewMode={wallViewMode}
          />
        ) : (
          <StudioAssetCatalog
            activeCategoryId={activeCategoryId}
            activeAssetId={activeAssetId}
            assets={assets}
            collapsed={catalogCollapsed}
            generationStatus={generationStatus}
            onAssetPick={onAssetPick}
            onCategoryChange={onCategoryChange}
            onCollapseToggle={onCollapseToggle}
            onDragAssetStart={onDragAssetStart}
            onGenerateAsset={onGenerateAsset}
            onGenerateSceneFromBrief={onGenerateSceneFromBrief}
            onResizeStart={onResizeStart}
            recentAssetIds={recentAssetIds}
          />
        )}
      </div>
    </aside>
  );
}

function StudioEditorInspector({
  activeFloor,
  attachmentCount,
  cameraView,
  gridVisible,
  hiddenObjectCount,
  joinedWallCount,
  lockedObjectCount,
  openingCount,
  objects,
  onDeleteSelection,
  onDuplicateSelection,
  onFloorChange,
  onHideSelection,
  onLockSelection,
  onMoveSelection,
  onMoveObject,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  onSetFloorHidden,
  onSetFloorLocked,
  onShowSelection,
  onToggleHidden,
  onToggleLocked,
  onUnlockSelection,
  onUpdateAttachment,
  onMoveAttachment,
  onMoveOpening,
  onUpdateWallSegment,
  onUpdateOpening,
  onRotateObject,
  onScaleObject,
  selectedAttachment,
  selectedAttachmentObject,
  selectedObject,
  selectedObjectId,
  selectedObjectIds = [],
  selectedOpening,
  selectedOpeningObject,
  selectedTransformLabel,
  showSceneOutliner = true,
  snapEnabled
}) {
  const buildable = useMemo(() => getBuildableFootprint(), []);
  const occupiedFloors = useMemo(() => {
    const floors = objects
      .map((object) => object.room?.floor ?? object.floor)
      .filter(Number.isFinite);
    return [...new Set([activeFloor, ...floors])].sort((a, b) => a - b);
  }, [activeFloor, objects]);
  const selectedObjectHidden = isObjectHidden(selectedObject);
  const selectedObjectLocked = isObjectLocked(selectedObject);
  const selectedObjectIdSet = new Set(selectedObjectIds);
  const selectedObjects = objects.filter((object) => selectedObjectIdSet.has(object.id));
  const selectedWallSegment = selectedObject && isStructuralWallObject(selectedObject) ? getWallSegment(selectedObject) : null;
  const multiSelectionActive = selectedObjects.length > 1 && !selectedOpeningObject && !selectedAttachmentObject;
  const selectedHiddenCount = selectedObjects.filter(isObjectHidden).length;
  const selectedLockedCount = selectedObjects.filter(isObjectLocked).length;
  const selectedOpeningHost = selectedOpening
    ? objects.find((object) => object.id === (selectedOpening.roomId ?? selectedOpening.wallObjectId)) ?? null
    : null;
  const selectedAttachmentHost = selectedAttachment
    ? objects.find((object) => object.id === (selectedAttachment.roomId ?? selectedAttachment.wallObjectId)) ?? null
    : null;
  const selectedObjectPolicyHost = selectedObject?.metadata?.attachedRoofId
    ? objects.find((object) => object.id === selectedObject.metadata.attachedRoofId) ?? null
    : selectedObject?.metadata?.attachedRoomId
      ? objects.find((object) => object.id === selectedObject.metadata.attachedRoomId) ?? null
      : null;
  const selectedOpeningPolicy = selectedOpeningObject
    ? getSelectionPolicyDetails(selectedOpeningObject, selectedOpeningHost, {
        categoryId: selectedOpeningObject.type === "door" ? "door" : "window",
        placementMode: "wall-opening"
      })
    : null;
  const selectedAttachmentPolicy = selectedAttachmentObject
    ? getSelectionPolicyDetails(selectedAttachmentObject, selectedAttachmentHost, {
        categoryId: selectedAttachmentObject.categoryId ?? "wall-pattern",
        placementMode: "wall-attached"
      })
    : null;
  const selectedObjectPolicy = selectedObject
    ? getSelectionPolicyDetails(selectedObject, selectedObjectPolicyHost, {
        categoryId: selectedObject.categoryId,
        placementMode: selectedObject.placementMode
      })
    : null;
  const selectedObjectAssetDetails = selectedObject ? getObjectAssetDetails(selectedObject) : null;
  const selection = selectedOpeningObject
    ? {
        kind: selectedOpeningObject.type === "door" ? "문 개구부" : "창문 개구부",
        label: selectedOpeningObject.label ?? "개구부",
        allowedHosts: selectedOpeningPolicy?.allowedHosts,
        currentHost: selectedOpeningPolicy?.currentHost,
        size: getOpeningSizeLabel(selectedOpeningObject),
        placement: `${selectedOpeningObject.hostLabel ?? "host"} / ${selectedOpeningObject.wall} · ${formatInspectorMeters(selectedOpeningObject.offset)}`,
        state: selectedOpeningObject.nodeId ? `node ${selectedOpeningObject.nodeId}` : undefined,
        taxonomy: selectedOpeningPolicy?.taxonomy
      }
      : selectedAttachmentObject
        ? {
          kind: "벽 부착",
          label: selectedAttachmentObject.label ?? "벽 부착",
          allowedHosts: selectedAttachmentPolicy?.allowedHosts,
          currentHost: selectedAttachmentPolicy?.currentHost,
          size: getAttachmentSizeLabel(selectedAttachmentObject),
          placement: `${selectedAttachmentObject.hostLabel ?? "host"} / ${selectedAttachmentObject.wall} · ${formatInspectorMeters(selectedAttachmentObject.offset)}`,
          state: selectedAttachmentObject.nodeId ? `node ${selectedAttachmentObject.nodeId}` : undefined,
          taxonomy: selectedAttachmentPolicy?.taxonomy
        }
      : multiSelectionActive
        ? {
            kind: "복수 객체",
            label: `${selectedObjects.length}개 객체 선택`,
            size: `${selectedObjects.filter((object) => object.type === "room").length} room · ${selectedObjects.filter(isStructuralWallObject).length} wall`,
            state: `${selectedHiddenCount} hidden · ${selectedLockedCount} locked`,
            transform: "batch selection"
          }
        : selectedObject
        ? {
            kind: selectedObject.type === "room" ? "방/매스" : isStructuralWallObject(selectedObject) ? "구조 벽" : selectedObject.placementMode ?? "객체",
            label: selectedObject.name ?? "객체",
            allowedHosts: selectedObjectPolicy?.allowedHosts,
            currentHost: selectedObjectPolicy?.currentHost,
            position: (selectedObject.position ?? [0, 0, 0]).map(formatInspectorMeters).join(" · "),
            state: `${selectedObjectHidden ? "hidden" : "visible"} · ${selectedObjectLocked ? "locked" : "editable"}`,
            size: getObjectSizeLabel(selectedObject),
            taxonomy: selectedObjectPolicy?.taxonomy,
            transform: selectedTransformLabel,
            assetSource: selectedObjectAssetDetails?.source,
            modelFile: selectedObjectAssetDetails?.fileName,
            modelSize: selectedObjectAssetDetails?.modelSize,
            assetQuality: selectedObjectAssetDetails?.quality,
            costEstimate: selectedObjectAssetDetails?.costEstimate
          }
        : null;
  const hasObjectBatchSelection = selectedObjects.length > 0 && !selectedOpeningObject && !selectedAttachmentObject;
  const canDuplicateSelection = multiSelectionActive
    ? selectedObjects.some((object) => !isObjectLocked(object) && !isObjectHidden(object))
    : Boolean(selectedObject && !selectedObjectLocked && !selectedObjectHidden && !selectedOpeningObject && !selectedAttachmentObject);
  const canDeleteSelection = multiSelectionActive
    ? selectedObjects.some((object) => !isObjectLocked(object))
    : Boolean(!selectedObject || !selectedObjectLocked);
  const canMoveSelection = Boolean(selectedObject && !multiSelectionActive && !selectedObjectLocked && !selectedObjectHidden && !selectedOpeningObject && !selectedAttachmentObject);
  const canMoveOpening = Boolean(selectedOpening && selectedOpeningObject && !selectedObjectLocked && !selectedObjectHidden);
  const canMoveAttachment = Boolean(selectedAttachment && selectedAttachmentObject && !selectedObjectLocked && !selectedObjectHidden);
  const transformLocked = Boolean(selectedObject && (selectedObjectLocked || selectedObjectHidden || selectedObject.type === "room" || isStructuralWallObject(selectedObject)));
  const attachmentEditLocked = Boolean(!selectedAttachment || selectedObjectLocked || selectedObjectHidden);
  const openingEditLocked = Boolean(!selectedOpening || selectedObjectLocked || selectedObjectHidden);
  const objectPosition = selectedObject?.position ?? [0, 0, 0];
  const objectSize = selectedObject?.size ?? [1, 1, 1];
  const objectRotation = selectedObject?.rotation ?? [0, 0, 0];
  const updateObjectPosition = (axis, value) => {
    if (!selectedObject) return;
    const nextPosition = [...objectPosition];
    nextPosition[axis] = value;
    onMoveObject?.(selectedObject.id, nextPosition, "inspector-position");
  };
  const updateObjectSize = (axis, value) => {
    if (!selectedObject) return;
    const nextSize = [...objectSize];
    nextSize[axis] = value;
    onScaleObject?.(selectedObject.id, nextSize, "inspector-size");
  };
  const updateObjectRotationY = (degrees) => {
    if (!selectedObject) return;
    const nextRotation = [...objectRotation];
    nextRotation[1] = (degrees * Math.PI) / 180;
    onRotateObject?.(selectedObject.id, nextRotation, "inspector-rotation");
  };
  const updateWallSegmentMetric = (field, value) => {
    if (!selectedObject || !selectedWallSegment) return;
    onUpdateWallSegment?.(selectedObject.id, { [field]: value });
  };
  const updateOpeningMetric = (field, value) => {
    if (!selectedOpening) return;
    onUpdateOpening?.(selectedOpening, { [field]: value });
  };
  const updateAttachmentMetric = (field, value) => {
    if (!selectedAttachment) return;
    onUpdateAttachment?.(selectedAttachment, { [field]: value });
  };
  const handleMoveSelection = () => {
    if (selectedAttachment) {
      onMoveAttachment?.(selectedAttachment);
      return;
    }
    if (selectedOpening) {
      onMoveOpening?.(selectedOpening);
      return;
    }
    onMoveSelection?.();
  };
  return (
    <aside className="studio-editor-inspector">
      {showSceneOutliner ? (
        <StudioSceneOutliner
          activeFloor={activeFloor}
          objects={objects}
          onFloorFocus={onFloorChange}
          onSelectAttachment={onSelectAttachment}
          onSelectObject={onSelectObject}
          onSelectOpening={onSelectOpening}
          onSetFloorHidden={onSetFloorHidden}
          onSetFloorLocked={onSetFloorLocked}
          onToggleHidden={onToggleHidden}
          onToggleLocked={onToggleLocked}
          selectedAttachmentId={selectedAttachment?.attachmentId}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          selectedOpeningId={selectedOpening?.openingId}
        />
      ) : null}

      {selection ? (
        <section className="studio-editor-selection-panel">
          <div className="studio-editor-panel-title">
            <Cuboid size={17} />
            <strong>선택 항목</strong>
          </div>
          <dl className="studio-editor-metrics">
            <div>
              <dt>이름</dt>
              <dd>{selection.label}</dd>
            </div>
            <div>
              <dt>유형</dt>
              <dd>{selection.kind}</dd>
            </div>
            {selection.taxonomy ? (
              <div>
                <dt>분류</dt>
                <dd>{selection.taxonomy}</dd>
              </div>
            ) : null}
            {selection.assetSource ? (
              <div>
                <dt>자산 출처</dt>
                <dd>{selection.assetSource}</dd>
              </div>
            ) : null}
            {selection.modelFile ? (
              <div>
                <dt>모델 파일</dt>
                <dd>{selection.modelFile}</dd>
              </div>
            ) : null}
            {selection.modelSize ? (
              <div>
                <dt>파일 크기</dt>
                <dd>{selection.modelSize}</dd>
              </div>
            ) : null}
            {selection.assetQuality ? (
              <div>
                <dt>자산 품질</dt>
                <dd>{selection.assetQuality}</dd>
              </div>
            ) : null}
            {selection.costEstimate ? (
              <div>
                <dt>가격 근거</dt>
                <dd>{selection.costEstimate}</dd>
              </div>
            ) : null}
            {selection.allowedHosts ? (
              <div>
                <dt>허용 호스트</dt>
                <dd>{selection.allowedHosts}</dd>
              </div>
            ) : null}
            {selection.currentHost ? (
              <div>
                <dt>현재 호스트</dt>
                <dd>{selection.currentHost}</dd>
              </div>
            ) : null}
            <div>
              <dt>크기</dt>
              <dd>{selection.size}</dd>
            </div>
            {selection.position ? (
              <div>
                <dt>위치</dt>
                <dd>{selection.position}</dd>
              </div>
            ) : null}
            {selection.state ? (
              <div>
                <dt>상태</dt>
                <dd>{selection.state}</dd>
              </div>
            ) : null}
            {selection.placement ? (
              <div>
                <dt>부착</dt>
                <dd>{selection.placement}</dd>
              </div>
            ) : null}
            {selection.transform ? (
              <div>
                <dt>변환</dt>
                <dd>{selection.transform}</dd>
              </div>
            ) : null}
          </dl>
          {selectedObject && !multiSelectionActive && !selectedOpeningObject && !selectedAttachmentObject ? (
            <div className="studio-editor-transform-controls">
              {selectedWallSegment ? (
                <div className="studio-editor-control-section">
                  <strong>벽 세그먼트</strong>
                  <InspectorControlRow disabled={selectedObjectLocked || selectedObjectHidden} label="Length" min={0.5} onChange={(value) => updateWallSegmentMetric("length", value)} value={selectedWallSegment.width} />
                  <InspectorControlRow disabled={selectedObjectLocked || selectedObjectHidden} label="Height" min={0.5} onChange={(value) => updateWallSegmentMetric("height", value)} value={selectedWallSegment.height} />
                  <InspectorControlRow disabled={selectedObjectLocked || selectedObjectHidden} label="Thick" min={0.08} step={0.02} onChange={(value) => updateWallSegmentMetric("thickness", value)} value={selectedWallSegment.thickness} />
                  <InspectorControlRow disabled={selectedObjectLocked || selectedObjectHidden} label={selectedWallSegment.orientation === "x" ? "Center X" : "Center Z"} onChange={(value) => updateWallSegmentMetric("centerU", value)} value={(selectedWallSegment.minU + selectedWallSegment.maxU) / 2} />
                  <InspectorControlRow disabled={selectedObjectLocked || selectedObjectHidden} label={selectedWallSegment.orientation === "x" ? "Cross Z" : "Cross X"} onChange={(value) => updateWallSegmentMetric("cross", value)} value={selectedWallSegment.cross} />
                </div>
              ) : null}
              <div className="studio-editor-control-section">
                <strong>위치</strong>
                <InspectorControlRow ariaLabel="Position X" disabled={selectedObjectLocked || selectedObjectHidden} label="X" onChange={(value) => updateObjectPosition(0, value)} value={objectPosition[0]} />
                <InspectorControlRow ariaLabel="Position Y" disabled={selectedObjectLocked || selectedObjectHidden} label="Y" onChange={(value) => updateObjectPosition(1, value)} value={objectPosition[1]} />
                <InspectorControlRow ariaLabel="Position Z" disabled={selectedObjectLocked || selectedObjectHidden} label="Z" onChange={(value) => updateObjectPosition(2, value)} value={objectPosition[2]} />
              </div>
              <div className="studio-editor-control-section">
                <strong>크기{transformLocked ? " · locked" : ""}</strong>
                <InspectorControlRow ariaLabel="Size W" disabled={transformLocked} label="W" min={0.2} onChange={(value) => updateObjectSize(0, value)} value={objectSize[0]} />
                <InspectorControlRow ariaLabel="Size H" disabled={transformLocked} label="H" min={0.05} onChange={(value) => updateObjectSize(1, value)} value={objectSize[1]} />
                <InspectorControlRow ariaLabel="Size D" disabled={transformLocked} label="D" min={0.2} onChange={(value) => updateObjectSize(2, value)} value={objectSize[2]} />
              </div>
              <div className="studio-editor-control-section">
                <strong>회전{transformLocked ? " · locked" : ""}</strong>
                <InspectorControlRow
                  ariaLabel="Rotation Y"
                  disabled={transformLocked}
                  label="Y"
                  onChange={updateObjectRotationY}
                  step={5}
                  unit="deg"
                  value={formatInspectorDegrees(objectRotation[1])}
                />
              </div>
            </div>
          ) : null}
          {selectedOpeningObject ? (
            <div className="studio-editor-transform-controls">
              <div className="studio-editor-control-section">
                <strong>개구부 위치</strong>
                <InspectorControlRow disabled={openingEditLocked} label="Offset" onChange={(value) => updateOpeningMetric("offset", value)} value={selectedOpeningObject.offset ?? 0} />
                <InspectorControlRow disabled={openingEditLocked || selectedOpeningObject.type === "door"} label="Sill" onChange={(value) => updateOpeningMetric("sillHeight", value)} value={selectedOpeningObject.sillHeight ?? 0} />
              </div>
              <div className="studio-editor-control-section">
                <strong>개구부 크기</strong>
                <InspectorControlRow disabled={openingEditLocked} label="W" min={0.2} onChange={(value) => updateOpeningMetric("width", value)} value={selectedOpeningObject.width ?? 1} />
                <InspectorControlRow disabled={openingEditLocked} label="H" min={0.2} onChange={(value) => updateOpeningMetric("height", value)} value={selectedOpeningObject.height ?? 1} />
              </div>
            </div>
          ) : null}
          {selectedAttachmentObject ? (
            <div className="studio-editor-transform-controls">
              <div className="studio-editor-control-section">
                <strong>벽 부착 위치</strong>
                <InspectorControlRow disabled={attachmentEditLocked} label="Offset" onChange={(value) => updateAttachmentMetric("offset", value)} value={selectedAttachmentObject.offset ?? 0} />
                <InspectorControlRow disabled={attachmentEditLocked} label="Center" onChange={(value) => updateAttachmentMetric("centerY", value)} value={selectedAttachmentObject.centerY ?? 0} />
              </div>
              <div className="studio-editor-control-section">
                <strong>벽 부착 크기</strong>
                <InspectorControlRow disabled={attachmentEditLocked} label="W" min={0.2} onChange={(value) => updateAttachmentMetric("width", value)} value={selectedAttachmentObject.width ?? 1} />
                <InspectorControlRow disabled={attachmentEditLocked} label="H" min={0.05} onChange={(value) => updateAttachmentMetric("height", value)} value={selectedAttachmentObject.height ?? 0.3} />
                <InspectorControlRow disabled={attachmentEditLocked} label="Depth" min={0.01} step={0.01} onChange={(value) => updateAttachmentMetric("depth", value)} value={selectedAttachmentObject.depth ?? 0.05} />
              </div>
            </div>
          ) : null}
          {hasObjectBatchSelection ? (
            <div className="studio-editor-inspector-actions is-bulk">
              <button disabled={selectedHiddenCount === selectedObjects.length} onClick={onHideSelection} type="button">Hide</button>
              <button disabled={selectedHiddenCount === 0} onClick={onShowSelection} type="button">Show</button>
              <button disabled={selectedLockedCount === selectedObjects.length} onClick={onLockSelection} type="button">Lock</button>
              <button disabled={selectedLockedCount === 0} onClick={onUnlockSelection} type="button">Unlock</button>
            </div>
          ) : null}
          <div className="studio-editor-inspector-actions">
            <button disabled={!canMoveSelection && !canMoveOpening && !canMoveAttachment} onClick={handleMoveSelection} type="button">Move</button>
            <button disabled={!canDuplicateSelection} onClick={onDuplicateSelection} type="button">Duplicate</button>
            <button className="is-danger" disabled={!canDeleteSelection} onClick={onDeleteSelection} type="button">Delete</button>
          </div>
        </section>
      ) : (
      <section>
        <div className="studio-editor-panel-title">
          <Cuboid size={17} />
          <strong>작업 영역</strong>
        </div>
        <dl className="studio-editor-metrics">
          <div>
            <dt>필지</dt>
            <dd>{EDITOR_GRID.parcelWidth}m x {EDITOR_GRID.parcelDepth}m</dd>
          </div>
          <div>
            <dt>건축 가능</dt>
            <dd>{buildable.width}m x {buildable.depth}m</dd>
          </div>
          <div>
            <dt>후퇴선</dt>
            <dd>{EDITOR_GRID.setback}m</dd>
          </div>
          <div>
            <dt>작업층</dt>
            <dd>{activeFloor}F</dd>
          </div>
          <div>
            <dt>객체</dt>
            <dd>{objects.length}</dd>
          </div>
          <div>
            <dt>개구부</dt>
            <dd>{openingCount}</dd>
          </div>
          <div>
            <dt>벽 부착</dt>
            <dd>{attachmentCount}</dd>
          </div>
          <div>
            <dt>접합 벽</dt>
            <dd>{joinedWallCount}</dd>
          </div>
        </dl>
      </section>
      )}

      <section>
        <div className="studio-editor-panel-title">
          <Layers3 size={17} />
          <strong>층 작업</strong>
        </div>
        <div className="studio-editor-floor-stepper" aria-label="활성 층">
          <button
            disabled={activeFloor <= EDITOR_FLOORS.min}
            onClick={() => onFloorChange(activeFloor - 1)}
            title="층 내리기"
            type="button"
          >
            <ChevronDown size={16} />
          </button>
          <strong>{activeFloor}F</strong>
          <button onClick={() => onFloorChange(activeFloor + 1)} title="층 올리기" type="button">
            <ChevronUp size={16} />
          </button>
        </div>
        <div className="studio-editor-floor-chips" aria-label="존재하는 층">
          {occupiedFloors.map((floor) => (
            <button
              className={activeFloor === floor ? "is-active" : ""}
              key={floor}
              onClick={() => onFloorChange(floor)}
              type="button"
            >
              {floor}F
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="studio-editor-panel-title">
          <PanelRightClose size={17} />
          <strong>표시 상태</strong>
        </div>
        <dl className="studio-editor-metrics">
          <div>
            <dt>카메라</dt>
            <dd>{CAMERA_VIEW_OPTIONS.find((option) => option.id === cameraView)?.label ?? cameraView}</dd>
          </div>
          <div>
            <dt>그리드</dt>
            <dd>{gridVisible ? "ON" : "OFF"}</dd>
          </div>
          <div>
            <dt>스냅</dt>
            <dd>{snapEnabled ? `${EDITOR_GRID.snapStep}m` : "OFF"}</dd>
          </div>
          <div>
            <dt>숨김</dt>
            <dd>{hiddenObjectCount}</dd>
          </div>
          <div>
            <dt>잠금</dt>
            <dd>{lockedObjectCount}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}

export function StudioEditorPage() {
  const {
    activeCategoryId,
    activeFloor,
    activeTool,
    activeWorkflowMode,
    cameraView,
    gridVisible,
    setActiveCategoryId,
    setActiveFloor,
    setActiveTool,
    setActiveWorkflowMode,
    setCameraView,
    setGridVisible,
    setSnapEnabled,
    setWallViewMode,
    snapEnabled,
    wallViewMode
  } = useStudioEditorState();
  const [activeBuildAsset, setActiveBuildAsset] = useState(null);
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [catalogWidth, setCatalogWidth] = useState(360);
  const [draggedAsset, setDraggedAsset] = useState(null);
  const [dropRequest, setDropRequest] = useState(null);
  const [editorClipboard, setEditorClipboard] = useState(null);
  const [movingAttachment, setMovingAttachment] = useState(null);
  const [movingOpening, setMovingOpening] = useState(null);
  const [generatedAssets, setGeneratedAssets] = useState(() => loadStudioGeneratedAssets());
  const [generationStatus, setGenerationStatus] = useState({ message: "", state: "idle" });
  const [glbCatalogAssets, setGlbCatalogAssets] = useState([]);
  const [libraryAssets, setLibraryAssets] = useState(() => loadStudioAssetLibrary());
  const [objectHistory, setObjectHistory] = useState({ past: [], present: [], future: [] });
  const [recentAssetIds, setRecentAssetIds] = useState([]);
  const [roomDraft, setRoomDraft] = useState(null);
  const [selectedOpening, setSelectedOpening] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [wallAttachmentPreview, setWallAttachmentPreview] = useState(null);
  const [wallDraft, setWallDraft] = useState(null);
  const [wallOpeningPreview, setWallOpeningPreview] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle");
  const sceneImportInputRef = useRef(null);
  const historyTransactionRef = useRef(null);
  const buildable = useMemo(() => getBuildableFootprint(), []);
  const activeFloorBaseY = useMemo(() => getFloorBaseY(activeFloor), [activeFloor]);
  const objects = objectHistory.present;
  const allCatalogAssets = useMemo(
    () => [...STUDIO_CATALOG_ASSETS, ...glbCatalogAssets, ...generatedAssets, ...libraryAssets],
    [generatedAssets, glbCatalogAssets, libraryAssets]
  );
  const findCatalogAsset = useMemo(() => {
    const catalogMap = new Map(allCatalogAssets.map((asset) => [asset.id, asset]));
    return (assetId) => catalogMap.get(assetId) ?? null;
  }, [allCatalogAssets]);
  const canRedoObjects = objectHistory.future.length > 0;
  const canUndoObjects = objectHistory.past.length > 0;
  const pascalSceneGraph = useMemo(
    () =>
      buildStudioPascalSceneGraph(objects, {
        activeFloor,
        catalogAssets: allCatalogAssets,
        floorHeight: EDITOR_FLOORS.floorHeight
      }),
    [activeFloor, allCatalogAssets, objects]
  );
  const assetTaxonomy = useMemo(() => normalizeAssetCatalogTaxonomy(allCatalogAssets), [allCatalogAssets]);
  const assetTaxonomySummary = useMemo(() => summarizeAssetTaxonomy(assetTaxonomy), [assetTaxonomy]);
  const catalogPolicy = useMemo(
    () =>
      validateCatalogPolicy(allCatalogAssets, {
        categories: STUDIO_CATALOG_CATEGORIES
      }),
    [allCatalogAssets]
  );
  const floorplanInterop = useMemo(
    () =>
      buildStudioFloorplanInterop(objects, {
        activeFloor,
        floorHeight: EDITOR_FLOORS.floorHeight
      }),
    [activeFloor, objects]
  );
  const activeRoofAsset = activeBuildAsset && requiresRoomHost(activeBuildAsset) ? activeBuildAsset : null;
  const activeRoomAsset = activeBuildAsset?.placementMode === "draw-room" ? activeBuildAsset : null;
  const activeWallAttachmentAsset = activeBuildAsset?.placementMode === "wall-attached" ? activeBuildAsset : null;
  const activeWallDrawAsset = activeBuildAsset?.placementMode === "draw-wall" ? activeBuildAsset : null;
  const activeWallOpeningAsset = activeBuildAsset?.placementMode === "wall-opening" ? activeBuildAsset : null;
  const interactionMode = useMemo(
    () =>
      getEditorInteractionMode({
        activeRoofAsset,
        activeRoomAsset,
        activeTool,
        activeWallAttachmentAsset,
        activeWallDrawAsset,
        activeWallOpeningAsset,
        cameraView,
        movingAttachment,
        movingOpening
      }),
    [
      activeRoofAsset,
      activeRoomAsset,
      activeTool,
      activeWallAttachmentAsset,
      activeWallDrawAsset,
      activeWallOpeningAsset,
      cameraView,
      movingAttachment,
      movingOpening
    ]
  );
  const activeModeLabel = INTERACTION_MODE_LABELS[interactionMode.key] ?? interactionMode.key;
  const attachmentNodes = useMemo(() => collectAttachmentNodes(objects), [objects]);
  const attachmentNodeSummary = useMemo(() => summarizeAttachmentNodes(attachmentNodes), [attachmentNodes]);
  const attachmentCount = attachmentNodeSummary.total;
  const joinedWallCount = objects.filter((object) => (object.metadata?.wallJoin?.sourceCount ?? 1) > 1).length;
  const hiddenObjectCount = objects.filter(isObjectHidden).length;
  const lockedObjectCount = objects.filter(isObjectLocked).length;
  const openingNodes = useMemo(() => collectOpeningNodes(objects), [objects]);
  const openingNodeSummary = useMemo(() => summarizeOpeningNodes(openingNodes), [openingNodes]);
  const openingCount = openingNodeSummary.total;
  const roomCount = objects.filter((object) => object.type === "room").length;

  const resetTransientState = ({ clearSelection = true } = {}) => {
    setMovingAttachment(null);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
    if (clearSelection) {
      setSelectedAttachment(null);
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedOpening(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadStudioGlbCatalog()
      .then((assets) => {
        if (!cancelled) setGlbCatalogAssets(assets);
      })
      .catch((error) => {
        console.warn("GLB catalog could not be loaded.", error);
        if (!cancelled) setGlbCatalogAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearHostedToolState = () => {
    setActiveBuildAsset(null);
    setMovingAttachment(null);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
  };

  const setObjects = (updater, options = {}) => {
    setObjectHistory((current) => {
      const nextObjects = typeof updater === "function" ? updater(current.present) : updater;
      if (nextObjects === current.present) return current;
      const historyKey = options.historyKey ?? null;
      const continuingTransaction = Boolean(historyKey && historyTransactionRef.current === historyKey);
      if (historyKey) {
        historyTransactionRef.current = historyKey;
      } else {
        historyTransactionRef.current = null;
      }
      return {
        past: continuingTransaction
          ? current.past
          : [...current.past, current.present].slice(-EDITOR_HISTORY_LIMIT),
        present: nextObjects,
        future: []
      };
    });
  };

  const createScenePayload = () => ({
    activeCategoryId,
    activeWorkflowMode,
    catalogCollapsed,
    catalogWidth,
    activeFloor,
    cameraView,
    floorplanInterop,
    gridVisible,
    attachmentNodes,
    assetTaxonomy,
    assetTaxonomySummary,
    catalogPolicy: {
      assetCount: catalogPolicy.assetCount,
      ok: catalogPolicy.ok,
      summary: catalogPolicy.summary
    },
    objects,
    openingNodes,
    pascalSceneGraph,
    recentAssetIds,
    savedAt: new Date().toISOString(),
    schemaVersion: STUDIO_EDITOR_SCHEMA_VERSION,
    snapEnabled,
    source: "ploton-studio-editor",
    wallViewMode,
    summary: {
      attachmentCount,
      attachmentNodeCount: attachmentNodeSummary.total,
      attachmentNodesByHostType: attachmentNodeSummary.byHostType,
      attachmentNodesByType: attachmentNodeSummary.byType,
      assetTaxonomyByEditKind: assetTaxonomySummary.byEditKind,
      assetTaxonomyByPhase: assetTaxonomySummary.byPhase,
      assetTaxonomyBySystem: assetTaxonomySummary.bySystem,
      assetTaxonomyCount: assetTaxonomySummary.total,
      catalogPolicyAssetCount: catalogPolicy.assetCount,
      catalogPolicyOk: catalogPolicy.ok,
      floorplanAreaCount: floorplanInterop.summary.areaCount,
      floorplanHoleCount: floorplanInterop.summary.holeCount,
      floorplanLineCount: floorplanInterop.summary.lineCount,
      hiddenObjectCount,
      joinedWallCount,
      lockedObjectCount,
      sceneGraphLevelCount: pascalSceneGraph.summary.levelCount,
      sceneGraphNodeCount: pascalSceneGraph.summary.nodeCount,
      objectCount: objects.length,
      openingCount,
      openingNodeCount: openingNodeSummary.total,
      openingNodesByHostType: openingNodeSummary.byHostType,
      openingNodesByType: openingNodeSummary.byType,
      roomCount
    }
  });

  const applyScenePayload = (payload) => {
    const nextObjects = Array.isArray(payload?.objects) ? payload.objects : [];
    historyTransactionRef.current = null;
    setObjectHistory({ past: [], present: nextObjects, future: [] });
    setActiveFloor(Number.isFinite(payload?.activeFloor) ? payload.activeFloor : 1);
    setCameraView(normalizeCameraView(payload?.cameraView));
    setActiveCategoryId(payload?.activeCategoryId ?? "roof");
    setActiveWorkflowMode(
      STUDIO_WORKFLOW_MODES.some((mode) => mode.id === payload?.activeWorkflowMode)
        ? payload.activeWorkflowMode
        : "build"
    );
    setCatalogCollapsed(Boolean(payload?.catalogCollapsed));
    setCatalogWidth(clampCatalogWidth(Number.isFinite(payload?.catalogWidth) ? payload.catalogWidth : 360));
    setRecentAssetIds(Array.isArray(payload?.recentAssetIds) ? payload.recentAssetIds.slice(0, 8) : []);
    setGridVisible(payload?.gridVisible !== false);
    setSnapEnabled(payload?.snapEnabled !== false);
    setWallViewMode(WALL_VIEW_MODES.some((mode) => mode.id === payload?.wallViewMode) ? payload.wallViewMode : "cutaway");
    setActiveBuildAsset(null);
    setDraggedAsset(null);
    setDropRequest(null);
    resetTransientState();
    setLastSavedAt(payload?.savedAt ?? payload?.serverSavedAt ?? null);
  };

  const saveScene = async () => {
    const payload = createScenePayload();
    localStorage.setItem(STUDIO_EDITOR_STORAGE_KEY, JSON.stringify(payload));
    setLastSavedAt(payload.savedAt);
    setSaveStatus("saving");

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(STUDIO_EDITOR_PROJECT_ID)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "저장 실패");
      localStorage.setItem(STUDIO_EDITOR_STORAGE_KEY, JSON.stringify(result.data));
      setLastSavedAt(result.data.serverSavedAt ?? result.data.savedAt ?? payload.savedAt);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("local");
    }
  };

  const loadScene = async () => {
    setSaveStatus("loading");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(STUDIO_EDITOR_PROJECT_ID)}`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "불러오기 실패");
      applyScenePayload(result.data);
      localStorage.setItem(STUDIO_EDITOR_STORAGE_KEY, JSON.stringify(result.data));
      setSaveStatus("saved");
      return;
    } catch {
      const raw = localStorage.getItem(STUDIO_EDITOR_STORAGE_KEY);
      if (!raw) {
        setSaveStatus("error");
        return;
      }
      try {
        const payload = JSON.parse(raw);
        applyScenePayload(payload);
        setSaveStatus("local");
      } catch {
        localStorage.removeItem(STUDIO_EDITOR_STORAGE_KEY);
        setSaveStatus("error");
      }
    }
  };

  const exportSceneJson = () => {
    const payload = createScenePayload();
    const envelope = createProjectExportEnvelope("ploton-studio-scene", payload);
    downloadJsonFile(`ploton-studio-scene-${formatExportTimestamp()}.json`, envelope);
    setSaveStatus("local");
  };

  const exportPascalSceneGraphJson = () => {
    const envelope = createProjectExportEnvelope("ploton-pascal-scene-graph", pascalSceneGraph);
    downloadJsonFile(`ploton-pascal-scene-graph-${formatExportTimestamp()}.json`, envelope);
  };

  const exportFloorplanInteropJson = () => {
    const envelope = createProjectExportEnvelope("ploton-floorplan-interop", floorplanInterop);
    downloadJsonFile(`ploton-floorplan-interop-${formatExportTimestamp()}.json`, envelope);
  };

  const requestSceneFileImport = () => {
    sceneImportInputRef.current?.click();
  };

  const importSceneFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setSaveStatus("loading");
    try {
      const text = await readFileText(file);
      const payload = unwrapImportedScenePayload(JSON.parse(text));
      if (!Array.isArray(payload?.objects)) {
        throw new Error("PLOT:ON Studio 씬 JSON이 아닙니다.");
      }
      applyScenePayload(payload);
      localStorage.setItem(STUDIO_EDITOR_STORAGE_KEY, JSON.stringify(payload));
      setSaveStatus("local");
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem(STUDIO_EDITOR_STORAGE_KEY);
    if (!raw) return;

    try {
      applyScenePayload(JSON.parse(raw));
      setSaveStatus("local");
    } catch {
      localStorage.removeItem(STUDIO_EDITOR_STORAGE_KEY);
      setSaveStatus("error");
    }
  }, []);

  const undoObjects = () => {
    historyTransactionRef.current = null;
    setObjectHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, EDITOR_HISTORY_LIMIT)
      };
    });
    resetTransientState({ clearSelection: false });
  };

  const redoObjects = () => {
    historyTransactionRef.current = null;
    setObjectHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      return {
        past: [...current.past, current.present].slice(-EDITOR_HISTORY_LIMIT),
        present: next,
        future: current.future.slice(1)
      };
    });
    resetTransientState({ clearSelection: false });
  };

  const handleFloorChange = (floor) => {
    const nextFloor = Math.max(EDITOR_FLOORS.min, Math.round(Number(floor) || EDITOR_FLOORS.min));
    setActiveFloor(nextFloor);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
  };

  const handleToolChange = (toolId) => {
    if (toolId === "undo") {
      undoObjects();
      return;
    }
    if (toolId === "redo") {
      redoObjects();
      return;
    }
    if (toolId === "snap") {
      setSnapEnabled((value) => !value);
      return;
    }
    if (toolId === "duplicate") {
      duplicateSelectedObject();
      return;
    }
    setActiveBuildAsset(null);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
    if (toolId === "erase") {
      setActiveTool((current) => (current === "erase" ? "select" : "erase"));
      return;
    }
    setActiveTool(toolId);
  };

  const handleCameraViewChange = (nextView) => {
    const normalizedNextView = normalizeCameraView(nextView);
    if (normalizedNextView === "top") {
      setActiveTool((current) => (current === "rotate" ? "select" : current));
    }
    setCameraView(normalizedNextView);
  };

  const handleCatalogResizeStart = (event) => {
    event.preventDefault();
    setCatalogCollapsed(false);
    const startX = event.clientX;
    const startWidth = catalogWidth;

    const handlePointerMove = (moveEvent) => {
      setCatalogWidth(clampCatalogWidth(startWidth + moveEvent.clientX - startX));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  const handleCategoryChange = (categoryId) => {
    setActiveCategoryId(categoryId);
    if (categoryId !== activeBuildAsset?.categoryId) {
      setActiveBuildAsset(null);
      setMovingOpening(null);
      setRoomDraft(null);
      setWallAttachmentPreview(null);
      setWallDraft(null);
      setWallOpeningPreview(null);
    }
  };

  const handleCatalogAssetPick = (asset) => {
    if (!asset || !asset.placementMode) {
      setActiveBuildAsset(null);
      setMovingOpening(null);
      setRoomDraft(null);
      setWallDraft(null);
      setWallOpeningPreview(null);
      return;
    }
    setRecentAssetIds((current) => [asset.id, ...current.filter((assetId) => assetId !== asset.id)].slice(0, 8));
    setActiveBuildAsset(asset);
    setActiveTool("select");
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
  };

  const saveSelectedObjectToLibrary = () => {
    if (selectedAttachment || selectedOpening) return null;
    if (!selectedObject || selectedObjectHidden || selectedObjectLocked) return null;
    const nextAsset = createLibraryAssetFromObject(selectedObject, {
      label: selectedObject.name,
      savedAt: new Date().toISOString()
    });
    if (!nextAsset) return null;

    const nextLibraryAssets = upsertStudioLibraryAsset(libraryAssets, nextAsset);
    setLibraryAssets(saveStudioAssetLibrary(nextLibraryAssets));
    setRecentAssetIds((current) => [nextAsset.id, ...current.filter((assetId) => assetId !== nextAsset.id)].slice(0, 8));
    setActiveWorkflowMode("build");
    setActiveCategoryId(nextAsset.categoryId);
    setActiveBuildAsset(nextAsset);
    return nextAsset;
  };

  const generateCatalogAssetFromPrompt = async (prompt) => {
    const trimmedPrompt = String(prompt ?? "").trim();
    if (!trimmedPrompt) return { ok: false };
    setGenerationStatus({ message: "Text-to-CAD 작업 요청 중", state: "loading" });

    try {
      const response = await fetch("/api/text-to-cad/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Text-to-CAD 생성 실패");

      const nextAsset = createGeneratedCatalogAssetFromJob(result.data);
      if (!nextAsset) throw new Error("생성 결과를 카탈로그 자산으로 변환하지 못했습니다.");

      const nextGeneratedAssets = upsertStudioGeneratedAsset(generatedAssets, nextAsset);
      setGeneratedAssets(saveStudioGeneratedAssets(nextGeneratedAssets));
      setRecentAssetIds((current) => [nextAsset.id, ...current.filter((assetId) => assetId !== nextAsset.id)].slice(0, 8));
      setActiveWorkflowMode("items");
      setActiveCategoryId(nextAsset.categoryId);
      setActiveBuildAsset(nextAsset.placementMode ? nextAsset : null);
      setGenerationStatus({ message: `${nextAsset.label} 생성 완료`, state: "ready" });
      return { asset: nextAsset, ok: true };
    } catch (error) {
      setGenerationStatus({ message: error.message ?? "생성 실패", state: "error" });
      return { ok: false };
    }
  };

  const generateSceneFromBrief = async (brief) => {
    const trimmedBrief = String(brief ?? "").trim();
    if (!trimmedBrief) return { ok: false };
    setGenerationStatus({ message: "AI 집 초안 생성 중", state: "loading" });

    try {
      const response = await fetch("/api/scenes/from-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: trimmedBrief
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? "집 초안 생성 실패");

      applyScenePayload({
        ...result.data,
        activeWorkflowMode: "build",
        cameraView: "orbit"
      });
      setGenerationStatus({
        message: `집 초안 생성 완료 · ${result.data?.summary?.roomCount ?? 0} rooms`,
        state: "ready"
      });
      return { ok: true, scene: result.data };
    } catch (error) {
      setGenerationStatus({ message: error.message ?? "집 초안 생성 실패", state: "error" });
      return { ok: false };
    }
  };

  const activeToolLabel = activeBuildAsset?.label ?? EDITOR_TOOLS.find((tool) => tool.id === activeTool)?.label ?? "선택";
  const activeCategoryLabel =
    STUDIO_CATALOG_CATEGORIES.find((category) => category.id === activeCategoryId)?.label ?? "자산";
  const selectedObject = objects.find((object) => object.id === selectedObjectId);
  const selectedObjectIdSet = new Set(selectedObjectIds);
  const selectedObjects = objects.filter((object) => selectedObjectIdSet.has(object.id));
  const selectedObjectHidden = isObjectHidden(selectedObject);
  const selectedObjectLocked = isObjectLocked(selectedObject);
  const selectedResizeHostRoomId =
    selectedObject?.metadata?.attachedRoomId && activeTool === "scale"
      ? selectedObject.metadata.attachedRoomId
      : null;
  const selectedOpeningObject = selectedOpening
    ? (() => {
        const host = objects.find((object) => object.id === (selectedOpening.roomId ?? selectedOpening.wallObjectId));
        const openingNode = findOpeningNode(openingNodes, selectedOpening);
        const opening = host?.room?.openings?.find((opening) => opening.id === selectedOpening.openingId)
          ?? host?.wallOpenings?.find((opening) => opening.id === selectedOpening.openingId)
          ?? null;
        return opening && openingNode
          ? { ...opening, hostLabel: openingNode.hostLabel, hostType: openingNode.hostType, nodeId: openingNode.id }
          : opening ?? openingNode;
      })()
    : null;
  const selectedAttachmentObject = selectedAttachment
    ? (() => {
        const host = objects.find((object) => object.id === (selectedAttachment.roomId ?? selectedAttachment.wallObjectId));
        const attachmentNode = findAttachmentNode(attachmentNodes, selectedAttachment);
        const attachment = host?.room?.attachments?.find((attachment) => attachment.id === selectedAttachment.attachmentId)
          ?? host?.wallAttachments?.find((attachment) => attachment.id === selectedAttachment.attachmentId)
          ?? null;
        return attachment && attachmentNode
          ? { ...attachment, hostLabel: attachmentNode.hostLabel, hostType: attachmentNode.hostType, nodeId: attachmentNode.id }
          : attachment ?? attachmentNode;
      })()
    : null;
  const selectedTransformLabel = selectedObject
    ? `r:${Math.round((((selectedObject.rotation?.[1] ?? 0) * 180) / Math.PI + 360) % 360)}deg / ${selectedObject.size?.[0] ?? 1}x${selectedObject.size?.[2] ?? 1}m`
    : "none";
  const selectedHudLabel = selectedAttachmentObject?.label ?? selectedOpeningObject?.label ?? (selectedObjects.length > 1 ? `${selectedObjects.length} selected` : selectedObject?.name) ?? "none";
  const draftHudLabel = wallDraft?.label ?? roomDraft?.label ?? wallOpeningPreview?.label ?? wallAttachmentPreview?.label ?? null;
  const activePlacementAsset = draggedAsset ?? movingOpening?.asset ?? movingAttachment?.asset ?? activeBuildAsset;
  const placementFeedback = getPlacementFeedback({
    activePlacementAsset,
    objects,
    roomDraft,
    wallAttachmentPreview,
    wallDraft,
    wallOpeningPreview
  });

  useEffect(() => {
    const existingObjectIds = new Set(objects.map((object) => object.id));

    if (selectedObjectId && !objects.some((object) => object.id === selectedObjectId)) {
      setSelectedObjectId(null);
      setSelectedAttachment(null);
      setSelectedOpening(null);
      return;
    }

    if (selectedOpening || selectedAttachment) {
      if (selectedObjectIds.length) setSelectedObjectIds([]);
    } else if (selectedObjectId) {
      const nextSelectedObjectIds = selectedObjectIds
        .filter((objectId) => existingObjectIds.has(objectId));
      if (!nextSelectedObjectIds.includes(selectedObjectId)) nextSelectedObjectIds.push(selectedObjectId);
      if (!areSameIdLists(nextSelectedObjectIds, selectedObjectIds)) setSelectedObjectIds(nextSelectedObjectIds);
    } else if (selectedObjectIds.length) {
      setSelectedObjectIds([]);
    }

    if (selectedOpening) {
      const hostId = selectedOpening.roomId ?? selectedOpening.wallObjectId;
      const host = objects.find((object) => object.id === hostId);
      const openingExists =
        host?.room?.openings?.some((opening) => opening.id === selectedOpening.openingId) ||
        host?.wallOpenings?.some((opening) => opening.id === selectedOpening.openingId);
      if (!openingExists) setSelectedOpening(null);
    }

    if (selectedAttachment) {
      const hostId = selectedAttachment.roomId ?? selectedAttachment.wallObjectId;
      const host = objects.find((object) => object.id === hostId);
      const attachmentExists =
        host?.room?.attachments?.some((attachment) => attachment.id === selectedAttachment.attachmentId) ||
        host?.wallAttachments?.some((attachment) => attachment.id === selectedAttachment.attachmentId);
      if (!attachmentExists) setSelectedAttachment(null);
    }
  }, [objects, selectedAttachment, selectedObjectId, selectedObjectIds, selectedOpening]);

  const snapToGridCenter = (value) => {
    if (!snapEnabled) return Number(value.toFixed(2));
    const step = EDITOR_GRID.snapStep;
    return Number((Math.round(value / step) * step).toFixed(2));
  };

  const clampToBuildableCell = (value, axisSize, objectSize = 1) => {
    const half = axisSize / 2;
    const margin = objectSize / 2;
    const cellCenter = snapToGridCenter(value);
    return Number(Math.min(half - margin, Math.max(-half + margin, cellCenter)).toFixed(2));
  };

  const clampToBuildableBoundary = (value, axisSize) => {
    const half = axisSize / 2;
    const snapped = snapToGridCenter(value);
    return Number(Math.min(half, Math.max(-half, snapped)).toFixed(2));
  };

  const createRoomDraftFromPoints = (startPoint, endPoint, asset, currentObjects = objects) => {
    if (!startPoint || !endPoint || !asset) return null;

    const startX = clampToBuildableBoundary(startPoint.x, buildable.width);
    const endX = clampToBuildableBoundary(endPoint.x, buildable.width);
    const startZ = clampToBuildableBoundary(startPoint.z, buildable.depth);
    const endZ = clampToBuildableBoundary(endPoint.z, buildable.depth);
    const width = Number(Math.abs(endX - startX).toFixed(2));
    const depth = Number(Math.abs(endZ - startZ).toFixed(2));
    const minRoomSize = EDITOR_GRID.snapStep * 2;
    const wallHeight = asset.wallHeight ?? asset.size?.[1] ?? 2.7;
    const wallThickness = asset.wallThickness ?? 0.16;
    const sizeValid = width >= minRoomSize && depth >= minRoomSize;
    const draft = {
      asset,
      label: `${width}m x ${depth}m`,
      position: [
        Number(((startX + endX) / 2).toFixed(2)),
        activeFloorBaseY,
        Number(((startZ + endZ) / 2).toFixed(2))
      ],
      size: [width, wallHeight, depth],
      floor: activeFloor,
      valid: sizeValid,
      wallThickness
    };
    const placement = validateRoomPlacement({
      activeFloor,
      buildable,
      candidate: draft,
      floorHeight: EDITOR_FLOORS.floorHeight,
      objects: currentObjects
    });
    const reasonLabel = placement.reason ? PLACEMENT_REASON_LABELS[placement.reason] : null;

    return {
      ...draft,
      invalidReason: placement.reason,
      label: reasonLabel ? `${draft.label} · ${reasonLabel}` : draft.label,
      supported: placement.supported,
      unsupportedPoints: placement.unsupportedPoints,
      valid: draft.valid && placement.valid
    };
  };

  const createWallDraftFromPoints = (startPoint, endPoint, asset, currentObjects = objects) => {
    return createPascalWallDraft({
      activeFloor,
      activeFloorBaseY,
      asset,
      buildable,
      endPoint,
      floorHeight: EDITOR_FLOORS.floorHeight,
      objects: currentObjects,
      snapEnabled,
      snapStep: EDITOR_GRID.snapStep,
      startPoint
    });
  };

  const getWallLength = (room, wall) => {
    const [roomWidth = 1, , roomDepth = 1] = room.size ?? [1, 2.7, 1];
    return wall === "north" || wall === "south" ? roomWidth : roomDepth;
  };

  const rangesOverlap = (firstStart, firstEnd, secondStart, secondEnd) =>
    firstStart < secondEnd - 0.001 && secondStart < firstEnd - 0.001;

  const getOpeningHostId = (openingRef) => openingRef?.roomId ?? openingRef?.wallObjectId ?? null;
  const getAttachmentHostId = (attachmentRef) => attachmentRef?.roomId ?? attachmentRef?.wallObjectId ?? null;

  const getOpeningHostFromHit = (hit) => {
    if (hit?.roomId) return objects.find((object) => object.id === hit.roomId && object.type === "room") ?? null;
    if (hit?.wallObjectId) return objects.find((object) => object.id === hit.wallObjectId && isStructuralWallObject(object)) ?? null;
    return null;
  };

  const getAttachmentHostFromHit = (hit) => getOpeningHostFromHit(hit);

  const getOpeningHostLength = (host, wall) => {
    if (host?.type === "room") return getWallLength(host, wall);
    return host?.size?.[0] ?? 1;
  };

  const getOpeningHostOpenings = (host) => host?.room?.openings ?? host?.wallOpenings ?? [];
  const getAttachmentHostAttachments = (host) => host?.room?.attachments ?? host?.wallAttachments ?? [];
  const getHostedWallSurfaceKey = (host, wall) => {
    if (isStructuralWallObject(host)) return "body";
    return wall;
  };
  const isSameHostedWallSurface = (host, firstWall, secondWall) =>
    getHostedWallSurfaceKey(host, firstWall) === getHostedWallSurfaceKey(host, secondWall);

  const hasOpeningOverlap = (host, candidate, movingOpeningRef = null) =>
    getOpeningHostOpenings(host).some((opening) => {
      if (movingOpeningRef?.openingId === opening.id) return false;
      if (!isSameHostedWallSurface(host, opening.wall, candidate.wall)) return false;
      const horizontalOverlap = rangesOverlap(
        candidate.offset - candidate.width / 2,
        candidate.offset + candidate.width / 2,
        opening.offset - opening.width / 2,
        opening.offset + opening.width / 2
      );
      const verticalOverlap = rangesOverlap(
        candidate.sillHeight,
        candidate.sillHeight + candidate.height,
        opening.sillHeight,
        opening.sillHeight + opening.height
      );
      return horizontalOverlap && verticalOverlap;
    });

  const hasWallAttachmentOverlap = (host, candidate, movingAttachmentRef = null) => {
    const candidateStartY = candidate.centerY - candidate.height / 2;
    const candidateEndY = candidate.centerY + candidate.height / 2;
    const overlapsOpening = getOpeningHostOpenings(host).some((opening) => {
      if (!isSameHostedWallSurface(host, opening.wall, candidate.wall)) return false;
      const horizontalOverlap = rangesOverlap(
        candidate.offset - candidate.width / 2,
        candidate.offset + candidate.width / 2,
        opening.offset - opening.width / 2,
        opening.offset + opening.width / 2
      );
      const verticalOverlap = rangesOverlap(
        candidateStartY,
        candidateEndY,
        opening.sillHeight,
        opening.sillHeight + opening.height
      );
      return horizontalOverlap && verticalOverlap;
    });
    const overlapsAttachment = getAttachmentHostAttachments(host).some((attachment) => {
      if (movingAttachmentRef?.attachmentId === attachment.id) return false;
      if (!isSameHostedWallSurface(host, attachment.wall, candidate.wall)) return false;
      const horizontalOverlap = rangesOverlap(
        candidate.offset - candidate.width / 2,
        candidate.offset + candidate.width / 2,
        attachment.offset - attachment.width / 2,
        attachment.offset + attachment.width / 2
      );
      const verticalOverlap = rangesOverlap(
        candidateStartY,
        candidateEndY,
        attachment.centerY - attachment.height / 2,
        attachment.centerY + attachment.height / 2
      );
      return horizontalOverlap && verticalOverlap;
    });
    return overlapsOpening || overlapsAttachment;
  };

  const createWallOpeningCandidate = (hit, asset, movingOpeningRef = null) => {
    if (!hit || !asset) return null;

    const host = getOpeningHostFromHit(hit);
    if (!host) return null;

    const [, wallHeight = 2.7] = host.size ?? [1, 2.7, 1];
    const [openingWidth = 1, openingHeight = 1] = asset.openingSize ?? [asset.size?.[0] ?? 1, asset.size?.[1] ?? 1];
    const wallLength = getOpeningHostLength(host, hit.wall);
    const margin = 0.12;
    const minOffset = -wallLength / 2 + openingWidth / 2 + margin;
    const maxOffset = wallLength / 2 - openingWidth / 2 - margin;
    const isDoor = (asset.openingType ?? "window") === "door";
    const minCenterY = openingHeight / 2 + margin;
    const maxCenterY = wallHeight - openingHeight / 2 - margin;
    const rawOffset = hit.offset;
    const rawCenterY = isDoor ? openingHeight / 2 : hit.height;
    const snappedOffset = snapToGridCenter(rawOffset);
    const snappedCenterY = isDoor ? openingHeight / 2 : snapToGridCenter(rawCenterY);
    const offset = Number(Math.min(maxOffset, Math.max(minOffset, snappedOffset)).toFixed(2));
    const centerY = Number(Math.min(maxCenterY, Math.max(minCenterY, snappedCenterY)).toFixed(2));
    const edgeValid = minOffset <= maxOffset && minCenterY <= maxCenterY;
    const withinWall =
      edgeValid &&
      rawOffset >= minOffset &&
      rawOffset <= maxOffset &&
      (isDoor || (rawCenterY >= minCenterY && rawCenterY <= maxCenterY));
    const sillHeight = isDoor ? 0 : Number((centerY - openingHeight / 2).toFixed(2));
    const candidate = {
      assetId: asset.id,
      color: asset.color,
      frameDepth: asset.frameDepth ?? 0.18,
      height: openingHeight,
      id: movingOpeningRef?.openingId ?? `opening-${crypto.randomUUID?.() ?? Date.now()}`,
      label: asset.label,
      offset,
      roomId: host.type === "room" ? host.id : undefined,
      sillHeight,
      type: asset.openingType ?? "window",
      valid: true,
      wall: hit.wall,
      wallObjectId: isStructuralWallObject(host) ? host.id : undefined,
      width: openingWidth
    };
    const blocked = hasOpeningOverlap(host, candidate, movingOpeningRef);

    return {
      ...candidate,
      valid: withinWall && !blocked,
      invalidReason: !withinWall ? "out-of-wall" : blocked ? "overlap" : null
    };
  };

  const createWallAttachmentCandidate = (hit, asset, movingAttachmentRef = null) => {
    if (!hit || !asset) return null;

    const host = getAttachmentHostFromHit(hit);
    if (!host) return null;

    const [, wallHeight = 2.7] = host.size ?? [1, 2.7, 1];
    const [attachmentWidth = 1, attachmentHeight = 0.3] = asset.attachmentSize ?? [asset.size?.[0] ?? 1, asset.size?.[1] ?? 0.3];
    const wallLength = getOpeningHostLength(host, hit.wall);
    const margin = 0.08;
    const minOffset = -wallLength / 2 + attachmentWidth / 2 + margin;
    const maxOffset = wallLength / 2 - attachmentWidth / 2 - margin;
    const minCenterY = attachmentHeight / 2 + margin;
    const maxCenterY = wallHeight - attachmentHeight / 2 - margin;
    const rawOffset = hit.offset;
    const rawCenterY = hit.height;
    const offset = Number(Math.min(maxOffset, Math.max(minOffset, snapToGridCenter(rawOffset))).toFixed(2));
    const centerY = Number(Math.min(maxCenterY, Math.max(minCenterY, snapToGridCenter(rawCenterY))).toFixed(2));
    const edgeValid = minOffset <= maxOffset && minCenterY <= maxCenterY;
    const withinWall =
      edgeValid &&
      rawOffset >= minOffset &&
      rawOffset <= maxOffset &&
      rawCenterY >= minCenterY &&
      rawCenterY <= maxCenterY;
    const candidate = {
      assetId: asset.id,
      centerY,
      color: asset.color,
      depth: asset.attachDepth ?? 0.06,
      height: attachmentHeight,
      id: movingAttachmentRef?.attachmentId ?? `attachment-${crypto.randomUUID?.() ?? Date.now()}`,
      label: asset.label,
      offset,
      roomId: host.type === "room" ? host.id : undefined,
      shape: asset.shape,
      type: asset.placementMode,
      valid: true,
      wall: hit.wall,
      wallObjectId: isStructuralWallObject(host) ? host.id : undefined,
      width: attachmentWidth
    };
    const blocked = hasWallAttachmentOverlap(host, candidate, movingAttachmentRef);

    return {
      ...candidate,
      valid: withinWall && !blocked,
      invalidReason: !withinWall ? "out-of-wall" : blocked ? "overlap" : null
    };
  };

  const isInsideBuildable = ([x, , z], size = [1, 1, 1]) => {
    const halfWidth = buildable.width / 2;
    const halfDepth = buildable.depth / 2;
    return (
      x >= -halfWidth + size[0] / 2 &&
      x <= halfWidth - size[0] / 2 &&
      z >= -halfDepth + size[2] / 2 &&
      z <= halfDepth - size[2] / 2
    );
  };

  const hasBoxOverlap = (position, size, other) => {
    const otherSize = other.size ?? [1, 1, 1];
    return (
      Math.abs(position[0] - other.position[0]) < (size[0] + otherSize[0]) / 2 - 0.001 &&
      Math.abs(position[1] - other.position[1]) < (size[1] + otherSize[1]) / 2 - 0.001 &&
      Math.abs(position[2] - other.position[2]) < (size[2] + otherSize[2]) / 2 - 0.001
    );
  };

  const hasFootprintOverlap = (bounds, object) => {
    const [width = 1, , depth = 1] = object.size ?? [1, 1, 1];
    const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
    const minX = x - width / 2;
    const maxX = x + width / 2;
    const minZ = z - depth / 2;
    const maxZ = z + depth / 2;
    return (
      minX <= bounds.maxX &&
      maxX >= bounds.minX &&
      minZ <= bounds.maxZ &&
      maxZ >= bounds.minZ
    );
  };

  const hasSamePosition = (first, second) =>
    first.every((value, index) => Math.abs(value - second[index]) < 0.001);

  const hasSameVector = (first = [], second = []) =>
    first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) < 0.001);

  const isBlockingCollision = (object) => object.type !== "room";
  const isTransformLockedObject = (object) => isObjectLocked(object) || isObjectHidden(object) || object?.type === "room" || isStructuralWallObject(object);
  const canSkipTransformCollision = (object) => requiresRoomHost(object);
  const canOverlapCatalogObjects = (candidate, other) =>
    canOverlapSameCategory(candidate, other);
  const hasBlockingCatalogCollision = (position, size, candidate, currentObjects, ignoreObjectId = null) =>
    currentObjects.some(
      (object) =>
        object.id !== ignoreObjectId &&
        isBlockingCollision(object) &&
        hasBoxOverlap(position, size, object) &&
        !canOverlapCatalogObjects(candidate, object)
    );

  const isGroupMoveEligibleObject = (object) =>
    Boolean(
      object &&
      !isObjectLocked(object) &&
      !isObjectHidden(object) &&
      object.type !== "room" &&
      !isStructuralWallObject(object) &&
      !canSkipTransformCollision(object)
    );

  const normalizeEditablePosition = (position, size) => [
    clampToBuildableCell(position[0], buildable.width, size[0]),
    Number(position[1].toFixed(2)),
    clampToBuildableCell(position[2], buildable.depth, size[2])
  ];

  const areRoomHostedItemsWithinSize = (room, nextSize) => {
    const [width = 1, height = 2.7, depth = 1] = nextSize ?? [1, 2.7, 1];
    const fitsWallOffset = (wall, offset = 0, itemWidth = 0.5) => {
      const wallLength = wall === "north" || wall === "south" ? width : depth;
      const margin = itemWidth / 2 + 0.05;
      return offset >= -wallLength / 2 + margin && offset <= wallLength / 2 - margin;
    };
    const openingsFit = (room.room?.openings ?? []).every((opening) => {
      const verticalFit = opening.sillHeight >= 0 && opening.sillHeight + opening.height <= height + 0.001;
      return verticalFit && fitsWallOffset(opening.wall, opening.offset, opening.width);
    });
    const attachmentsFit = (room.room?.attachments ?? []).every((attachment) => {
      const verticalFit =
        attachment.centerY - attachment.height / 2 >= -0.001 &&
        attachment.centerY + attachment.height / 2 <= height + 0.001;
      return verticalFit && fitsWallOffset(attachment.wall, attachment.offset, attachment.width);
    });
    return openingsFit && attachmentsFit;
  };

  const refreshRoomBoundAssets = (currentObjects, roomId, nextRoom, editSource = "room-sync") => {
    const syncedAt = new Date().toISOString();
    const refreshedRoofs = new Map();
    const withRoofs = currentObjects.map((object) => {
      if (object.metadata?.attachedRoomId !== roomId || object.placementMode !== "roof-attached") return object;
      const asset = findCatalogAsset(object.assetId);
      const nextRoof = createRoofObjectForRoom(nextRoom, asset, { id: object.id });
      if (!nextRoof) return object;
      const refreshed = {
        ...nextRoof,
        metadata: {
          ...nextRoof.metadata,
          lastEditSource: editSource,
          syncedWithRoomAt: syncedAt
        }
      };
      refreshedRoofs.set(object.id, refreshed);
      return refreshed;
    });

    return withRoofs.map((object) => {
      if (object.metadata?.attachedRoomId !== roomId || object.placementMode !== "roof-accessory") return object;
      const asset = findCatalogAsset(object.assetId);
      const attachedRoof =
        refreshedRoofs.get(object.metadata?.attachedRoofId) ??
        withRoofs.find(
          (candidate) =>
            candidate.placementMode === "roof-attached" &&
            candidate.metadata?.attachedRoomId === roomId
        );
      const nextAccessory = createRoofAccessoryObjectForRoom(nextRoom, asset, attachedRoof, { id: object.id });
      if (!nextAccessory) return object;
      return {
        ...nextAccessory,
        metadata: {
          ...nextAccessory.metadata,
          lastEditSource: editSource,
          syncedWithRoomAt: syncedAt
        }
      };
    });
  };

  const createEditorId = (prefix) => `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;

  const cloneHostedItems = (items = [], hostId, hostKey, prefix) =>
    items.map((item) => ({
      ...item,
      id: createEditorId(prefix),
      roomId: hostKey === "roomId" ? hostId : undefined,
      wallObjectId: hostKey === "wallObjectId" ? hostId : undefined
    }));

  const getDuplicateCandidatePositions = (source) => {
    const [x = 0, y = 0, z = 0] = source.position ?? [0, 0, 0];
    const [width = 1, , depth = 1] = source.size ?? [1, 1, 1];
    const step = EDITOR_GRID.snapStep;
    const xStep = Math.max(step, width + step);
    const zStep = Math.max(step, depth + step);
    const offsets = [
      [xStep, 0],
      [-xStep, 0],
      [0, zStep],
      [0, -zStep],
      [xStep, zStep],
      [-xStep, zStep],
      [xStep, -zStep],
      [-xStep, -zStep]
    ];

    return offsets.map(([offsetX, offsetZ]) => {
      const size = source.size ?? [1, 1, 1];
      if (canSkipTransformCollision(source)) {
        return [snapToGridCenter(x + offsetX), Number(y.toFixed(2)), snapToGridCenter(z + offsetZ)];
      }
      return normalizeEditablePosition([x + offsetX, y, z + offsetZ], size);
    });
  };

  const canPlaceDuplicateAt = (source, position, currentObjects, options = {}) => {
    const size = source.size ?? [1, 1, 1];
    const floor = source.room?.floor ?? source.floor ?? activeFloor;
    if (!options.allowSamePosition && hasSamePosition(source.position ?? [0, 0, 0], position)) return false;
    if (source.type === "room") {
      return validateRoomPlacement({
        activeFloor: floor,
        buildable,
        candidate: {
          position,
          size,
          valid: true
        },
        floorHeight: EDITOR_FLOORS.floorHeight,
        objects: currentObjects
      }).valid;
    }

    if (!canSkipTransformCollision(source) && !isInsideBuildable(position, size)) return false;
    if (position[1] < size[1] / 2) return false;
    if (canSkipTransformCollision(source)) return true;
    return !hasBlockingCatalogCollision(position, size, source, currentObjects, options.ignoreObjectId ?? source.id);
  };

  const cloneObjectForDuplicate = (source, position, nextIndex) => {
    const id = createEditorId(source.type === "room" ? "room" : "catalog-object");
    const metadata = {
      ...source.metadata,
      attachedRoofId: source.placementMode?.startsWith("roof") ? null : source.metadata?.attachedRoofId,
      attachedRoomId: source.placementMode?.startsWith("roof") ? null : source.metadata?.attachedRoomId,
      duplicatedAt: new Date().toISOString(),
      duplicatedFrom: source.id,
      lastEditSource: "duplicate-tool",
      placementSource: "duplicate-tool"
    };
    const clone = {
      ...source,
      id,
      name: `${source.name ?? "객체"} 복사본 ${nextIndex}`,
      position,
      metadata
    };

    if (source.room) {
      clone.room = {
        ...source.room,
        attachments: cloneHostedItems(source.room.attachments, id, "roomId", "attachment"),
        openings: cloneHostedItems(source.room.openings, id, "roomId", "opening")
      };
    }
    if (source.wallAttachments) {
      clone.wallAttachments = cloneHostedItems(source.wallAttachments, id, "wallObjectId", "attachment");
    }
    if (source.wallOpenings) {
      clone.wallOpenings = cloneHostedItems(source.wallOpenings, id, "wallObjectId", "opening");
    }
    return clone;
  };

  const hasRestorableLibraryPrefab = (asset) =>
    asset?.librarySource === "mine" &&
    asset?.prefabKind === "single-object" &&
    asset?.sourceSnapshot?.id &&
    Array.isArray(asset.sourceSnapshot.position) &&
    Array.isArray(asset.sourceSnapshot.size);

  const getLibraryPrefabDropPosition = (point, asset) => {
    if (!hasRestorableLibraryPrefab(asset)) return null;
    const source = asset.sourceSnapshot;
    const size = source.size ?? asset.size ?? [1, 1, 1];
    const x = clampToBuildableCell(point.x, buildable.width, size[0]);
    const z = clampToBuildableCell(point.z, buildable.depth, size[2]);
    if (source.type === "room") {
      return [x, activeFloorBaseY, z];
    }

    const sourceFloor = getEditorObjectFloor(source);
    const sourceFloorBaseY = getFloorBaseY(sourceFloor);
    const localY = Math.max(0, Number(((source.position?.[1] ?? size[1] / 2) - sourceFloorBaseY).toFixed(2)));
    return [x, Number((activeFloorBaseY + localY).toFixed(2)), z];
  };

  const createLibraryPrefabObjectForDrop = (asset, position, nextIndex) => {
    if (!hasRestorableLibraryPrefab(asset)) return null;
    const source = asset.sourceSnapshot;
    const clone = cloneObjectForDuplicate(source, position, nextIndex);
    const metadata = {
      ...(clone.metadata ?? {}),
      editor: {},
      floor: `${activeFloor}F`,
      floorBaseY: activeFloorBaseY,
      floorNumber: activeFloor,
      libraryAssetId: asset.id,
      librarySource: "mine",
      lastEditSource: "mine-prefab-drop",
      mineSourceObjectId: asset.sourceObjectId ?? source.id,
      placementSource: "mine-prefab-drop",
      sourceAssetLabel: asset.label
    };
    const nextObject = {
      ...clone,
      assetId: asset.id,
      categoryId: asset.categoryId ?? clone.categoryId,
      color: asset.color ?? clone.color,
      floor: activeFloor,
      name: `${asset.label} ${nextIndex}`,
      metadata,
      position
    };
    if (clone.room) {
      nextObject.room = {
        ...clone.room,
        floor: activeFloor
      };
    }
    return nextObject;
  };

  const createLibraryPrefabObjectAt = (position, asset) => {
    const nextObject = createLibraryPrefabObjectForDrop(asset, position, objects.length + 1);
    if (!nextObject) return null;
    if (!canPlaceDuplicateAt(nextObject, nextObject.position, objects, { allowSamePosition: true, ignoreObjectId: null })) return null;
    return commitCatalogObject(nextObject);
  };

  const cloneRoomBoundAssetsForDuplicate = (sourceRoom, duplicatedRoom, currentObjects) => {
    if (!sourceRoom || sourceRoom.type !== "room" || !duplicatedRoom) return [];
    const sourceBoundAssets = currentObjects.filter((object) => object.metadata?.attachedRoomId === sourceRoom.id);
    const sourceRoofs = sourceBoundAssets.filter((object) => object.placementMode === "roof-attached");
    const clonedRoofBySourceId = new Map();
    const clonedRoofs = sourceRoofs.flatMap((sourceRoof) => {
      const asset = findCatalogAsset(sourceRoof.assetId);
      const clonedRoof = createRoofObjectForRoom(duplicatedRoom, asset, {
        id: createEditorId("catalog-object")
      });
      if (!clonedRoof) return [];
      const nextRoof = {
        ...clonedRoof,
        name: `${duplicatedRoom.name} ${asset?.label ?? sourceRoof.name ?? "지붕"}`,
        metadata: {
          ...clonedRoof.metadata,
          duplicatedFrom: sourceRoof.id,
          lastEditSource: "duplicate-room-bound-roof",
          placementSource: "duplicate-room-bound-roof"
        }
      };
      clonedRoofBySourceId.set(sourceRoof.id, nextRoof);
      return [nextRoof];
    });

    const clonedAccessories = sourceBoundAssets
      .filter((object) => object.placementMode === "roof-accessory")
      .flatMap((sourceAccessory) => {
        const asset = findCatalogAsset(sourceAccessory.assetId);
        const attachedRoof =
          clonedRoofBySourceId.get(sourceAccessory.metadata?.attachedRoofId) ??
          clonedRoofs.find((roof) => roof.metadata?.attachedRoomId === duplicatedRoom.id);
        const clonedAccessory = createRoofAccessoryObjectForRoom(duplicatedRoom, asset, attachedRoof, {
          id: createEditorId("catalog-object")
        });
        if (!clonedAccessory) return [];
        return [
          {
            ...clonedAccessory,
            name: `${duplicatedRoom.name} ${asset?.label ?? sourceAccessory.name ?? "지붕 부속"}`,
            metadata: {
              ...clonedAccessory.metadata,
              duplicatedFrom: sourceAccessory.id,
              lastEditSource: "duplicate-room-bound-roof-accessory",
              placementSource: "duplicate-room-bound-roof-accessory"
            }
          }
        ];
      });

    return [...clonedRoofs, ...clonedAccessories];
  };

  const getSelectedCloneSources = () => {
    if (selectedAttachment || selectedOpening) return [];
    const selectedIds = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    const sourceById = new Map();

    selectedIds.forEach((objectId) => {
      const selectedObject = objects.find((object) => object.id === objectId);
      const source = selectedObject?.metadata?.attachedRoomId
        ? objects.find((object) => object.id === selectedObject.metadata.attachedRoomId && object.type === "room")
        : selectedObject;
      if (!source || isObjectLocked(source) || isObjectHidden(source)) return;
      sourceById.set(source.id, source);
    });

    const selectedRoomIds = new Set(
      [...sourceById.values()]
        .filter((object) => object.type === "room")
        .map((object) => object.id)
    );

    return [...sourceById.values()].filter((object) => {
      const attachedRoomId = object.metadata?.attachedRoomId;
      return !attachedRoomId || !selectedRoomIds.has(attachedRoomId);
    });
  };

  const getClonePositionsForSources = (sources, currentObjects = objects) => {
    const anchor = sources[0];
    if (!anchor) return null;

    for (const anchorPosition of getDuplicateCandidatePositions(anchor)) {
      const delta = [
        Number((anchorPosition[0] - anchor.position[0]).toFixed(2)),
        Number((anchorPosition[1] - anchor.position[1]).toFixed(2)),
        Number((anchorPosition[2] - anchor.position[2]).toFixed(2))
      ];
      const positions = sources.map((source) => [
        Number(((source.position?.[0] ?? 0) + delta[0]).toFixed(2)),
        Number(((source.position?.[1] ?? 0) + delta[1]).toFixed(2)),
        Number(((source.position?.[2] ?? 0) + delta[2]).toFixed(2))
      ]);
      if (sources.every((source, index) => canPlaceDuplicateAt(source, positions[index], currentObjects))) {
        return positions;
      }
    }

    return null;
  };

  const applyCloneSelectionState = (cloneIds) => {
    setSelectedObjectId(cloneIds.at(-1) ?? null);
    setSelectedObjectIds(cloneIds);
    setSelectedAttachment(null);
    setSelectedOpening(null);
    setActiveBuildAsset(null);
    setDraggedAsset(null);
    setDropRequest(null);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
    setActiveTool("select");
  };

  const duplicateSelectedObject = () => {
    const sources = getSelectedCloneSources();
    if (!sources.length) return null;

    const positions = getClonePositionsForSources(sources);
    if (!positions) return null;

    const duplicatedAt = new Date().toISOString();
    const duplicates = sources.map((source, index) => {
      const duplicate = cloneObjectForDuplicate(source, positions[index], objects.length + index + 1);
      return {
        ...duplicate,
        metadata: {
          ...duplicate.metadata,
          duplicatedAt,
          lastEditSource: sources.length > 1 ? "duplicate-group-tool" : "duplicate-tool",
          placementSource: sources.length > 1 ? "duplicate-group-tool" : "duplicate-tool"
        }
      };
    });
    const duplicateIds = duplicates.map((duplicate) => duplicate.id);

    setObjects((current) => {
      const valid = sources.every((source, index) => canPlaceDuplicateAt(source, positions[index], current));
      if (!valid) return current;
      const boundDuplicates = duplicates.flatMap((duplicate, index) => {
        const sourceInCurrent = current.find((object) => object.id === sources[index].id) ?? sources[index];
        return cloneRoomBoundAssetsForDuplicate(sourceInCurrent, duplicate, current).map((boundObject) => ({
          ...boundObject,
          metadata: {
            ...boundObject.metadata,
            duplicatedAt,
            lastEditSource: sources.length > 1 ? "duplicate-group-bound" : boundObject.metadata?.lastEditSource,
            placementSource: sources.length > 1 ? "duplicate-group-bound" : boundObject.metadata?.placementSource
          }
        }));
      });
      return promoteClosedWallRoom([...current, ...duplicates, ...boundDuplicates], duplicates[0]?.id);
    });
    applyCloneSelectionState(duplicateIds);
    return duplicates.length === 1 ? duplicates[0] : duplicates;
  };

  const getCopyableSelectionSources = () => {
    return getSelectedCloneSources();
  };

  const cloneForEditorClipboard = (source) => JSON.parse(JSON.stringify(source));

  const copySelectedObjectsToClipboard = () => {
    const sources = getCopyableSelectionSources();
    if (!sources.length) return false;
    setEditorClipboard({
      copiedAt: new Date().toISOString(),
      sources: sources.map(cloneForEditorClipboard)
    });
    return true;
  };

  const pasteClipboardObjects = () => {
    const sources = Array.isArray(editorClipboard?.sources)
      ? editorClipboard.sources.filter((source) => source?.id && source?.position)
      : [];
    if (!sources.length) return false;

    const anchor = sources[0];
    const anchorCandidates = getDuplicateCandidatePositions(anchor);
    const placedAt = new Date().toISOString();
    let plannedPositions = null;

    for (const anchorPosition of anchorCandidates) {
      const delta = [
        Number((anchorPosition[0] - anchor.position[0]).toFixed(2)),
        Number((anchorPosition[1] - anchor.position[1]).toFixed(2)),
        Number((anchorPosition[2] - anchor.position[2]).toFixed(2))
      ];
      const positions = sources.map((source) => [
        Number(((source.position?.[0] ?? 0) + delta[0]).toFixed(2)),
        Number(((source.position?.[1] ?? 0) + delta[1]).toFixed(2)),
        Number(((source.position?.[2] ?? 0) + delta[2]).toFixed(2))
      ]);
      if (sources.every((source, index) => canPlaceDuplicateAt(source, positions[index], objects))) {
        plannedPositions = positions;
        break;
      }
    }

    if (!plannedPositions) return false;

    const clones = sources.map((source, index) => {
      const clone = cloneObjectForDuplicate(source, plannedPositions[index], objects.length + index + 1);
      return {
        ...clone,
        name: `${source.name ?? "객체"} 붙여넣기 ${objects.length + index + 1}`,
        metadata: {
          ...clone.metadata,
          copiedAt: editorClipboard.copiedAt,
          lastEditSource: "clipboard-paste",
          pastedAt: placedAt,
          pastedFrom: source.id,
          placementSource: "clipboard-paste"
        }
      };
    });
    const pastedIds = clones.map((clone) => clone.id);

    setObjects((current) => {
      const valid = sources.every((source, index) => canPlaceDuplicateAt(source, plannedPositions[index], current));
      if (!valid) return current;
      const boundDuplicates = clones.flatMap((clone, index) => {
        const sourceInCurrent = current.find((object) => object.id === sources[index].id) ?? sources[index];
        return cloneRoomBoundAssetsForDuplicate(sourceInCurrent, clone, current).map((boundObject) => ({
          ...boundObject,
          metadata: {
            ...boundObject.metadata,
            copiedAt: editorClipboard.copiedAt,
            lastEditSource: "clipboard-paste-bound",
            pastedAt: placedAt,
            placementSource: "clipboard-paste-bound"
          }
        }));
      });

      return promoteClosedWallRoom([...current, ...clones, ...boundDuplicates], clones[0]?.id);
    });

    setSelectedObjectId(pastedIds.at(-1) ?? null);
    setSelectedObjectIds(pastedIds);
    setSelectedAttachment(null);
    setSelectedOpening(null);
    setActiveBuildAsset(null);
    setDraggedAsset(null);
    setDropRequest(null);
    setMovingOpening(null);
    setRoomDraft(null);
    setWallAttachmentPreview(null);
    setWallDraft(null);
    setWallOpeningPreview(null);
    setActiveTool("select");
    return true;
  };

  const promoteClosedWallRoom = (candidateObjects, preferredRoomId) => {
    const closedRoom = findRectangularWallRoom(candidateObjects);
    if (!closedRoom) return candidateObjects;

    const nextIndex = candidateObjects.filter((object) => object.type === "room").length + 1;
    const sourceWallIds = new Set(closedRoom.sourceWallIds);
    const sourceWalls = candidateObjects.filter((object) => sourceWallIds.has(object.id));
    const roomOpenings = sourceWalls.flatMap((wallObject) => {
      const segment = getWallSegment(wallObject);
      const wall =
        segment.orientation === "x"
          ? segment.cross <= closedRoom.position[2] ? "north" : "south"
          : segment.cross <= closedRoom.position[0] ? "west" : "east";
      const roomCenterU = segment.orientation === "x" ? closedRoom.position[0] : closedRoom.position[2];
      const wallCenterU = segment.orientation === "x" ? wallObject.position[0] : wallObject.position[2];
      return (wallObject.wallOpenings ?? []).map((opening) => ({
        ...opening,
        offset: Number((wallCenterU + opening.offset - roomCenterU).toFixed(2)),
        wall
      }));
    });
    const roomAttachments = sourceWalls.flatMap((wallObject) => {
      const segment = getWallSegment(wallObject);
      const wall =
        segment.orientation === "x"
          ? segment.cross <= closedRoom.position[2] ? "north" : "south"
          : segment.cross <= closedRoom.position[0] ? "west" : "east";
      const roomCenterU = segment.orientation === "x" ? closedRoom.position[0] : closedRoom.position[2];
      const wallCenterU = segment.orientation === "x" ? wallObject.position[0] : wallObject.position[2];
      return (wallObject.wallAttachments ?? []).map((attachment) => ({
        ...attachment,
        offset: Number((wallCenterU + attachment.offset - roomCenterU).toFixed(2)),
        wall
      }));
    });
    const roomId = preferredRoomId ?? `room-${crypto.randomUUID?.() ?? Date.now()}`;
    const nextRoom = {
      id: roomId,
      type: "room",
      assetId: "test-wall-room",
      categoryId: "wall-tool",
      name: `방 ${nextIndex}`,
      color: "#a9c9bd",
      position: closedRoom.position,
      rotation: [0, 0, 0],
      shape: "room",
      size: closedRoom.size,
      room: {
        attachments: roomAttachments,
        canContainObjects: true,
        floor: closedRoom.floor,
        floorMaterial: "painted-slab",
        openings: roomOpenings,
        wallHeight: closedRoom.size[1],
        wallThickness: closedRoom.wallThickness
      },
      metadata: {
        floor: `${closedRoom.floor}F`,
        floorBaseY: closedRoom.position[1],
        gridUnit: `${EDITOR_GRID.snapStep}m`,
        placementSource: "wall-loop-auto-room",
        source: "studio-editor-wall-tool",
        sourceWallIds: closedRoom.sourceWallIds
      }
    };

    return [...candidateObjects.filter((object) => !sourceWallIds.has(object.id)), nextRoom];
  };

  const collectMergedWallOpenings = (walls, merged) => {
    const mergedCenterU = merged.wallOrientation === "x" ? merged.position[0] : merged.position[2];
    return walls.flatMap((wall) => {
      const wallCenterU = getWallSegment(wall).orientation === "x" ? wall.position[0] : wall.position[2];
      return (wall.wallOpenings ?? []).map((opening) => ({
        ...opening,
        offset: Number((wallCenterU + opening.offset - mergedCenterU).toFixed(2)),
        wall: "body"
      }));
    });
  };

  const collectMergedWallAttachments = (walls, merged) => {
    const mergedCenterU = merged.wallOrientation === "x" ? merged.position[0] : merged.position[2];
    return walls.flatMap((wall) => {
      const wallCenterU = getWallSegment(wall).orientation === "x" ? wall.position[0] : wall.position[2];
      return (wall.wallAttachments ?? []).map((attachment) => ({
        ...attachment,
        offset: Number((wallCenterU + attachment.offset - mergedCenterU).toFixed(2)),
        wall: "body"
      }));
    });
  };

  const commitCatalogObject = (nextObject) => {
    const initialJoinableWalls = isStructuralWallObject(nextObject) ? collectJoinableWalls(nextObject, objects) : [];

    setObjects((current) => {
      if (!isStructuralWallObject(nextObject)) return [...current, nextObject];

      const joinableWalls = collectJoinableWalls(nextObject, current);
      if (!joinableWalls.length) return promoteClosedWallRoom([...current, nextObject], nextObject.id);

      const keeper = joinableWalls[0];
      const mergeSources = [nextObject, ...joinableWalls];
      const merged = getMergedWallGeometry(mergeSources);
      const mergedIds = new Set(joinableWalls.map((wall) => wall.id));
      const mergedObject = {
        ...keeper,
        position: merged.position,
        rotation: merged.rotation,
        size: merged.size,
        wallOrientation: merged.wallOrientation,
        wallAttachments: collectMergedWallAttachments(mergeSources, merged),
        wallOpenings: collectMergedWallOpenings(mergeSources, merged),
        metadata: {
          ...keeper.metadata,
          lastEditSource: "wall-auto-join",
          updatedAt: new Date().toISOString(),
          wallJoin: {
            sourceCount: merged.sourceCount,
            sourceIds: [nextObject.id, ...joinableWalls.map((wall) => wall.id)]
          },
          wallOrientation: merged.wallOrientation
        }
      };

      const nextObjects = current
        .filter((object) => !mergedIds.has(object.id) || object.id === keeper.id)
        .map((object) => (object.id === keeper.id ? mergedObject : object));

      return promoteClosedWallRoom(nextObjects, keeper.id ?? nextObject.id);
    });
    setSelectedObjectId(initialJoinableWalls[0]?.id ?? nextObject.id);
    return nextObject;
  };

  const createCatalogObjectAt = (position, asset, placementSource = "catalog-drop") => {
    const floorHostEligibility = validateHostEligibility(asset, null);
    if (!floorHostEligibility.allowed) return null;
    const baseSize = asset.size ?? [1, 1, 1];
    const isStairAsset = asset.placementMode === "floor-stair";
    const stairPlacement = isStairAsset
      ? validateStraightStairPlacement({
          activeFloor,
          asset,
          buildable,
          floorBaseY: activeFloorBaseY,
          floorHeight: EDITOR_FLOORS.floorHeight,
          objects,
          originMode: "center",
          position,
          rotation: 0
        })
      : null;
    if (stairPlacement && !stairPlacement.valid) return null;
    const size = stairPlacement?.normalized?.size ?? (asset.placementMode === "floor-structural" && ["column", "wall"].includes(asset.supportKind)
      ? [baseSize[0], EDITOR_FLOORS.floorHeight, baseSize[2]]
      : baseSize);
    const nextPosition = stairPlacement?.validationInput?.candidate?.position ?? position;
    if (!isInsideBuildable(nextPosition, size)) return null;
    if (nextPosition[1] < size[1] / 2 || (!isStairAsset && hasBlockingCatalogCollision(nextPosition, size, asset, objects))) return null;

    const nextIndex = objects.length + 1;
    const id = `catalog-object-${crypto.randomUUID?.() ?? Date.now()}`;
    const stairObjectMetadata = stairPlacement?.stairMetadata
      ? {
          ...stairPlacement.stairMetadata,
          railingAttachments: (stairPlacement.stairMetadata.railingAttachments ?? []).map((attachment, index) => ({
            ...attachment,
            attachedToObjectId: id,
            id: `${id}-railing-${index + 1}`
          })),
          validationReason: stairPlacement.reason
        }
      : undefined;
    const nextObject = {
      id,
      type: "catalog-asset",
      assetId: asset.id,
      categoryId: asset.categoryId,
      name: `${asset.label} ${nextIndex}`,
      color: asset.color,
      format: asset.format,
      floor: activeFloor,
      modelUrl: asset.modelUrl,
      optimizedModelUrl: asset.optimizedModelUrl,
      originalModelUrl: asset.originalModelUrl,
      position: nextPosition,
      placementMode: asset.placementMode ?? "floor-free",
      rotation: [0, 0, 0],
      shape: asset.shape,
      size,
      supportKind: asset.supportKind,
      stairRun: asset.stairRun,
      stairRise: asset.stairRise,
      stairType: asset.stairType,
      stepCount: asset.stepCount,
      wallOrientation: asset.wallOrientation ?? "x",
      wallAttachments: asset.supportKind === "wall" ? [] : undefined,
      wallOpenings: asset.supportKind === "wall" ? [] : undefined,
      metadata: {
        floorNumber: activeFloor,
        gridUnit: `${EDITOR_GRID.snapStep}m`,
        hostEligibility: floorHostEligibility,
        landingDepth: asset.landingDepth,
        modelUrl: asset.modelUrl,
        placementSource,
        previewQuality: asset.previewQuality,
        runtime: asset.runtime,
        cost: asset.cost,
        componentKind: asset.componentKind,
        scenePlan: asset.metadata?.scenePlan ?? asset.scenePlan,
        scenePlanSummary: asset.metadata?.scenePlanSummary,
        stair: stairObjectMetadata,
        stairRun: asset.stairRun,
        stairRise: asset.stairRise,
        stairType: asset.stairType,
        stepCount: asset.stepCount,
        supportKind: asset.supportKind,
        sourceAssetId: asset.assetSourceId ?? asset.id,
        sourceAssetLabel: asset.label,
        sourceAssetMetadata: asset.metadata,
        sourceLabel: asset.sourceLabel,
        sourceType: asset.sourceType,
        sourceAssetType: asset.type,
        wallOrientation: asset.wallOrientation ?? "x",
        source: asset.modelUrl ? "studio-glb-catalog" : "studio-editor-test-placement"
      }
    };

    return commitCatalogObject(nextObject);
  };

  const moveObjectToPosition = (objectId, rawPosition, historyKey = null) => {
    setObjects((current) => {
      const movingObject = current.find((object) => object.id === objectId);
      if (!movingObject || isObjectLocked(movingObject) || isObjectHidden(movingObject)) return current;

      const size = movingObject.size ?? [1, 1, 1];
      const nextPosition = normalizeEditablePosition(rawPosition, size);
      const movingFloor = movingObject.room?.floor ?? movingObject.floor ?? activeFloor;
      const blocked =
        movingObject.type === "room"
          ? !validateRoomPlacement({
              activeFloor: movingFloor,
              buildable,
              candidate: {
                position: nextPosition,
                size,
                valid: true
              },
              floorHeight: EDITOR_FLOORS.floorHeight,
              ignoreObjectId: objectId,
              objects: current
            }).valid
          : current.some(
              (object) =>
                object.id !== objectId &&
                isBlockingCollision(object) &&
                hasBoxOverlap(nextPosition, size, object) &&
                !canOverlapCatalogObjects(movingObject, object)
            );

      if (blocked || hasSamePosition(movingObject.position, nextPosition)) return current;

      const editSource = getDirectTransformEditSource(historyKey, "drag-move");
      const nextMovingObject = {
        ...movingObject,
        position: nextPosition,
        metadata: {
          ...movingObject.metadata,
          lastEditSource: editSource,
          movedAt: new Date().toISOString()
        }
      };
      const withMovedObject = current.map((object) => (object.id === objectId ? nextMovingObject : object));
      return movingObject.type === "room"
        ? refreshRoomBoundAssets(withMovedObject, objectId, nextMovingObject, "room-move-sync")
        : withMovedObject;
    }, { historyKey });
  };

  const moveSelectedObjectsByAnchor = (anchorId, rawAnchorPosition, historyKey = null) => {
    setObjects((current) => {
      const selectedIds = selectedObjectIds.includes(anchorId) && selectedObjectIds.length > 1
        ? selectedObjectIds
        : [anchorId];
      const selectedIdSet = new Set(selectedIds);
      const movableObjects = current.filter((object) => selectedIdSet.has(object.id) && isGroupMoveEligibleObject(object));
      const anchor = movableObjects.find((object) => object.id === anchorId);
      if (!anchor) return current;

      const anchorSize = anchor.size ?? [1, 1, 1];
      const nextAnchorPosition = normalizeEditablePosition(rawAnchorPosition, anchorSize);
      const delta = [
        Number((nextAnchorPosition[0] - anchor.position[0]).toFixed(2)),
        Number((nextAnchorPosition[1] - anchor.position[1]).toFixed(2)),
        Number((nextAnchorPosition[2] - anchor.position[2]).toFixed(2))
      ];
      if (delta.every((value) => Math.abs(value) < 0.001)) return current;

      const movingIdSet = new Set(movableObjects.map((object) => object.id));
      const candidates = new Map();

      for (const object of movableObjects) {
        const size = object.size ?? [1, 1, 1];
        const nextPosition = [
          Number((object.position[0] + delta[0]).toFixed(2)),
          Number((object.position[1] + delta[1]).toFixed(2)),
          Number((object.position[2] + delta[2]).toFixed(2))
        ];
        if (!isInsideBuildable(nextPosition, size) || nextPosition[1] < size[1] / 2) return current;

        const blocked = current.some(
          (other) =>
            !movingIdSet.has(other.id) &&
            isBlockingCollision(other) &&
            hasBoxOverlap(nextPosition, size, other) &&
            !canOverlapCatalogObjects(object, other)
        );
        if (blocked) return current;
        candidates.set(object.id, nextPosition);
      }

      if (!candidates.size) return current;

      const movedAt = new Date().toISOString();
      return current.map((object) =>
        candidates.has(object.id)
          ? {
              ...object,
              position: candidates.get(object.id),
              metadata: {
                ...object.metadata,
                groupMoveCount: candidates.size,
                lastEditSource: getDirectTransformEditSource(historyKey, candidates.size > 1 ? "group-drag-move" : "drag-move"),
                movedAt
              }
            }
          : object
      );
    }, { historyKey });
  };

  const rotateSelectedObjectsAroundCenter = (anchorId, deltaYaw, historyKey = null) => {
    setObjects((current) => {
      const selectedIds = selectedObjectIds.includes(anchorId) && selectedObjectIds.length > 1
        ? selectedObjectIds
        : [anchorId];
      const selectedIdSet = new Set(selectedIds.filter(Boolean));
      const rotatableObjects = current.filter((object) => selectedIdSet.has(object.id) && isGroupMoveEligibleObject(object));
      if (rotatableObjects.length <= 1) return current;

      const centerX = rotatableObjects.reduce((sum, object) => sum + (object.position?.[0] ?? 0), 0) / rotatableObjects.length;
      const centerZ = rotatableObjects.reduce((sum, object) => sum + (object.position?.[2] ?? 0), 0) / rotatableObjects.length;
      const cos = Math.cos(deltaYaw);
      const sin = Math.sin(deltaYaw);
      const rotatingIdSet = new Set(rotatableObjects.map((object) => object.id));
      const candidates = new Map();

      for (const object of rotatableObjects) {
        const [x = 0, y = 0, z = 0] = object.position ?? [0, 0, 0];
        const dx = x - centerX;
        const dz = z - centerZ;
        const size = object.size ?? [1, 1, 1];
        const nextPosition = [
          Number((centerX + dx * cos - dz * sin).toFixed(2)),
          Number(y.toFixed(2)),
          Number((centerZ + dx * sin + dz * cos).toFixed(2))
        ];
        if (!isInsideBuildable(nextPosition, size) || nextPosition[1] < size[1] / 2) return current;

        const blocked = current.some(
          (other) =>
            !rotatingIdSet.has(other.id) &&
            isBlockingCollision(other) &&
            hasBoxOverlap(nextPosition, size, other) &&
            !canOverlapCatalogObjects(object, other)
        );
        if (blocked) return current;

        const [pitch = 0, yaw = 0, roll = 0] = object.rotation ?? [0, 0, 0];
        candidates.set(object.id, {
          position: nextPosition,
          rotation: [
            Number(pitch.toFixed(4)),
            Number((yaw + deltaYaw).toFixed(4)),
            Number(roll.toFixed(4))
          ]
        });
      }

      const rotatedAt = new Date().toISOString();
      const editSource = historyKey?.startsWith("keyboard") ? "keyboard-group-rotate" : "group-rotate";
      return current.map((object) =>
        candidates.has(object.id)
          ? {
              ...object,
              position: candidates.get(object.id).position,
              rotation: candidates.get(object.id).rotation,
              metadata: {
                ...object.metadata,
                groupRotateCount: candidates.size,
                lastEditSource: editSource,
                rotatedAt
              }
            }
          : object
      );
    }, { historyKey });
  };

  const resizeRoomByWall = (roomId, side, pointerPosition, historyKey = null) => {
    const resizeSides = String(side ?? "").split("-").filter(Boolean);
    if (!resizeSides.length || resizeSides.some((value) => !["north", "south", "west", "east"].includes(value))) return;
    setObjects((current) => {
      const room = current.find((object) => object.id === roomId && object.type === "room");
      if (!room || isObjectLocked(room)) return current;

      const [x = 0, y = 0, z = 0] = room.position ?? [0, 0, 0];
      const [width = 1, height = 2.7, depth = 1] = room.size ?? [1, 2.7, 1];
      const minRoomSize = EDITOR_GRID.snapStep * 2;
      const halfBuildableWidth = buildable.width / 2;
      const halfBuildableDepth = buildable.depth / 2;
      let minX = x - width / 2;
      let maxX = x + width / 2;
      let minZ = z - depth / 2;
      let maxZ = z + depth / 2;

      if (resizeSides.includes("east")) {
        maxX = Math.min(halfBuildableWidth, Math.max(minX + minRoomSize, snapToGridCenter(pointerPosition[0])));
      }
      if (resizeSides.includes("west")) {
        minX = Math.max(-halfBuildableWidth, Math.min(maxX - minRoomSize, snapToGridCenter(pointerPosition[0])));
      }
      if (resizeSides.includes("south")) {
        maxZ = Math.min(halfBuildableDepth, Math.max(minZ + minRoomSize, snapToGridCenter(pointerPosition[2])));
      }
      if (resizeSides.includes("north")) {
        minZ = Math.max(-halfBuildableDepth, Math.min(maxZ - minRoomSize, snapToGridCenter(pointerPosition[2])));
      }

      const nextSize = [
        Number((maxX - minX).toFixed(2)),
        height,
        Number((maxZ - minZ).toFixed(2))
      ];
      const nextPosition = [
        Number(((minX + maxX) / 2).toFixed(2)),
        y,
        Number(((minZ + maxZ) / 2).toFixed(2))
      ];
      if (hasSamePosition(room.position, nextPosition) && hasSameVector(room.size, nextSize)) return current;
      if (!areRoomHostedItemsWithinSize(room, nextSize)) return current;

      const roomFloor = room.room?.floor ?? room.floor ?? activeFloor;
      const placement = validateRoomPlacement({
        activeFloor: roomFloor,
        buildable,
        candidate: {
          position: nextPosition,
          size: nextSize,
          valid: true
        },
        floorHeight: EDITOR_FLOORS.floorHeight,
        ignoreObjectId: roomId,
        objects: current
      });
      if (!placement.valid) return current;

      const nextRoom = {
        ...room,
        position: nextPosition,
        size: nextSize,
        room: {
          ...room.room,
          wallHeight: height
        },
        metadata: {
          ...room.metadata,
          lastEditSource: "room-wall-resize",
          resizedAt: new Date().toISOString(),
          resizedWall: side
        }
      };
      const withRoom = current.map((object) => (object.id === roomId ? nextRoom : object));
      return refreshRoomBoundAssets(withRoom, roomId, nextRoom, "room-resize-sync");
    }, { historyKey });
  };

  const remapWallFeatureOffsets = (features = [], oldSegment, nextDraft) => {
    const oldCenterU = Number(((oldSegment.minU + oldSegment.maxU) / 2).toFixed(2));
    const nextCenterU = nextDraft.wallOrientation === "x" ? nextDraft.position[0] : nextDraft.position[2];
    return features.map((feature) => ({
      ...feature,
      offset: Number((oldCenterU + (feature.offset ?? 0) - nextCenterU).toFixed(2))
    }));
  };

  const resizeWallEndpoint = (wallId, endpoint, pointerPosition, historyKey = null) => {
    if (!["start", "end"].includes(endpoint)) return;

    setObjects((current) => {
      const wall = current.find((object) => object.id === wallId && isStructuralWallObject(object));
      if (!wall || isObjectLocked(wall)) return current;

      const oldSegment = getWallSegment(wall);
      const endpoints = getWallEndpoints(wall);
      const movingEndpointIndex = endpoint === "start" ? 0 : 1;
      const fixedPoint = endpoints[movingEndpointIndex === 0 ? 1 : 0];
      const rawMovingPoint =
        oldSegment.orientation === "x"
          ? { x: pointerPosition[0], z: fixedPoint.z }
          : { x: fixedPoint.x, z: pointerPosition[2] };
      const wallFloor = wall.floor ?? wall.metadata?.floorNumber ?? activeFloor;
      const wallBaseY = Number(((wall.position?.[1] ?? 0) - (wall.size?.[1] ?? EDITOR_FLOORS.floorHeight) / 2).toFixed(2));
      const draft = createPascalWallDraft({
        activeFloor: wallFloor,
        activeFloorBaseY: wallBaseY,
        asset: {
          id: wall.assetId,
          categoryId: wall.categoryId,
          color: wall.color,
          label: wall.metadata?.sourceAssetLabel ?? wall.name ?? "벽",
          size: wall.size,
          wallHeight: wall.size?.[1] ?? EDITOR_FLOORS.floorHeight,
          wallThickness: wall.size?.[2] ?? 0.16
        },
        buildable,
        endPoint: rawMovingPoint,
        floorHeight: EDITOR_FLOORS.floorHeight,
        objects: current.filter((object) => object.id !== wallId),
        snapEnabled,
        snapStep: EDITOR_GRID.snapStep,
        startPoint: fixedPoint
      });
      if (!draft?.valid) return current;

      const nextWall = {
        ...wall,
        floor: wallFloor,
        position: draft.position,
        rotation: draft.rotation,
        size: draft.size,
        wallOrientation: draft.wallOrientation,
        wallAttachments: remapWallFeatureOffsets(wall.wallAttachments ?? [], oldSegment, draft),
        wallOpenings: remapWallFeatureOffsets(wall.wallOpenings ?? [], oldSegment, draft),
        metadata: {
          ...wall.metadata,
          draftEndPoint: draft.endPoint,
          draftStartPoint: draft.startPoint,
          floorNumber: wallFloor,
          lastEditSource: "wall-endpoint-resize",
          resizedEndpoint: endpoint,
          updatedAt: new Date().toISOString(),
          wallOrientation: draft.wallOrientation
        }
      };

      if (hasSamePosition(wall.position, nextWall.position) && hasSameVector(wall.size, nextWall.size)) return current;
      const updates = buildWallEndpointResizeTopology({
        endpoint,
        nextWall,
        objects: current,
        oldWall: wall
      });
      const updateById = new Map(updates.map((update) => [update.id, update]));
      const updatedAt = new Date().toISOString();
      const nextObjects = current.map((object) => {
        if (object.id === wallId) return nextWall;
        const update = updateById.get(object.id);
        if (!update) return object;

        return {
          ...object,
          position: update.position,
          rotation: update.rotation ?? object.rotation,
          size: update.size ?? object.size,
          wallAttachments: update.oldSegment
            ? remapWallFeaturesToSegment(object.wallAttachments ?? [], update.oldSegment, update.nextSegment)
            : object.wallAttachments,
          wallOpenings: update.oldSegment
            ? remapWallFeaturesToSegment(object.wallOpenings ?? [], update.oldSegment, update.nextSegment)
            : object.wallOpenings,
          wallOrientation: update.wallOrientation ?? object.wallOrientation,
          metadata: {
            ...object.metadata,
            connectedWallMove: true,
            connectedWallMoveAnchorId: wallId,
            lastEditSource: "connected-wall-endpoint-follow",
            movedEndpoint: update.movedEndpoint,
            updatedAt,
            wallOrientation: update.wallOrientation ?? object.wallOrientation
          }
        };
      });
      return promoteClosedWallRoom(nextObjects, wallId);
    }, { historyKey });
  };

  const moveWallNormal = (wallId, side, pointerPosition, historyKey = null) => {
    setObjects((current) => {
      const wall = current.find((object) => object.id === wallId && isStructuralWallObject(object));
      if (!wall || isObjectLocked(wall)) return current;

      const [x = 0, y = 0, z = 0] = wall.position ?? [0, 0, 0];
      const [, , thickness = 0.16] = wall.size ?? [1, EDITOR_FLOORS.floorHeight, 0.16];
      const segment = getWallSegment(wall);
      const nextCross =
        segment.orientation === "x"
          ? clampToBuildableCell(pointerPosition[2], buildable.depth, thickness)
          : clampToBuildableCell(pointerPosition[0], buildable.width, thickness);
      const nextPosition = segment.orientation === "x" ? [x, y, nextCross] : [nextCross, y, z];

      if (hasSamePosition(wall.position, nextPosition)) return current;
      const updates = buildWallNormalMoveTopology({
        nextCross,
        objects: current,
        wall
      });
      if (!updates.length) return current;
      const updateById = new Map(updates.map((update) => [update.id, update]));
      const movedAt = new Date().toISOString();

      return current.map((object) =>
        updateById.has(object.id)
          ? {
              ...object,
              position: updateById.get(object.id).position,
              rotation: updateById.get(object.id).rotation ?? object.rotation,
              size: updateById.get(object.id).size ?? object.size,
              wallAttachments: updateById.get(object.id).oldSegment
                ? remapWallFeaturesToSegment(object.wallAttachments ?? [], updateById.get(object.id).oldSegment, updateById.get(object.id).nextSegment)
                : object.wallAttachments,
              wallOpenings: updateById.get(object.id).oldSegment
                ? remapWallFeaturesToSegment(object.wallOpenings ?? [], updateById.get(object.id).oldSegment, updateById.get(object.id).nextSegment)
                : object.wallOpenings,
              wallOrientation: updateById.get(object.id).wallOrientation ?? object.wallOrientation,
              metadata: {
                ...object.metadata,
                connectedWallMove: updateById.get(object.id).reason === "connected-wall-endpoint-follow",
                connectedWallMoveAnchorId: updateById.get(object.id).reason === "connected-wall-endpoint-follow" ? wallId : undefined,
                lastEditSource: updateById.get(object.id).reason === "connected-wall-endpoint-follow"
                  ? "connected-wall-endpoint-follow"
                  : "wall-normal-move",
                movedSide: side,
                movedAt,
                wallOrientation: updateById.get(object.id).wallOrientation ?? object.wallOrientation
              }
            }
          : object
      );
    }, { historyKey });
  };

  const rotateObjectToRotation = (objectId, nextRotation, historyKey = null) => {
    setObjects((current) => {
      const target = current.find((object) => object.id === objectId);
      if (!target || isTransformLockedObject(target)) return current;
      const editSource = historyKey?.startsWith("keyboard")
        ? "keyboard-rotate"
        : getDirectTransformEditSource(historyKey, "drag-rotate");
      const normalizedRotation = [
        Number((nextRotation?.[0] ?? 0).toFixed(4)),
        Number((nextRotation?.[1] ?? 0).toFixed(4)),
        Number((nextRotation?.[2] ?? 0).toFixed(4))
      ];
      if (hasSameVector(target.rotation ?? [0, 0, 0], normalizedRotation)) return current;

      return current.map((object) =>
        object.id === objectId
          ? {
              ...object,
              rotation: normalizedRotation,
              metadata: {
                ...object.metadata,
                lastEditSource: editSource,
                rotatedAt: new Date().toISOString()
              }
            }
          : object
      );
    }, { historyKey });
  };

  const scaleObjectToSize = (objectId, rawSize, historyKey = null) => {
    setObjects((current) => {
      const target = current.find((object) => object.id === objectId);
      if (!target || isTransformLockedObject(target)) return current;

      const currentSize = target.size ?? [1, 1, 1];
      const nextSize = [
        Number(Math.min(12, Math.max(0.2, rawSize?.[0] ?? currentSize[0])).toFixed(2)),
        Number(Math.min(8, Math.max(0.05, rawSize?.[1] ?? currentSize[1])).toFixed(2)),
        Number(Math.min(12, Math.max(0.2, rawSize?.[2] ?? currentSize[2])).toFixed(2))
      ];
      if (hasSameVector(currentSize, nextSize)) return current;
      if (!isInsideBuildable(target.position, nextSize)) return current;

      const blocked =
        !canSkipTransformCollision(target) &&
        current.some(
          (object) =>
            object.id !== objectId &&
            isBlockingCollision(object) &&
            hasBoxOverlap(target.position, nextSize, object) &&
            !canOverlapCatalogObjects(target, object)
        );
      if (blocked) return current;

      return current.map((object) =>
        object.id === objectId
          ? {
              ...object,
              size: nextSize,
              metadata: {
                ...object.metadata,
                lastEditSource: getDirectTransformEditSource(historyKey, "drag-scale"),
                scaledAt: new Date().toISOString()
              }
            }
          : object
      );
    }, { historyKey });
  };

  const createRoomFromDraft = (draft) => {
    if (!draft?.valid) return null;

    const nextIndex = objects.filter((object) => object.type === "room").length + 1;
    const id = `room-${crypto.randomUUID?.() ?? Date.now()}`;
    const nextObject = {
      id,
      type: "room",
      assetId: draft.asset.id,
      categoryId: draft.asset.categoryId,
      name: `방 ${nextIndex}`,
      color: draft.asset.color,
      position: draft.position,
      rotation: [0, 0, 0],
      shape: "room",
      size: draft.size,
      room: {
        attachments: [],
        canContainObjects: true,
        floor: draft.floor,
        floorMaterial: "painted-slab",
        openings: [],
        wallHeight: draft.size[1],
        wallThickness: draft.wallThickness
      },
      metadata: {
        gridUnit: `${EDITOR_GRID.snapStep}m`,
        floor: `${draft.floor}F`,
        floorBaseY: draft.position[1],
        placementSource: "draw-room",
        sourceAssetLabel: draft.asset.label,
        source: "studio-editor-room-tool"
      }
    };

    setObjects((current) => [...current, nextObject]);
    setSelectedObjectId(id);
    return nextObject;
  };

  const createWallFromDraft = (draft) => {
    if (!draft?.valid) return null;

    const nextIndex = objects.length + 1;
    const id = `catalog-object-${crypto.randomUUID?.() ?? Date.now()}`;
    const nextObject = {
      id,
      type: "catalog-asset",
      assetId: draft.asset.id,
      categoryId: draft.asset.categoryId,
      name: `${draft.asset.label} ${nextIndex}`,
      color: draft.asset.color,
      floor: draft.floor,
      position: draft.position,
      placementMode: "draw-wall",
      rotation: draft.rotation,
      shape: "box",
      size: draft.size,
      supportKind: "wall",
      wallOrientation: draft.wallOrientation,
      wallAttachments: [],
      wallOpenings: [],
      metadata: {
        floorNumber: draft.floor,
        gridUnit: `${EDITOR_GRID.snapStep}m`,
        length: draft.size[0],
        draftEndPoint: draft.endPoint,
        draftStartPoint: draft.startPoint,
        placementSource: "draw-wall",
        sourceAssetLabel: draft.asset.label,
        source: "studio-editor-wall-tool",
        supportKind: "wall",
        wallOrientation: draft.wallOrientation
      }
    };

    return commitCatalogObject(nextObject);
  };

  const attachRoofToRoom = (roomId, asset) => {
    const room = objects.find((object) => object.id === roomId && object.type === "room");
    if (!room || !asset) return null;

    if (asset.placementMode === "roof-accessory") {
      const roof = objects.find(
        (object) =>
          object.placementMode === "roof-attached" &&
          object.categoryId === "roof" &&
          object.metadata?.attachedRoomId === roomId
      );
      const accessory = createRoofAccessoryObjectForRoom(room, asset, roof, {
        id: `catalog-object-${crypto.randomUUID?.() ?? Date.now()}`
      });
      if (!accessory) return null;

      setObjects((current) => [
        ...current.filter(
          (object) =>
            !(
              object.placementMode === "roof-accessory" &&
              object.metadata?.attachedRoomId === roomId &&
              object.assetId === asset.id
            )
        ),
        accessory
      ]);
      setSelectedObjectId(accessory.id);
      setSelectedAttachment(null);
      setSelectedOpening(null);
      return accessory;
    }

    const roof = createRoofObjectForRoom(room, asset, {
      id: `catalog-object-${crypto.randomUUID?.() ?? Date.now()}`
    });
    if (!roof) return null;

    setObjects((current) => [
      ...current.filter(
        (object) =>
          !(
            object.placementMode === "roof-attached" &&
            object.categoryId === "roof" &&
            object.metadata?.attachedRoomId === roomId
          )
      ),
      roof
    ]);
    setSelectedObjectId(roof.id);
    setSelectedAttachment(null);
    setSelectedOpening(null);
    return roof;
  };

  const handleWallOpeningPreview = (hit, asset, movingOpeningRef = null) => {
    setWallOpeningPreview(
      hit
        ? createWallOpeningCandidate(hit, asset, movingOpeningRef)
        : asset
          ? {
              assetId: asset.id,
              id: movingOpeningRef?.openingId ?? "opening-invalid-preview",
              invalidReason: "requires-wall-host",
              label: asset.label,
              type: asset.openingType ?? "window",
              valid: false
            }
          : null
    );
  };

  const handleWallAttachmentPreview = (hit, asset, movingAttachmentRef = null) => {
    setWallAttachmentPreview(
      hit
        ? createWallAttachmentCandidate(hit, asset, movingAttachmentRef)
        : asset
          ? {
              assetId: asset.id,
              id: movingAttachmentRef?.attachmentId ?? "attachment-invalid-preview",
              invalidReason: "requires-wall-host",
              label: asset.label,
              type: asset.placementMode,
              valid: false
            }
          : null
    );
  };

  const commitWallAttachment = (hit, asset, movingAttachmentRef = null) => {
    const candidate = createWallAttachmentCandidate(hit, asset, movingAttachmentRef);
    if (!candidate?.valid) {
      setWallAttachmentPreview(candidate);
      return null;
    }

    const candidateHostId = getAttachmentHostId(candidate);
    const movingHostId = getAttachmentHostId(movingAttachmentRef);
    const nextAttachment = {
      assetId: candidate.assetId,
      centerY: candidate.centerY,
      color: candidate.color,
      depth: candidate.depth,
      height: candidate.height,
      id: candidate.id,
      label: candidate.label,
      offset: candidate.offset,
      shape: candidate.shape,
      type: candidate.type,
      wall: candidate.wall,
      width: candidate.width
    };

    setObjects((current) =>
      current.map((object) => {
        const isSourceHost = Boolean(movingAttachmentRef && object.id === movingHostId);
        const isCandidateHost = object.id === candidateHostId;

        if (object.type === "room") {
          let roomAttachments = object.room?.attachments ?? [];
          if (isSourceHost) {
            roomAttachments = roomAttachments.filter((attachment) => attachment.id !== movingAttachmentRef.attachmentId);
          }
          if (isCandidateHost) {
            roomAttachments = [...roomAttachments.filter((attachment) => attachment.id !== nextAttachment.id), nextAttachment];
          }
          if (roomAttachments === object.room?.attachments) return object;
          return {
            ...object,
            room: {
              ...object.room,
              attachments: roomAttachments
            }
          };
        }
        if (isStructuralWallObject(object)) {
          let wallAttachments = object.wallAttachments ?? [];
          if (isSourceHost) {
            wallAttachments = wallAttachments.filter((attachment) => attachment.id !== movingAttachmentRef.attachmentId);
          }
          if (isCandidateHost) {
            wallAttachments = [...wallAttachments.filter((attachment) => attachment.id !== nextAttachment.id), nextAttachment];
          }
          if (wallAttachments === object.wallAttachments) return object;
          return {
            ...object,
            wallAttachments
          };
        }
        return object;
      })
    );
    setSelectedObjectId(candidateHostId);
    setSelectedObjectIds([]);
    setSelectedAttachment(
      candidate.roomId
        ? { attachmentId: candidate.id, roomId: candidate.roomId }
        : { attachmentId: candidate.id, wallObjectId: candidate.wallObjectId }
    );
    setSelectedOpening(null);
    setMovingAttachment(null);
    setWallAttachmentPreview(null);
    return candidate;
  };

  const commitWallOpening = (hit, asset, movingOpeningRef = null) => {
    const candidate = createWallOpeningCandidate(hit, asset, movingOpeningRef);
    if (!candidate?.valid) {
      setWallOpeningPreview(candidate);
      return null;
    }

    const candidateHostId = getOpeningHostId(candidate);
    const movingHostId = getOpeningHostId(movingOpeningRef);
    const nextOpening = {
      assetId: candidate.assetId,
      color: candidate.color,
      frameDepth: candidate.frameDepth,
      height: candidate.height,
      id: candidate.id,
      label: candidate.label,
      offset: candidate.offset,
      sillHeight: candidate.sillHeight,
      type: candidate.type,
      wall: candidate.wall,
      width: candidate.width
    };

    setObjects((current) =>
      current.map((object) => {
        const isSourceHost = Boolean(movingOpeningRef && object.id === movingHostId);
        const isCandidateHost = object.id === candidateHostId;

        if (object.type === "room") {
          let roomOpenings = object.room?.openings ?? [];
          if (isSourceHost) {
            roomOpenings = roomOpenings.filter((opening) => opening.id !== movingOpeningRef.openingId);
          }
          if (isCandidateHost) {
            roomOpenings = [...roomOpenings.filter((opening) => opening.id !== nextOpening.id), nextOpening];
          }
          if (roomOpenings === object.room?.openings) return object;
          return {
            ...object,
            room: {
              ...object.room,
              openings: roomOpenings
            }
          };
        }

        if (isStructuralWallObject(object)) {
          let wallOpenings = object.wallOpenings ?? [];
          if (isSourceHost) {
            wallOpenings = wallOpenings.filter((opening) => opening.id !== movingOpeningRef.openingId);
          }
          if (isCandidateHost) {
            wallOpenings = [...wallOpenings.filter((opening) => opening.id !== nextOpening.id), nextOpening];
          }
          if (wallOpenings === object.wallOpenings) return object;
          return {
            ...object,
            wallOpenings
          };
        }

        return object;
      })
    );
    setSelectedObjectId(candidateHostId);
    setSelectedObjectIds([]);
    setSelectedOpening(
      candidate.roomId
        ? { openingId: candidate.id, roomId: candidate.roomId }
        : { openingId: candidate.id, wallObjectId: candidate.wallObjectId }
    );
    setSelectedAttachment(null);
    setWallOpeningPreview(null);
    return candidate;
  };

  const selectOpening = (hostId, openingId) => {
    const host = objects.find((object) => object.id === hostId);
    clearHostedToolState();
    setSelectedObjectId(hostId);
    setSelectedObjectIds([]);
    setSelectedOpening(
      host?.type === "room"
        ? { openingId, roomId: hostId }
        : { openingId, wallObjectId: hostId }
    );
    setSelectedAttachment(null);
  };

  const selectAttachment = (hostId, attachmentId) => {
    const host = objects.find((object) => object.id === hostId);
    clearHostedToolState();
    setSelectedObjectId(hostId);
    setSelectedObjectIds([]);
    setSelectedAttachment(
      host?.type === "room"
        ? { attachmentId, roomId: hostId }
        : { attachmentId, wallObjectId: hostId }
    );
    setSelectedOpening(null);
  };

  const deleteAttachment = (hostId, attachmentId) => {
    setObjects((current) =>
      current.map((object) => {
        if (object.id !== hostId) return object;
        if (object.type === "room") {
          return {
            ...object,
            room: {
              ...object.room,
              attachments: (object.room?.attachments ?? []).filter((attachment) => attachment.id !== attachmentId)
            }
          };
        }
        if (isStructuralWallObject(object)) {
          return {
            ...object,
            wallAttachments: (object.wallAttachments ?? []).filter((attachment) => attachment.id !== attachmentId)
          };
        }
        return object;
      })
    );
    setSelectedAttachment((current) =>
      getAttachmentHostId(current) === hostId && current?.attachmentId === attachmentId ? null : current
    );
    setWallAttachmentPreview(null);
  };

  const updateAttachmentProperties = (attachmentRef, patch) => {
    const hostId = getAttachmentHostId(attachmentRef);
    const attachmentId = attachmentRef?.attachmentId;
    if (!hostId || !attachmentId || !patch) return;

    setObjects((current) =>
      current.map((object) => {
        if (object.id !== hostId) return object;
        if (object.type !== "room" && !isStructuralWallObject(object)) return object;

        const attachments = object.type === "room" ? object.room?.attachments ?? [] : object.wallAttachments ?? [];
        const openings = object.type === "room" ? object.room?.openings ?? [] : object.wallOpenings ?? [];
        let changed = false;
        const nextAttachments = attachments.map((attachment) => {
          if (attachment.id !== attachmentId) return attachment;

          const [, wallHeight = 2.7] = object.size ?? [1, 2.7, 1];
          const result = applyWallAttachmentPatch(
            attachment,
            patch,
            {
              snapEnabled,
              snapStep: EDITOR_GRID.snapStep,
              wallHeight,
              wallLength: getOpeningHostLength(object, attachment.wall)
            },
            {
              attachments,
              openings
            }
          );
          if (!result.valid) {
            setWallAttachmentPreview({ ...result.attachment, invalidReason: result.invalidReason, valid: false });
            return attachment;
          }

          changed = true;
          setWallAttachmentPreview(null);
          return result.attachment;
        });

        if (!changed) return object;
        if (object.type === "room") {
          return {
            ...object,
            room: {
              ...object.room,
              attachments: nextAttachments
            }
          };
        }
        return {
          ...object,
          wallAttachments: nextAttachments
        };
      })
    );
  };

  const deleteOpening = (hostId, openingId) => {
    setObjects((current) =>
      current.map((object) => {
        if (object.id !== hostId) return object;
        if (object.type === "room") {
          return {
            ...object,
            room: {
              ...object.room,
              openings: (object.room?.openings ?? []).filter((opening) => opening.id !== openingId)
            }
          };
        }
        if (isStructuralWallObject(object)) {
          return {
            ...object,
            wallOpenings: (object.wallOpenings ?? []).filter((opening) => opening.id !== openingId)
          };
        }
        return object;
      })
    );
    setSelectedOpening((current) =>
      getOpeningHostId(current) === hostId && current?.openingId === openingId ? null : current
    );
    setWallOpeningPreview(null);
  };

  const getWallHostedFeatureMinimums = (wall) => {
    const margin = 0.12;
    const openings = wall.wallOpenings ?? [];
    const attachments = wall.wallAttachments ?? [];
    const minLength = [...openings, ...attachments].reduce((requiredLength, feature) => {
      const offset = Number(feature.offset ?? 0);
      const width = Number(feature.width ?? 0);
      if (!Number.isFinite(offset) || !Number.isFinite(width)) return requiredLength;
      return Math.max(requiredLength, 2 * (Math.abs(offset) + width / 2 + margin));
    }, 0.5);
    const openingHeight = openings.reduce((requiredHeight, opening) => {
      const sillHeight = Number(opening.sillHeight ?? 0);
      const height = Number(opening.height ?? 0);
      if (!Number.isFinite(sillHeight) || !Number.isFinite(height)) return requiredHeight;
      return Math.max(requiredHeight, sillHeight + height + margin);
    }, 0.5);
    const attachmentHeight = attachments.reduce((requiredHeight, attachment) => {
      const centerY = Number(attachment.centerY ?? 0);
      const height = Number(attachment.height ?? 0);
      if (!Number.isFinite(centerY) || !Number.isFinite(height)) return requiredHeight;
      return Math.max(requiredHeight, centerY + height / 2 + margin);
    }, openingHeight);

    return {
      minHeight: Number(attachmentHeight.toFixed(2)),
      minLength: Number(minLength.toFixed(2))
    };
  };

  const updateWallSegmentProperties = (wallId, patch) => {
    if (!wallId || !patch) return;
    setObjects((current) =>
      current.map((object) => {
        if (object.id !== wallId || !isStructuralWallObject(object)) return object;
        const hostedMinimums = getWallHostedFeatureMinimums(object);
        const nextWall = normalizeWallSegmentPatch(object, patch, {
          minHeight: hostedMinimums.minHeight,
          minLength: hostedMinimums.minLength,
          snapEnabled,
          snapStep: EDITOR_GRID.snapStep
        });

        return {
          ...nextWall,
          metadata: {
            ...(nextWall.metadata ?? {}),
            lastEditSource: "inspector-wall-segment"
          }
        };
      })
    );
  };

  const updateOpeningProperties = (openingRef, patch) => {
    const hostId = getOpeningHostId(openingRef);
    const openingId = openingRef?.openingId;
    if (!hostId || !openingId || !patch) return;

    setObjects((current) =>
      current.map((object) => {
        if (object.id !== hostId) return object;
        if (object.type !== "room" && !isStructuralWallObject(object)) return object;

        const openings = object.type === "room" ? object.room?.openings ?? [] : object.wallOpenings ?? [];
        let changed = false;
        const nextOpenings = openings.map((opening) => {
          if (opening.id !== openingId) return opening;

          const [, wallHeight = 2.7] = object.size ?? [1, 2.7, 1];
          const result = applyOpeningPatch(
            opening,
            patch,
            {
              snapEnabled,
              snapStep: EDITOR_GRID.snapStep,
              wallHeight,
              wallLength: getOpeningHostLength(object, opening.wall)
            },
            openings
          );
          if (!result.valid) {
            setWallOpeningPreview({ ...result.opening, invalidReason: result.invalidReason, valid: false });
            return opening;
          }

          changed = true;
          setWallOpeningPreview(null);
          return result.opening;
        });

        if (!changed) return object;
        if (object.type === "room") {
          return {
            ...object,
            room: {
              ...object.room,
              openings: nextOpenings
            }
          };
        }
        return {
          ...object,
          wallOpenings: nextOpenings
        };
      })
    );
  };

  const deleteSelectedEntity = () => {
    if (selectedOpening) {
      deleteOpening(getOpeningHostId(selectedOpening), selectedOpening.openingId);
      return;
    }
    if (selectedAttachment) {
      deleteAttachment(getAttachmentHostId(selectedAttachment), selectedAttachment.attachmentId);
      return;
    }
    if (selectedObjectIds.length > 1) {
      deleteObjects(selectedObjectIds);
      return;
    }
    if (selectedObjectId) deleteObject(selectedObjectId);
  };

  const startOpeningDrag = (hostId, openingId) => {
    const host = objects.find((object) => object.id === hostId);
    const opening = host?.room?.openings?.find((item) => item.id === openingId)
      ?? host?.wallOpenings?.find((item) => item.id === openingId);
    const asset = opening ? findCatalogAsset(opening.assetId) : null;
    if (!opening || !asset) return;
    setActiveBuildAsset(asset);
    setMovingOpening(
      host?.type === "room"
        ? { asset, openingId, roomId: hostId }
        : { asset, openingId, wallObjectId: hostId }
    );
    setSelectedObjectId(hostId);
    setSelectedObjectIds([]);
    setSelectedOpening(
      host?.type === "room"
        ? { openingId, roomId: hostId }
        : { openingId, wallObjectId: hostId }
    );
    setSelectedAttachment(null);
  };

  const startAttachmentDrag = (hostId, attachmentId) => {
    const host = objects.find((object) => object.id === hostId);
    const attachment = host?.room?.attachments?.find((item) => item.id === attachmentId)
      ?? host?.wallAttachments?.find((item) => item.id === attachmentId);
    const asset = attachment ? findCatalogAsset(attachment.assetId) : null;
    if (!attachment || !asset) return;
    setActiveBuildAsset(asset);
    setMovingAttachment(
      host?.type === "room"
        ? { asset, attachmentId, roomId: hostId }
        : { asset, attachmentId, wallObjectId: hostId }
    );
    setSelectedObjectId(hostId);
    setSelectedObjectIds([]);
    setSelectedAttachment(
      host?.type === "room"
        ? { attachmentId, roomId: hostId }
        : { attachmentId, wallObjectId: hostId }
    );
    setSelectedOpening(null);
  };

  const endAttachmentMove = () => {
    setActiveBuildAsset(null);
    setMovingAttachment(null);
    setWallAttachmentPreview(null);
    setWallOpeningPreview(null);
  };

  const endOpeningMove = () => {
    setMovingOpening(null);
    setWallAttachmentPreview(null);
    setWallOpeningPreview(null);
  };

  const handleRoomDraftChange = (startPoint, endPoint, asset) => {
    if (!startPoint || !endPoint) {
      setRoomDraft(null);
      return;
    }
    setRoomDraft(createRoomDraftFromPoints(startPoint, endPoint, asset));
  };

  const handleRoomDraftCommit = (startPoint, endPoint, asset) => {
    const draft = createRoomDraftFromPoints(startPoint, endPoint, asset);
    const createdObject = createRoomFromDraft(draft);
    setRoomDraft(null);
    return createdObject;
  };

  const handleWallDraftChange = (startPoint, endPoint, asset) => {
    if (!startPoint || !endPoint) {
      setWallDraft(null);
      return;
    }
    setWallDraft(createWallDraftFromPoints(startPoint, endPoint, asset));
  };

  const handleWallDraftCommit = (startPoint, endPoint, asset) => {
    const draft = createWallDraftFromPoints(startPoint, endPoint, asset);
    const createdObject = createWallFromDraft(draft);
    setWallDraft(null);
    return createdObject;
  };

  const handleGroundPointerDown = (point) => {
    if (activeTool !== "erase") {
      setSelectedObjectId(null);
      setSelectedObjectIds([]);
      setSelectedAttachment(null);
      setSelectedOpening(null);
    }
  };

  const handleGroundMarqueeSelect = (bounds, gesture = {}) => {
    if (!bounds) return;
    const hitIds = objects
      .filter((object) => getEditorObjectFloor(object) === activeFloor)
      .filter((object) => !isObjectHidden(object))
      .filter((object) => hasFootprintOverlap(bounds, object))
      .map((object) => object.id);
    const currentIds = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    const nextIds = gesture.additive
      ? [...currentIds, ...hitIds.filter((objectId) => !currentIds.includes(objectId))]
      : hitIds;

    setSelectedObjectIds(nextIds);
    setSelectedObjectId(nextIds.at(-1) ?? null);
    setSelectedAttachment(null);
    setSelectedOpening(null);
  };

  const clearEditorSelection = () => {
    setSelectedAttachment(null);
    setSelectedObjectId(null);
    setSelectedObjectIds([]);
    setSelectedOpening(null);
  };

  const selectAllObjectsOnActiveFloor = () => {
    const nextIds = objects
      .filter((object) => getEditorObjectFloor(object) === activeFloor)
      .filter((object) => !isObjectHidden(object))
      .map((object) => object.id);
    if (!nextIds.length) return false;
    setSelectedObjectIds(nextIds);
    setSelectedObjectId(nextIds.at(-1) ?? null);
    setSelectedAttachment(null);
    setSelectedOpening(null);
    return true;
  };

  const deleteObjects = (objectIds) => {
    const requestedIds = new Set(objectIds.filter(Boolean));
    if (!requestedIds.size) return;
    const deleteIds = new Set();

    objects.forEach((object) => {
      if (!requestedIds.has(object.id) || isObjectLocked(object)) return;
      deleteIds.add(object.id);
      if (object.type === "room") {
        objects.forEach((candidate) => {
          if (candidate.metadata?.attachedRoomId === object.id) deleteIds.add(candidate.id);
        });
      }
    });

    if (!deleteIds.size) return;
    const currentSelection = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    const survivingSelectedIds = currentSelection.filter((objectId) => !deleteIds.has(objectId));

    setObjects((current) => current.filter((object) => !deleteIds.has(object.id)));
    setSelectedObjectIds(survivingSelectedIds);
    setSelectedObjectId((current) => (deleteIds.has(current) ? survivingSelectedIds.at(-1) ?? null : current));
    setSelectedAttachment((current) => (deleteIds.has(getAttachmentHostId(current)) ? null : current));
    setSelectedOpening((current) => (deleteIds.has(getOpeningHostId(current)) ? null : current));
  };

  const deleteObject = (objectId) => {
    deleteObjects([objectId]);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (
        target?.isContentEditable ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const modifierPressed = event.ctrlKey || event.metaKey;
      const nudgeStep = event.altKey ? 0.1 : event.shiftKey ? 1 : EDITOR_GRID.snapStep;
      const nudgeDeltas = {
        arrowdown: { z: nudgeStep },
        arrowleft: { x: -nudgeStep },
        arrowright: { x: nudgeStep },
        arrowup: { z: -nudgeStep }
      };

      if (modifierPressed && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoObjects();
        } else {
          undoObjects();
        }
        return;
      }
      if (modifierPressed && key === "y") {
        event.preventDefault();
        redoObjects();
        return;
      }
      if (modifierPressed && key === "d") {
        event.preventDefault();
        duplicateSelectedObject();
        return;
      }
      if (modifierPressed && key === "a") {
        event.preventDefault();
        selectAllObjectsOnActiveFloor();
        return;
      }
      if (modifierPressed && key === "c") {
        if (copySelectedObjectsToClipboard()) {
          event.preventDefault();
        }
        return;
      }
      if (modifierPressed && key === "v") {
        if (pasteClipboardObjects()) {
          event.preventDefault();
        }
        return;
      }

      const cameraShortcutMap = {
        1: "orbit",
        2: "top",
        3: "front",
        4: "side"
      };
      if (!modifierPressed && !event.shiftKey && cameraShortcutMap[key]) {
        event.preventDefault();
        handleCameraViewChange(cameraShortcutMap[key]);
        return;
      }

      const floorShortcut =
        !modifierPressed && ["pageup", "]", "=", "+"].includes(key)
          ? 1
          : !modifierPressed && ["pagedown", "[", "-", "_"].includes(key)
            ? -1
            : 0;
      if (floorShortcut) {
        event.preventDefault();
        handleFloorChange(activeFloor + floorShortcut);
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        const hadTransientState = Boolean(
          activeBuildAsset ||
          activeTool !== "select" ||
          draggedAsset ||
          dropRequest ||
          movingAttachment ||
          movingOpening ||
          roomDraft ||
          wallAttachmentPreview ||
          wallDraft ||
          wallOpeningPreview
        );
        clearHostedToolState();
        setDraggedAsset(null);
        setDropRequest(null);
        setActiveTool("select");
        if (!hadTransientState) clearEditorSelection();
        return;
      }

      if (!modifierPressed && !selectedOpening && !selectedAttachment && ["q", "e"].includes(key)) {
        const anchorId = selectedObjectIds.includes(selectedObjectId)
          ? selectedObjectId
          : selectedObjectIds.at(-1) ?? selectedObjectId;
        const target = objects.find((object) => object.id === anchorId);
        if (target && !isTransformLockedObject(target)) {
          event.preventDefault();
          const step = event.altKey ? Math.PI / 36 : event.shiftKey ? Math.PI / 4 : Math.PI / 12;
          const direction = key === "e" ? 1 : -1;
          const deltaYaw = direction * step;
          if (selectedObjectIds.length > 1 && selectedObjectIds.includes(anchorId)) {
            rotateSelectedObjectsAroundCenter(anchorId, deltaYaw, "keyboard-group-rotate");
          } else {
            const [pitch = 0, yaw = 0, roll = 0] = target.rotation ?? [0, 0, 0];
            rotateObjectToRotation(
              target.id,
              [pitch, Number((yaw + deltaYaw).toFixed(4)), roll],
              "keyboard-rotate"
            );
          }
        }
        return;
      }

      const nudgeDelta = !modifierPressed ? nudgeDeltas[key] : null;
      if (nudgeDelta) {
        const horizontalDelta = nudgeDelta.x ?? 0;
        const verticalDelta = -nudgeDelta.z || 0;
        if (selectedOpening && selectedOpeningObject) {
          const patch = {};
          if (horizontalDelta) patch.offset = Number(((selectedOpeningObject.offset ?? 0) + horizontalDelta).toFixed(2));
          if (verticalDelta && selectedOpeningObject.type !== "door") {
            patch.sillHeight = Number(((selectedOpeningObject.sillHeight ?? 0) + verticalDelta).toFixed(2));
          }
          if (Object.keys(patch).length) {
            event.preventDefault();
            updateOpeningProperties(selectedOpening, patch);
          }
          return;
        }

        if (selectedAttachment && selectedAttachmentObject) {
          const patch = {};
          if (horizontalDelta) patch.offset = Number(((selectedAttachmentObject.offset ?? 0) + horizontalDelta).toFixed(2));
          if (verticalDelta) patch.centerY = Number(((selectedAttachmentObject.centerY ?? 0) + verticalDelta).toFixed(2));
          if (Object.keys(patch).length) {
            event.preventDefault();
            updateAttachmentProperties(selectedAttachment, patch);
          }
          return;
        }

        const anchorId = selectedObjectIds.includes(selectedObjectId)
          ? selectedObjectId
          : selectedObjectIds.at(-1) ?? selectedObjectId;
        const anchorObject = objects.find((object) => object.id === anchorId);
        if (anchorObject && !isObjectLocked(anchorObject) && !isObjectHidden(anchorObject)) {
          event.preventDefault();
          const [x = 0, y = 0, z = 0] = anchorObject.position ?? [0, 0, 0];
          const nextPosition = [
            Number((x + (nudgeDelta.x ?? 0)).toFixed(2)),
            y,
            Number((z + (nudgeDelta.z ?? 0)).toFixed(2))
          ];
          if (selectedObjectIds.length > 1 && selectedObjectIds.includes(anchorId)) {
            moveSelectedObjectsByAnchor(anchorId, nextPosition, "keyboard-nudge");
          } else {
            moveObjectToPosition(anchorId, nextPosition, "keyboard-nudge");
          }
        }
        return;
      }

      if (!["Backspace", "Delete"].includes(event.key)) return;

      if (selectedOpening || selectedAttachment || selectedObjectIds.length > 1 || selectedObjectId) {
        event.preventDefault();
        deleteSelectedEntity();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeBuildAsset, activeFloor, activeTool, draggedAsset, dropRequest, editorClipboard, movingAttachment, movingOpening, roomDraft, selectedAttachment, selectedAttachmentObject, selectedObjectId, selectedObjectIds, selectedOpening, selectedOpeningObject, wallAttachmentPreview, wallDraft, wallOpeningPreview, objects]);

  const deleteRoomWall = (roomId, wall) => {
    const room = objects.find((object) => object.id === roomId && object.type === "room");
    if (!room || isObjectLocked(room)) return;

    const replacementWalls = decomposeRoomToWalls(room, {
      omitWall: wall,
      idFactory: (wallName) => `catalog-object-${wallName}-${crypto.randomUUID?.() ?? Date.now()}`
    });
    setObjects((current) =>
      current.flatMap((object) => (object.id === roomId ? replacementWalls : object))
    );
    setSelectedObjectId(replacementWalls[0]?.id ?? null);
    setSelectedObjectIds(replacementWalls[0]?.id ? [replacementWalls[0].id] : []);
    setSelectedAttachment(null);
    setSelectedOpening(null);
  };

  const selectObject = (objectId, gesture = {}) => {
    if (!objects.some((object) => object.id === objectId)) return;
    clearHostedToolState();
    const additive = Boolean(gesture?.additive);
    const range = Boolean(gesture?.range);
    const currentSelectedIds = selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    let nextSelectedIds = [objectId];

    if (range && selectedObjectId) {
      const orderedIds = objects.map((object) => object.id);
      const startIndex = orderedIds.indexOf(selectedObjectId);
      const endIndex = orderedIds.indexOf(objectId);
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        nextSelectedIds = orderedIds.slice(from, to + 1);
      }
    } else if (additive) {
      nextSelectedIds = currentSelectedIds.includes(objectId)
        ? currentSelectedIds.filter((selectedId) => selectedId !== objectId)
        : [...currentSelectedIds, objectId];
    }

    setSelectedObjectIds(nextSelectedIds);
    setSelectedObjectId(nextSelectedIds.includes(objectId) ? objectId : nextSelectedIds.at(-1) ?? null);
    setSelectedAttachment(null);
    setSelectedOpening(null);
  };

  const patchObjectEditorState = (objectId, patch) => {
    patchObjectsEditorState([objectId], patch);
  };

  const patchObjectsEditorState = (objectIds, patch) => {
    const patchIds = new Set(objectIds.filter(Boolean));
    if (!patchIds.size) return;
    setObjects((current) =>
      current.map((object) =>
        patchIds.has(object.id)
          ? {
              ...object,
              metadata: {
                ...object.metadata,
                editor: {
                  ...(object.metadata?.editor ?? {}),
                  ...patch
                }
              }
            }
          : object
      )
    );
  };

  const toggleObjectHidden = (objectId) => {
    const object = objects.find((candidate) => candidate.id === objectId);
    if (!object) return;
    patchObjectEditorState(objectId, { hidden: !isObjectHidden(object) });
  };

  const toggleObjectLocked = (objectId) => {
    const object = objects.find((candidate) => candidate.id === objectId);
    if (!object) return;
    patchObjectEditorState(objectId, { locked: !isObjectLocked(object) });
  };

  const setSelectedObjectsHidden = (hidden) => {
    patchObjectsEditorState(selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [], { hidden });
  };

  const setSelectedObjectsLocked = (locked) => {
    patchObjectsEditorState(selectedObjectIds.length ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [], { locked });
  };

  const setFloorObjectsHidden = (floor, hidden) => {
    patchObjectsEditorState(
      objects.filter((object) => getEditorObjectFloor(object) === floor).map((object) => object.id),
      { hidden }
    );
  };

  const setFloorObjectsLocked = (floor, locked) => {
    patchObjectsEditorState(
      objects.filter((object) => getEditorObjectFloor(object) === floor).map((object) => object.id),
      { locked }
    );
  };

  const canDropOnFloor = (asset) => validateHostEligibility(asset, null).allowed && canPlaceOnFloor(asset);

  const shouldActivateAssetTool = (asset) =>
    ["draw-room", "draw-wall"].includes(asset?.placementMode) ||
    requiresWallHost(asset) ||
    requiresRoomHost(asset) ||
    !canDropOnFloor(asset);

  const placeDroppedAsset = (point, asset = allCatalogAssets[0] ?? STUDIO_CATALOG_ASSETS[0]) => {
    if (shouldActivateAssetTool(asset)) {
      setActiveBuildAsset(asset);
      setDraggedAsset(null);
      setDropRequest(null);
      return;
    }
    const prefabPosition = getLibraryPrefabDropPosition(point, asset);
    if (prefabPosition && createLibraryPrefabObjectAt(prefabPosition, asset)) {
      setDraggedAsset(null);
      setDropRequest(null);
      return;
    }
    const size = asset.size ?? [1, 1, 1];
    const x = clampToBuildableCell(point.x, buildable.width, size[0]);
    const z = clampToBuildableCell(point.z, buildable.depth, size[2]);
    const actualHeight = asset.placementMode === "floor-structural" && ["column", "wall"].includes(asset.supportKind)
      ? EDITOR_FLOORS.floorHeight
      : size[1];
    createCatalogObjectAt([x, Number((activeFloorBaseY + actualHeight / 2).toFixed(2)), z], asset);
    setDraggedAsset(null);
    setDropRequest(null);
  };

  const handleViewportDrop = (event) => {
    event.preventDefault();
    const assetId = event.dataTransfer.getData("application/x-ploton-asset");
    const asset = findCatalogAsset(assetId || draggedAsset?.id) ?? draggedAsset;
    if (!asset) return;
    if (shouldActivateAssetTool(asset)) {
      setActiveBuildAsset(asset);
      setDraggedAsset(null);
      return;
    }
    setDropRequest({
      id: `${asset.id}-${Date.now()}`,
      asset,
      clientX: event.clientX,
      clientY: event.clientY
    });
  };

  const workflowUsesAssetCatalog = activeWorkflowMode === "build" || activeWorkflowMode === "items";
  const workflowContextWidth = workflowUsesAssetCatalog && catalogCollapsed ? 56 : catalogWidth;
  const floorStackSummary = buildFloorStackSummary(objects, activeFloor);
  const quickActionSelectionVisible = Boolean(!selectedOpening && !selectedAttachment && (selectedObjectId || selectedObjectIds.length));
  const quickActionSelectionObjects = selectedObjectIds.length ? selectedObjects : selectedObject ? [selectedObject] : [];
  const quickActionEditableObjects = quickActionSelectionObjects.filter((object) => !isObjectLocked(object) && !isObjectHidden(object));
  const quickActionCanMove = quickActionEditableObjects.some((object) => isGroupMoveEligibleObject(object));
  const quickActionCanTransform = quickActionEditableObjects.length === 1 && !isTransformLockedObject(quickActionEditableObjects[0]);
  const quickActionCanDelete = quickActionSelectionObjects.some((object) => !isObjectLocked(object));
  const quickActionCanDuplicate = quickActionEditableObjects.length > 0;
  const quickActionCanSaveToLibrary = quickActionEditableObjects.length === 1 && !selectedAttachment && !selectedOpening;
  const quickActionSelectionType = quickActionSelectionObjects.length > 1
    ? `${quickActionSelectionObjects.length} selected`
    : selectedObject?.type === "room"
      ? "room"
      : selectedObject && isStructuralWallObject(selectedObject)
        ? "wall"
        : selectedObject?.placementMode ?? "object";

  return (
    <main className="studio-editor-shell">
      <StudioEditorHeader
        activeCategoryLabel={activeCategoryLabel}
        activeFloor={activeFloor}
        activeToolLabel={activeToolLabel}
        canRedo={canRedoObjects}
        canUndo={canUndoObjects}
        clipboardCount={editorClipboard?.sources?.length ?? 0}
        lastSavedAt={lastSavedAt}
        objectCount={objects.length}
        onExportFloorplanInterop={exportFloorplanInteropJson}
        onExportPascalSceneGraph={exportPascalSceneGraphJson}
        onExportScene={exportSceneJson}
        onImportSceneFile={requestSceneFileImport}
        onLoadScene={loadScene}
        onSaveScene={saveScene}
        roomCount={roomCount}
        saveStatus={saveStatus}
        selectedLabel={selectedHudLabel}
        snapEnabled={snapEnabled}
        wallViewMode={wallViewMode}
      />
      <input
        ref={sceneImportInputRef}
        accept="application/json,.json"
        className="studio-editor-hidden-file-input"
        onChange={importSceneFile}
        tabIndex={-1}
        type="file"
      />

      <div
        className={[
          "studio-editor-workbench",
          workflowUsesAssetCatalog && catalogCollapsed ? "is-catalog-collapsed" : "",
          `is-workflow-${activeWorkflowMode}`
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          "--studio-catalog-width": `${workflowContextWidth}px`,
          "--studio-context-width": `${workflowContextWidth}px`
        }}
      >
        <StudioWorkflowPanel
          activeAssetId={activeBuildAsset?.id}
          activeCategoryId={activeCategoryId}
          activeFloor={activeFloor}
          activeMode={activeWorkflowMode}
          assets={allCatalogAssets}
          cameraView={cameraView}
          catalogCollapsed={catalogCollapsed}
          gridVisible={gridVisible}
          generationStatus={generationStatus}
          objectCount={objects.length}
          objects={objects}
          onAssetPick={handleCatalogAssetPick}
          onCategoryChange={handleCategoryChange}
          onCollapseToggle={() => setCatalogCollapsed((value) => !value)}
          onDragAssetStart={setDraggedAsset}
          onFloorFocus={handleFloorChange}
          onGenerateAsset={generateCatalogAssetFromPrompt}
          onGenerateSceneFromBrief={generateSceneFromBrief}
          onModeChange={setActiveWorkflowMode}
          onResizeStart={handleCatalogResizeStart}
          onSelectAttachment={selectAttachment}
          onSelectObject={selectObject}
          onSelectOpening={selectOpening}
          onSetFloorHidden={setFloorObjectsHidden}
          onSetFloorLocked={setFloorObjectsLocked}
          onToggleHidden={toggleObjectHidden}
          onToggleLocked={toggleObjectLocked}
          openingCount={openingCount}
          recentAssetIds={recentAssetIds}
          roomCount={roomCount}
          selectedAttachmentId={selectedAttachment?.attachmentId}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          selectedOpeningId={selectedOpening?.openingId}
          snapEnabled={snapEnabled}
          wallViewMode={wallViewMode}
        />
        <section
          className={`studio-editor-viewport${cameraView === "top" ? " is-plan-mode" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleViewportDrop}
        >
          <StudioEditorToolbar
            activeTool={activeTool}
            canDuplicate={Boolean(selectedObject && !selectedObjectLocked && !selectedObjectHidden && !selectedAttachment && !selectedOpening)}
            canRedo={canRedoObjects}
            canUndo={canUndoObjects}
            onToolChange={handleToolChange}
            planMode={cameraView === "top"}
          />
          <StudioEditorViewDisplayBar
            cameraView={cameraView}
            gridVisible={gridVisible}
            onCameraViewChange={handleCameraViewChange}
            onGridToggle={() => setGridVisible((value) => !value)}
            onSnapToggle={() => setSnapEnabled((value) => !value)}
            onWallViewModeChange={setWallViewMode}
            snapEnabled={snapEnabled}
            wallViewMode={wallViewMode}
          />
          <StudioViewportFloorStack
            activeFloor={activeFloor}
            activeFloorBaseY={activeFloorBaseY}
            floors={floorStackSummary}
            onFloorChange={handleFloorChange}
            onSetFloorHidden={setFloorObjectsHidden}
            onSetFloorLocked={setFloorObjectsLocked}
          />
          {objects.length === 0 ? <StudioEmptySceneGuide activeFloor={activeFloor} planMode={cameraView === "top"} /> : null}
          <StudioEditorCanvasHud
            activeCategoryLabel={activeCategoryLabel}
            activeFloor={activeFloor}
            activeModeLabel={activeModeLabel}
            activeToolLabel={activeToolLabel}
            draftLabel={draftHudLabel}
            objectCount={objects.length}
            placementFeedback={placementFeedback}
            roomCount={roomCount}
            selectedLabel={selectedHudLabel}
            selectedTransformLabel={selectedTransformLabel}
            snapEnabled={snapEnabled}
          />
          {quickActionSelectionVisible ? (
            <StudioSelectionActionBar
              activeTool={activeTool}
              canDelete={quickActionCanDelete}
              canDuplicate={quickActionCanDuplicate}
              canMove={quickActionCanMove}
              canRotate={quickActionCanTransform && cameraView !== "top"}
              canSaveToLibrary={quickActionCanSaveToLibrary}
              canScale={quickActionCanTransform}
              onDelete={deleteSelectedEntity}
              onDuplicate={duplicateSelectedObject}
              onSaveToLibrary={saveSelectedObjectToLibrary}
              onToolChange={handleToolChange}
              selectionLabel={selectedHudLabel}
              selectionType={quickActionSelectionType}
              transformLabel={selectedTransformLabel}
            />
          ) : null}
          <EditorViewport
            activeFloor={activeFloor}
            activeFloorBaseY={activeFloorBaseY}
            activeRoofAsset={activeRoofAsset}
            activeRoomAsset={activeRoomAsset}
            activeWallAttachmentAsset={activeWallAttachmentAsset}
            activeWallDrawAsset={activeWallDrawAsset}
            activeWallOpeningAsset={activeWallOpeningAsset}
            activeTool={activeTool}
            cameraView={cameraView}
            dropRequest={dropRequest}
            gridVisible={gridVisible}
            movingAttachment={movingAttachment}
            movingOpening={movingOpening}
            objects={objects}
            onAttachRoof={attachRoofToRoom}
            onDeleteObject={deleteObject}
            onDeleteAttachment={deleteAttachment}
            onDeleteOpening={deleteOpening}
            onDeleteRoomWall={deleteRoomWall}
            onDuplicateObject={duplicateSelectedObject}
            onDragObject={moveObjectToPosition}
            onDragSelectedObjects={moveSelectedObjectsByAnchor}
            onDropPointResolved={placeDroppedAsset}
            onGroundPointerDown={handleGroundPointerDown}
            onGroundMarqueeSelect={handleGroundMarqueeSelect}
            onMoveWallNormal={moveWallNormal}
            onRequestMoveObject={() => handleToolChange("move")}
            onAttachmentDragStart={startAttachmentDrag}
            onOpeningDragStart={startOpeningDrag}
            onAttachmentMoveEnd={endAttachmentMove}
            onOpeningMoveEnd={endOpeningMove}
            onResizeRoom={resizeRoomByWall}
            onResizeWallEndpoint={resizeWallEndpoint}
            onRotateObject={rotateObjectToRotation}
            onRoomDraftChange={handleRoomDraftChange}
            onRoomDraftCommit={handleRoomDraftCommit}
            onScaleObject={scaleObjectToSize}
            onSelectAttachment={selectAttachment}
            onSelectObject={selectObject}
            onSelectOpening={selectOpening}
            onWallDraftChange={handleWallDraftChange}
            onWallDraftCommit={handleWallDraftCommit}
            onWallAttachmentCommit={commitWallAttachment}
            onWallAttachmentPreview={handleWallAttachmentPreview}
            onWallOpeningCommit={commitWallOpening}
            onWallOpeningPreview={handleWallOpeningPreview}
            roomDraft={roomDraft}
            resizeHandleHostRoomId={selectedResizeHostRoomId}
            selectedAttachmentId={selectedAttachment?.attachmentId}
            selectedObjectId={selectedObjectId}
            selectedObjectIds={selectedObjectIds}
            selectedOpeningId={selectedOpening?.openingId}
            wallDraft={wallDraft}
            wallAttachmentPreview={wallAttachmentPreview}
            wallOpeningPreview={wallOpeningPreview}
            wallViewMode={wallViewMode}
          />
          <div className="studio-editor-viewport-badge">
            <span>m</span>
            <strong>{activeToolLabel}</strong>
          </div>
        </section>
        <StudioEditorInspector
          activeFloor={activeFloor}
          attachmentCount={attachmentCount}
          cameraView={cameraView}
          gridVisible={gridVisible}
          hiddenObjectCount={hiddenObjectCount}
          joinedWallCount={joinedWallCount}
          lockedObjectCount={lockedObjectCount}
          openingCount={openingCount}
          objects={objects}
          onDeleteSelection={deleteSelectedEntity}
          onDuplicateSelection={duplicateSelectedObject}
          onFloorChange={handleFloorChange}
          onHideSelection={() => setSelectedObjectsHidden(true)}
          onLockSelection={() => setSelectedObjectsLocked(true)}
          onMoveObject={moveObjectToPosition}
          onMoveSelection={() => handleToolChange("move")}
          onRotateObject={rotateObjectToRotation}
          onScaleObject={scaleObjectToSize}
          onSelectAttachment={selectAttachment}
          onSelectObject={selectObject}
          onSelectOpening={selectOpening}
          onSetFloorHidden={setFloorObjectsHidden}
          onSetFloorLocked={setFloorObjectsLocked}
          onShowSelection={() => setSelectedObjectsHidden(false)}
          onToggleHidden={toggleObjectHidden}
          onToggleLocked={toggleObjectLocked}
          onUnlockSelection={() => setSelectedObjectsLocked(false)}
          onUpdateAttachment={updateAttachmentProperties}
          onMoveAttachment={(attachmentRef) => startAttachmentDrag(getAttachmentHostId(attachmentRef), attachmentRef?.attachmentId)}
          onMoveOpening={(openingRef) => startOpeningDrag(getOpeningHostId(openingRef), openingRef?.openingId)}
          onUpdateWallSegment={updateWallSegmentProperties}
          onUpdateOpening={updateOpeningProperties}
          selectedAttachment={selectedAttachment}
          selectedAttachmentObject={selectedAttachmentObject}
          selectedObject={selectedObject}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
          selectedOpening={selectedOpening}
          selectedOpeningObject={selectedOpeningObject}
          selectedTransformLabel={selectedTransformLabel}
          showSceneOutliner={activeWorkflowMode !== "scene"}
          snapEnabled={snapEnabled}
        />
      </div>

      <footer className="studio-editor-statusbar" aria-label="에디터 상태">
        <div className="studio-editor-statusbar-group" aria-label="현재 작업">
          <span className="studio-editor-statusbar-group-title">현재 작업</span>
          <span className="studio-editor-status-chip is-strong">
            <em>selected</em>
            <strong>{selectedAttachmentObject?.label ?? selectedOpeningObject?.label ?? selectedObject?.name ?? "none"}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>mode</em>
            <strong>{activeModeLabel}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>catalog</em>
            <strong>{draggedAsset?.label ?? (activeBuildAsset ? `${activeBuildAsset.label} ${["wall-opening", "wall-attached"].includes(activeBuildAsset.placementMode) ? "wall tool" : "tool"}` : "idle")}</strong>
          </span>
          <span
            className={`studio-editor-status-chip is-placement is-${placementFeedback.tone}`}
            data-testid="studio-placement-feedback"
          >
            <em>placement</em>
            <strong>{placementFeedback.statusLabel}</strong>
          </span>
          <span className="studio-editor-status-chip is-host-policy" data-testid="studio-host-policy">
            <em>host</em>
            <strong>{placementFeedback.hostLabel.replace(/^host\s+/, "")}</strong>
          </span>
          <span className="studio-editor-status-chip is-subtle">
            <em>history</em>
            <strong>{canUndoObjects ? "undo" : "-"} / {canRedoObjects ? "redo" : "-"}</strong>
          </span>
        </div>

        <div className="studio-editor-statusbar-group" aria-label="씬 상태">
          <span className="studio-editor-statusbar-group-title">씬 상태</span>
          <span className="studio-editor-status-chip">
            <em>scene</em>
            <strong>{objects.length ? `${objects.length} object` : "empty"}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>rooms</em>
            <strong>{roomCount}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>openings</em>
            <strong>{openingCount}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>floor</em>
            <strong>{activeFloor}F / {activeFloorBaseY}m</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>snap</em>
            <strong>{snapEnabled ? `${EDITOR_GRID.snapStep}m` : "off"}</strong>
          </span>
        </div>

        <div className="studio-editor-statusbar-group" aria-label="저장 및 보기">
          <span className="studio-editor-statusbar-group-title">저장 및 보기</span>
          <span className={`studio-editor-status-chip is-save is-${saveStatus}`}>
            <em>save</em>
            <strong>{saveStatus}{lastSavedAt ? ` / ${new Date(lastSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : ""}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>camera</em>
            <strong>{cameraView}</strong>
          </span>
          <span className="studio-editor-status-chip">
            <em>walls</em>
            <strong>{wallViewMode}</strong>
          </span>
        </div>
      </footer>
    </main>
  );
}
