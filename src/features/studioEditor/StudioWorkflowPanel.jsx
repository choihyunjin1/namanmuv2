import React from "react";
import { Cuboid, Layers3, PanelRightClose } from "lucide-react";
import { CAMERA_VIEW_OPTIONS, EDITOR_GRID } from "./editorDefaults.js";
import { StudioAssetCatalog } from "./StudioAssetCatalog.jsx";
import { StudioSceneOutliner } from "./StudioSceneOutliner.jsx";

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

export function isStudioWorkflowMode(value) {
  return STUDIO_WORKFLOW_MODES.some((mode) => mode.id === value);
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

export function StudioWorkflowPanel({
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
