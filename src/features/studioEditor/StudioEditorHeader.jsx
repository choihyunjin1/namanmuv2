import React from "react";
import { ChevronLeft } from "lucide-react";
import { EDITOR_GRID } from "./editorDefaults.js";

const PASCAL_ICON_BASE = "/assets/pascal-icons";
const PASCAL_ACTION_ICONS = {
  load: `${PASCAL_ICON_BASE}/blueprint.webp`,
  save: `${PASCAL_ICON_BASE}/collection.webp`
};

const SAVE_STATUS_META = {
  idle: { label: "대기", tone: "idle" },
  loading: { label: "불러오는 중", tone: "pending" },
  local: { label: "로컬", tone: "local" },
  saved: { label: "저장됨", tone: "saved" },
  saving: { label: "저장 중", tone: "pending" },
  error: { label: "오류", tone: "error" }
};

const COMMAND_HINTS = [
  { label: "Select", keys: ["Click", "Ctrl+A"] },
  { label: "Move/Nudge", keys: ["Arrow", "Shift+Arrow", "Alt+Arrow"] },
  { label: "Rotate", keys: ["Q", "E"] },
  { label: "Floor", keys: ["PgUp", "PgDn"] },
  { label: "Copy/Paste", keys: ["Ctrl+C", "Ctrl+V"] },
  { label: "Duplicate", keys: ["Ctrl+D"] },
  { label: "Delete", keys: ["Del"] },
  { label: "Undo/Redo", keys: ["Ctrl+Z", "Ctrl+Y"] },
  { label: "Camera", keys: ["1-4"] },
  { label: "Cancel", keys: ["Esc"] }
];

function PascalImageIcon({ src }) {
  return <img alt="" draggable="false" src={src} />;
}

function formatSavedTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function HeaderChip({ label, value }) {
  return (
    <span className="studio-editor-topbar-chip">
      <em>{label}</em>
      <strong>{value}</strong>
    </span>
  );
}

function CommandHint({ label, keys }) {
  return (
    <span className="studio-editor-command-hint">
      <strong>{label}</strong>
      <span>
        {keys.map((key) => (
          <kbd key={key}>{key}</kbd>
        ))}
      </span>
    </span>
  );
}

export function StudioEditorHeader({
  activeCategoryLabel,
  activeFloor,
  activeToolLabel,
  canRedo,
  canUndo,
  clipboardCount,
  lastSavedAt,
  objectCount,
  onLoadScene,
  onSaveScene,
  roomCount,
  saveStatus,
  selectedLabel,
  snapEnabled,
  wallViewMode
}) {
  const saveMeta = SAVE_STATUS_META[saveStatus] ?? SAVE_STATUS_META.idle;
  const savedTime = formatSavedTime(lastSavedAt);
  const selectedValue = selectedLabel && selectedLabel !== "none" ? selectedLabel : "none";

  return (
    <header className="studio-editor-topbar">
      <a className="studio-editor-back" href="/" title="프로토타입으로 돌아가기">
        <ChevronLeft size={18} />
        <span>PLOT:ON</span>
      </a>

      <div className="studio-editor-header-center">
        <div className="studio-editor-title">
          <strong>Studio Editor</strong>
          <span>단독주택 외관 씬</span>
        </div>
        <div className="studio-editor-topbar-chips" aria-label="현재 편집 상태">
          <HeaderChip label="tool" value={activeToolLabel} />
          <HeaderChip label="catalog" value={activeCategoryLabel} />
          <HeaderChip label="floor" value={`${activeFloor}F`} />
          <HeaderChip label="scene" value={`${objectCount} obj / ${roomCount} room`} />
          <HeaderChip label="snap" value={snapEnabled ? `${EDITOR_GRID.snapStep}m` : "off"} />
          <HeaderChip label="walls" value={wallViewMode} />
          <HeaderChip label="selected" value={selectedValue} />
          <HeaderChip label="clip" value={clipboardCount ? `${clipboardCount} copied` : "empty"} />
          <HeaderChip label="history" value={`${canUndo ? "undo" : "-"} / ${canRedo ? "redo" : "-"}`} />
        </div>
        <div className="studio-editor-command-strip" aria-label="주요 에디터 명령 단축키">
          {COMMAND_HINTS.map((hint) => (
            <CommandHint key={hint.label} {...hint} />
          ))}
        </div>
      </div>

      <div className="studio-editor-header-actions">
        <div className={`studio-editor-save-state is-${saveMeta.tone}`} title={savedTime ? `last ${savedTime}` : saveMeta.label}>
          <span />
          <strong>{saveMeta.label}</strong>
          {savedTime ? <em>{savedTime}</em> : null}
        </div>
        <button className="studio-editor-save is-icon" onClick={onLoadScene} type="button" title="저장된 씬 불러오기">
          <PascalImageIcon src={PASCAL_ACTION_ICONS.load} />
          <span>불러오기</span>
        </button>
        <button className="studio-editor-save is-icon is-primary" onClick={onSaveScene} type="button" title="현재 씬 저장">
          <PascalImageIcon src={PASCAL_ACTION_ICONS.save} />
          <span>{saveStatus === "saving" ? "저장 중" : "저장"}</span>
        </button>
      </div>
    </header>
  );
}
