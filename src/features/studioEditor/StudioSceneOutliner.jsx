import React, { useMemo } from "react";
import { Box, DoorOpen, Eye, EyeOff, Grid2X2, Layers3, Lock, Rows3, Unlock } from "lucide-react";
import { isObjectHidden, isObjectLocked } from "./editorObjectState.js";
import { isStructuralWallObject } from "./wallJoinRules.js";

function getObjectFloor(object) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  return 1;
}

function getObjectKindLabel(object) {
  if (object?.type === "room") return "room";
  if (isStructuralWallObject(object)) return "wall";
  if (object?.modelUrl) return "glb";
  if (object?.supportKind === "column") return "column";
  if (object?.placementMode?.includes("roof")) return "roof";
  return "object";
}

function getObjectChildCount(object) {
  return (
    (object?.room?.openings?.length ?? 0) +
    (object?.wallOpenings?.length ?? 0) +
    (object?.room?.attachments?.length ?? 0) +
    (object?.wallAttachments?.length ?? 0)
  );
}

function formatOffset(value) {
  return `${Number(value ?? 0).toFixed(1).replace(/\.0$/, "")}m`;
}

function getSelectionGesture(event) {
  return {
    additive: Boolean(event?.ctrlKey || event?.metaKey),
    range: Boolean(event?.shiftKey)
  };
}

function groupObjectsByFloor(objects) {
  const floors = new Map();

  for (const object of objects) {
    const floor = getObjectFloor(object);
    if (!floors.has(floor)) floors.set(floor, []);
    floors.get(floor).push(object);
  }

  return [...floors.entries()]
    .sort(([a], [b]) => a - b)
    .map(([floor, floorObjects]) => ({
      floor,
      objects: floorObjects.slice().sort((a, b) => {
        const kindOrder = Number(a.type === "room") - Number(b.type === "room");
        if (kindOrder !== 0) return -kindOrder;
        return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "ko-KR");
      })
    }));
}

function ChildRow({ active, hostId, icon: Icon, item, kind, onSelect }) {
  return (
    <button
      className={`studio-scene-outliner-child${active ? " is-active" : ""}`}
      onClick={() => onSelect(hostId, item.id)}
      title={`${item.label ?? kind} · ${item.wall ?? "wall"} ${formatOffset(item.offset)}`}
      type="button"
    >
      <Icon size={13} />
      <span>{item.label ?? kind}</span>
      <em>{item.wall} · {formatOffset(item.offset)}</em>
    </button>
  );
}

function ObjectRow({
  activeFloor,
  object,
  onFloorFocus,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  onToggleHidden,
  onToggleLocked,
  selectedAttachmentId,
  selectedObjectId,
  selectedObjectIds,
  selectedOpeningId
}) {
  const openings = object.room?.openings ?? object.wallOpenings ?? [];
  const attachments = object.room?.attachments ?? object.wallAttachments ?? [];
  const childCount = getObjectChildCount(object);
  const floor = getObjectFloor(object);
  const isObjectSelected = selectedObjectIds?.includes(object.id) || selectedObjectId === object.id;
  const isActiveObject = isObjectSelected && !selectedOpeningId && !selectedAttachmentId;
  const hidden = isObjectHidden(object);
  const kind = getObjectKindLabel(object);
  const locked = isObjectLocked(object);
  const objectName = object.name ?? object.id;

  const selectHost = (event) => {
    if (activeFloor !== floor) onFloorFocus?.(floor);
    onSelectObject(object.id, getSelectionGesture(event));
  };
  const selectOpening = (hostId, openingId) => {
    if (activeFloor !== floor) onFloorFocus?.(floor);
    onSelectOpening(hostId, openingId);
  };
  const selectAttachment = (hostId, attachmentId) => {
    if (activeFloor !== floor) onFloorFocus?.(floor);
    onSelectAttachment(hostId, attachmentId);
  };
  const toggleHidden = (event) => {
    event.stopPropagation();
    onToggleHidden?.(object.id);
  };
  const toggleLocked = (event) => {
    event.stopPropagation();
    onToggleLocked?.(object.id);
  };

  return (
    <div className={[
      "studio-scene-outliner-object",
      `is-${kind}`,
      hidden ? "is-hidden" : "",
      locked ? "is-locked" : ""
    ].filter(Boolean).join(" ")}>
      <button
        className={`studio-scene-outliner-row${isActiveObject ? " is-active" : ""}`}
        onClick={selectHost}
        title={objectName}
        type="button"
      >
        <Box size={14} />
        <span>{objectName}</span>
        <em>{kind}{childCount ? ` · ${childCount}` : ""}</em>
      </button>
      <div className="studio-scene-outliner-object-controls" aria-label={`${objectName} 표시 및 잠금`}>
        <button
          aria-label={hidden ? `${objectName} 보이기` : `${objectName} 숨기기`}
          className={hidden ? "is-muted" : ""}
          onClick={toggleHidden}
          title={hidden ? "보이기" : "숨기기"}
          type="button"
        >
          {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          aria-label={locked ? `${objectName} 잠금 해제` : `${objectName} 잠금`}
          className={locked ? "is-locked" : ""}
          onClick={toggleLocked}
          title={locked ? "잠금 해제" : "잠금"}
          type="button"
        >
          {locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
      </div>
      {openings.length || attachments.length ? (
        <div className="studio-scene-outliner-children">
          {openings.map((opening) => (
            <ChildRow
              active={selectedObjectId === object.id && selectedOpeningId === opening.id}
              hostId={object.id}
              icon={opening.type === "door" ? DoorOpen : Grid2X2}
              item={opening}
              key={opening.id}
              kind={opening.type === "door" ? "door" : "window"}
              onSelect={selectOpening}
            />
          ))}
          {attachments.map((attachment) => (
            <ChildRow
              active={selectedObjectId === object.id && selectedAttachmentId === attachment.id}
              hostId={object.id}
              icon={Rows3}
              item={attachment}
              key={attachment.id}
              kind="attachment"
              onSelect={selectAttachment}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StudioSceneOutliner({
  activeFloor,
  objects,
  onFloorFocus,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  onSetFloorHidden,
  onSetFloorLocked,
  onToggleHidden,
  onToggleLocked,
  selectedAttachmentId,
  selectedObjectId,
  selectedObjectIds = [],
  selectedOpeningId
}) {
  const floorGroups = useMemo(() => groupObjectsByFloor(objects), [objects]);

  return (
    <section className="studio-scene-outliner" aria-label="씬 아웃라이너">
      <div className="studio-editor-panel-title">
        <Layers3 size={17} />
        <strong>Scene Outliner</strong>
      </div>
      {floorGroups.length ? (
        <div className="studio-scene-outliner-list">
          {floorGroups.map(({ floor, objects: floorObjects }) => (
            <div className={`studio-scene-outliner-floor${activeFloor === floor ? " is-active" : ""}`} key={floor}>
              <div className="studio-scene-outliner-floor-header">
                <button className="studio-scene-outliner-floor-head" onClick={() => onFloorFocus?.(floor)} type="button">
                  <span>{floor}F</span>
                  <em>
                    {floorObjects.length} items
                    {floorObjects.some(isObjectHidden) ? ` · ${floorObjects.filter(isObjectHidden).length} hidden` : ""}
                    {floorObjects.some(isObjectLocked) ? ` · ${floorObjects.filter(isObjectLocked).length} locked` : ""}
                  </em>
                </button>
                <div className="studio-scene-outliner-floor-controls" aria-label={`${floor}F 표시 및 잠금`}>
                  <button
                    aria-label={floorObjects.every(isObjectHidden) ? `${floor}F 전체 보이기` : `${floor}F 전체 숨기기`}
                    className={floorObjects.every(isObjectHidden) ? "is-muted" : ""}
                    onClick={() => onSetFloorHidden?.(floor, !floorObjects.every(isObjectHidden))}
                    title={floorObjects.every(isObjectHidden) ? "층 전체 보이기" : "층 전체 숨기기"}
                    type="button"
                  >
                    {floorObjects.every(isObjectHidden) ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    aria-label={floorObjects.every(isObjectLocked) ? `${floor}F 전체 잠금 해제` : `${floor}F 전체 잠금`}
                    className={floorObjects.every(isObjectLocked) ? "is-locked" : ""}
                    onClick={() => onSetFloorLocked?.(floor, !floorObjects.every(isObjectLocked))}
                    title={floorObjects.every(isObjectLocked) ? "층 전체 잠금 해제" : "층 전체 잠금"}
                    type="button"
                  >
                    {floorObjects.every(isObjectLocked) ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                </div>
              </div>
              <div className="studio-scene-outliner-floor-body">
                {floorObjects.map((object) => (
                  <ObjectRow
                    activeFloor={activeFloor}
                    key={object.id}
                    object={object}
                    onFloorFocus={onFloorFocus}
                    onSelectAttachment={onSelectAttachment}
                    onSelectObject={onSelectObject}
                    onSelectOpening={onSelectOpening}
                    onToggleHidden={onToggleHidden}
                    onToggleLocked={onToggleLocked}
                    selectedAttachmentId={selectedAttachmentId}
                    selectedObjectId={selectedObjectId}
                    selectedObjectIds={selectedObjectIds}
                    selectedOpeningId={selectedOpeningId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="studio-scene-outliner-empty">
          <strong>empty scene</strong>
          <span>벽 도구나 카탈로그 자산을 배치하면 여기에 층별 구조가 생깁니다.</span>
        </div>
      )}
    </section>
  );
}
