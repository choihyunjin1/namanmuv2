import React from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { EDITOR_FLOORS, EDITOR_GRID, EDITOR_TOOLS } from "./editorDefaults.js";

const PASCAL_ICON_BASE = "/assets/pascal-icons";
const PASCAL_TOOL_ICONS = {
  select: `${PASCAL_ICON_BASE}/select.webp`,
  duplicate: `${PASCAL_ICON_BASE}/collection.webp`,
  pan: `${PASCAL_ICON_BASE}/pan.webp`,
  move: `${PASCAL_ICON_BASE}/cube.webp`,
  rotate: `${PASCAL_ICON_BASE}/rotate.webp`,
  scale: `${PASCAL_ICON_BASE}/mesh.webp`,
  snap: `${PASCAL_ICON_BASE}/settings.webp`,
  erase: `${PASCAL_ICON_BASE}/wallcut.webp`
};
const PASCAL_CAMERA_ICONS = {
  orbit: `${PASCAL_ICON_BASE}/orbit.webp`,
  top: `${PASCAL_ICON_BASE}/topview.webp`,
  front: `${PASCAL_ICON_BASE}/building.webp`,
  side: `${PASCAL_ICON_BASE}/scene.webp`
};
const PASCAL_VIEW_ICONS = {
  grid: `${PASCAL_ICON_BASE}/floorplan.webp`,
  snap: `${PASCAL_ICON_BASE}/settings.webp`
};

export const WALL_VIEW_MODES = [
  { id: "cutaway", label: "Cutaway", iconSrc: `${PASCAL_ICON_BASE}/wallcut.webp` },
  { id: "up", label: "Full", iconSrc: `${PASCAL_ICON_BASE}/room.webp` },
  { id: "low", label: "Low", iconSrc: `${PASCAL_ICON_BASE}/walllow.webp` },
  { id: "translucent", label: "Translucent", iconSrc: `${PASCAL_ICON_BASE}/wall.webp` }
];

export const VIEW_DISPLAY_CAMERA_OPTIONS = [
  { id: "orbit", label: "3D", shortLabel: "3D" },
  { id: "top", label: "2D", shortLabel: "2D" },
  { id: "front", label: "Front", shortLabel: "Front" },
  { id: "side", label: "Side", shortLabel: "Side" }
];

function PascalImageIcon({ src }) {
  return <img alt="" draggable="false" src={src} />;
}

function ToolGlyph({ icon: Icon, iconSrc }) {
  if (iconSrc) return <PascalImageIcon src={iconSrc} />;
  return <Icon size={18} strokeWidth={2.2} />;
}

function formatViewportMeters(value) {
  return `${Number(value ?? 0).toFixed(2).replace(/\.?0+$/, "")}m`;
}

function IconButton({ active = false, disabled = false, icon: Icon, iconSrc, label, onClick }) {
  return (
    <button
      aria-label={label}
      className={[active ? "is-active" : "", iconSrc ? "has-image-icon" : ""].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <ToolGlyph icon={Icon} iconSrc={iconSrc} />
    </button>
  );
}

function ToolbarGroup({ children, label }) {
  return (
    <div className="studio-editor-toolbar-group" aria-label={label}>
      {children}
    </div>
  );
}

export function StudioEditorToolbar({
  activeTool,
  canDuplicate,
  canRedo,
  canUndo,
  onToolChange,
  planMode = false
}) {
  const mainTools = EDITOR_TOOLS.filter((tool) => ["select", "duplicate", "pan", "move", "rotate", "scale"].includes(tool.id));
  const historyTools = EDITOR_TOOLS.filter((tool) => ["undo", "redo"].includes(tool.id));
  const utilityTools = EDITOR_TOOLS.filter((tool) => ["erase"].includes(tool.id));
  const renderTool = (tool) => {
    const disabled =
      (planMode && tool.id === "rotate") ||
      (tool.id === "duplicate" && !canDuplicate) ||
      (tool.id === "undo" && !canUndo) ||
      (tool.id === "redo" && !canRedo);
    return (
      <IconButton
        key={tool.id}
        active={!disabled && activeTool === tool.id}
        disabled={disabled}
        icon={tool.icon}
        iconSrc={PASCAL_TOOL_ICONS[tool.id]}
        label={tool.label}
        onClick={() => onToolChange(tool.id)}
      />
    );
  };

  return (
    <aside className="studio-editor-toolbar" aria-label="편집 도구">
      <ToolbarGroup label="편집">
        {mainTools.map(renderTool)}
      </ToolbarGroup>
      <ToolbarGroup label="히스토리">
        {historyTools.map(renderTool)}
      </ToolbarGroup>
      <ToolbarGroup label="보조">
        {utilityTools.map(renderTool)}
      </ToolbarGroup>
    </aside>
  );
}

function ViewDisplaySegment({ active = false, iconSrc, label, onClick, title }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={active ? "is-active" : ""}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {iconSrc ? <PascalImageIcon src={iconSrc} /> : null}
      <span>{label.replace(/^View\s+|^Display\s+/, "")}</span>
    </button>
  );
}

export function StudioEditorViewDisplayBar({
  cameraView,
  gridVisible,
  onCameraViewChange,
  onGridToggle,
  onSnapToggle,
  onWallViewModeChange,
  snapEnabled,
  wallViewMode
}) {
  return (
    <aside className="studio-editor-view-display-bar" aria-label="뷰 및 표시 모드">
      <div className="studio-editor-view-display-group" aria-label="View">
        <strong>View</strong>
        {VIEW_DISPLAY_CAMERA_OPTIONS.map((option) => (
          <ViewDisplaySegment
            active={cameraView === option.id}
            iconSrc={PASCAL_CAMERA_ICONS[option.id]}
            key={option.id}
            label={`View ${option.label}`}
            onClick={() => onCameraViewChange(option.id)}
          />
        ))}
      </div>
      <div className="studio-editor-view-display-group" aria-label="Display">
        <strong>Display</strong>
        <ViewDisplaySegment
          active={gridVisible}
          iconSrc={PASCAL_VIEW_ICONS.grid}
          label="Display Grid"
          onClick={onGridToggle}
        />
        <ViewDisplaySegment
          active={snapEnabled}
          iconSrc={PASCAL_VIEW_ICONS.snap}
          label="Display Snap"
          onClick={onSnapToggle}
          title={`Display Snap ${snapEnabled ? "on" : "off"}`}
        />
        {WALL_VIEW_MODES.map((mode) => (
          <ViewDisplaySegment
            active={wallViewMode === mode.id}
            iconSrc={mode.iconSrc}
            key={mode.id}
            label={`Display ${mode.label}`}
            onClick={() => onWallViewModeChange(mode.id)}
          />
        ))}
      </div>
    </aside>
  );
}

export function StudioEditorCanvasHud({
  activeCategoryLabel,
  activeFloor,
  activeModeLabel,
  activeToolLabel,
  draftLabel,
  objectCount,
  placementFeedback,
  roomCount,
  selectedLabel,
  selectedTransformLabel,
  snapEnabled
}) {
  const primaryLabel = draftLabel ?? selectedLabel;
  return (
    <aside className="studio-editor-canvas-hud" aria-label="에디터 상태">
      <div className="studio-editor-command-pill">
        <span>{activeToolLabel}</span>
        <strong>{primaryLabel}</strong>
        <div className="studio-editor-command-meta">
          <em>{activeCategoryLabel}</em>
          <em>{activeModeLabel}</em>
          <em>{activeFloor}F</em>
          <em className={`is-placement-${placementFeedback?.tone ?? "idle"}`}>
            {placementFeedback?.statusLabel ?? "idle"}
          </em>
          <em>{placementFeedback?.hostLabel ?? "host none"}</em>
          <em>{snapEnabled ? `${EDITOR_GRID.snapStep}m` : "snap off"}</em>
          <em>{objectCount} obj</em>
          <em>{roomCount} room</em>
          {selectedTransformLabel !== "none" ? <em>{selectedTransformLabel}</em> : null}
        </div>
      </div>
    </aside>
  );
}

export function StudioViewportFloorStack({
  activeFloor,
  activeFloorBaseY,
  floors = [],
  onFloorChange,
  onSetFloorHidden,
  onSetFloorLocked
}) {
  const activeFloorSummary = floors.find((floor) => floor.floor === activeFloor) ?? {
    allHidden: false,
    allLocked: false,
    floor: activeFloor,
    hiddenCount: 0,
    lockedCount: 0,
    objectCount: 0,
    roomCount: 0
  };
  const activeFloorEmpty = activeFloorSummary.objectCount === 0;

  return (
    <aside className="studio-editor-floor-stack" aria-label="층 스택 내비게이터">
      <header className="studio-editor-floor-stack-header">
        <div>
          <span>Floor Stack</span>
          <strong>{activeFloor}F</strong>
        </div>
        <em>{formatViewportMeters(activeFloorBaseY)}</em>
      </header>
      <div className="studio-editor-floor-stack-controls" aria-label="층 이동">
        <button
          aria-label="Floor Up"
          onClick={() => onFloorChange?.(activeFloor + 1)}
          title="Floor Up"
          type="button"
        >
          <ChevronUp size={15} />
        </button>
        <button
          aria-label="Floor Down"
          disabled={activeFloor <= EDITOR_FLOORS.min}
          onClick={() => onFloorChange?.(activeFloor - 1)}
          title="Floor Down"
          type="button"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <div className="studio-editor-floor-stack-state-controls" aria-label="현재층 표시 및 잠금">
        <button
          aria-label={activeFloorSummary.allHidden ? `Show ${activeFloor}F Floor` : `Hide ${activeFloor}F Floor`}
          aria-pressed={activeFloorSummary.allHidden}
          disabled={activeFloorEmpty}
          onClick={() => onSetFloorHidden?.(activeFloor, !activeFloorSummary.allHidden)}
          title={activeFloorSummary.allHidden ? `Show ${activeFloor}F Floor` : `Hide ${activeFloor}F Floor`}
          type="button"
        >
          {activeFloorSummary.allHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{activeFloorSummary.allHidden ? "Show" : "Hide"}</span>
        </button>
        <button
          aria-label={activeFloorSummary.allLocked ? `Unlock ${activeFloor}F Floor` : `Lock ${activeFloor}F Floor`}
          aria-pressed={activeFloorSummary.allLocked}
          disabled={activeFloorEmpty}
          onClick={() => onSetFloorLocked?.(activeFloor, !activeFloorSummary.allLocked)}
          title={activeFloorSummary.allLocked ? `Unlock ${activeFloor}F Floor` : `Lock ${activeFloor}F Floor`}
          type="button"
        >
          {activeFloorSummary.allLocked ? <Lock size={14} /> : <Unlock size={14} />}
          <span>{activeFloorSummary.allLocked ? "Unlock" : "Lock"}</span>
        </button>
      </div>
      <ol className="studio-editor-floor-stack-list">
        {floors.map((floor) => (
          <li key={floor.floor}>
            <button
              aria-label={`Focus ${floor.floor}F floor, ${floor.objectCount} objects, ${floor.hiddenCount} hidden, ${floor.lockedCount} locked`}
              aria-pressed={floor.active}
              className={[
                floor.active ? "is-active" : "",
                floor.occupied ? "is-occupied" : "",
                floor.allHidden ? "is-floor-hidden" : "",
                floor.allLocked ? "is-floor-locked" : "",
                floor.hiddenCount > 0 && !floor.allHidden ? "has-hidden-objects" : "",
                floor.lockedCount > 0 && !floor.allLocked ? "has-locked-objects" : "",
                floor.floor > activeFloor ? "is-above" : "",
                floor.floor < activeFloor ? "is-below" : ""
              ].filter(Boolean).join(" ")}
              data-floor={`${floor.floor}F`}
              onClick={() => onFloorChange?.(floor.floor)}
              title={`${floor.floor}F · ${floor.objectCount} objects · ${floor.hiddenCount} hidden · ${floor.lockedCount} locked`}
              type="button"
            >
              <strong>{floor.floor}F</strong>
              <span>{floor.objectCount} obj · {floor.hiddenCount} hide</span>
              <em>{floor.roomCount} room · {floor.lockedCount} lock</em>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function StudioEmptySceneGuide({ activeFloor, planMode }) {
  return (
    <div
      aria-label="빈 씬 건축 가능 영역"
      className={`studio-editor-empty-scene-guide${planMode ? " is-plan-mode" : ""}`}
      data-floor={`${activeFloor}F`}
    >
      <div className="studio-editor-empty-scene-footprint" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="studio-editor-empty-scene-shell" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function StudioSelectionActionBar({
  activeTool,
  canDelete = false,
  canDuplicate = false,
  canSaveToLibrary = false,
  canMove = false,
  canRotate = false,
  canScale = false,
  onDelete,
  onDuplicate,
  onSaveToLibrary,
  onToolChange,
  selectionLabel,
  selectionType,
  transformLabel
}) {
  if (!selectionLabel || selectionLabel === "none") return null;

  const actionButtons = [
    { id: "move", iconSrc: PASCAL_TOOL_ICONS.move, label: "Quick Move", shortLabel: "Move", enabled: canMove, onClick: () => onToolChange?.("move") },
    { id: "rotate", iconSrc: PASCAL_TOOL_ICONS.rotate, label: "Quick Rotate", shortLabel: "Rotate", enabled: canRotate, onClick: () => onToolChange?.("rotate") },
    { id: "scale", iconSrc: PASCAL_TOOL_ICONS.scale, label: "Quick Scale", shortLabel: "Scale", enabled: canScale, onClick: () => onToolChange?.("scale") },
    { id: "duplicate", iconSrc: PASCAL_TOOL_ICONS.duplicate, label: "Quick Duplicate", shortLabel: "Duplicate", enabled: canDuplicate, onClick: onDuplicate },
    { id: "library", iconSrc: PASCAL_TOOL_ICONS.duplicate, label: "Quick Save to Mine", shortLabel: "Save", enabled: canSaveToLibrary, onClick: onSaveToLibrary },
    { id: "delete", iconSrc: PASCAL_TOOL_ICONS.erase, label: "Quick Delete", shortLabel: "Delete", enabled: canDelete, onClick: onDelete }
  ];

  return (
    <aside className="studio-editor-selection-action-bar" aria-label="선택 객체 빠른 작업">
      <div className="studio-editor-selection-action-summary">
        <span>{selectionType}</span>
        <strong>{selectionLabel}</strong>
        {transformLabel && transformLabel !== "none" ? <em>{transformLabel}</em> : null}
      </div>
      <div className="studio-editor-selection-action-buttons" aria-label="빠른 작업 버튼">
        {actionButtons.map((action) => (
          <button
            aria-label={action.label}
            aria-pressed={["move", "rotate", "scale"].includes(action.id) && activeTool === action.id}
            className={activeTool === action.id ? "is-active" : ""}
            disabled={!action.enabled}
            key={action.id}
            onClick={action.onClick}
            title={action.label}
            type="button"
          >
            <PascalImageIcon src={action.iconSrc} />
            <span>{action.shortLabel}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
