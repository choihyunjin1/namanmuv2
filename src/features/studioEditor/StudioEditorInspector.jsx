import React, { useMemo } from "react";
import { ChevronDown, ChevronUp, Cuboid, Layers3, PanelRightClose } from "lucide-react";
import { CAMERA_VIEW_OPTIONS, EDITOR_FLOORS, EDITOR_GRID, getBuildableFootprint } from "./editorDefaults.js";
import { isObjectHidden, isObjectLocked } from "./editorObjectState.js";
import { getAssetTaxonomy } from "./assetTaxonomyRules.js";
import { getAllowedHostKinds, validateHostEligibility } from "./hostEligibilityRules.js";
import { getCatalogAsset } from "./studioCatalog.js";
import { StudioSceneOutliner } from "./StudioSceneOutliner.jsx";
import { getWallSegment, isStructuralWallObject } from "./wallJoinRules.js";

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

export function StudioEditorInspector({
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
  sceneCostEstimate = null,
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
  const sceneCostTotalLabel = formatInspectorKrw(sceneCostEstimate?.estimatedTotalKrw) ?? "가격 후보 없음";
  const sceneCostMappedLabel = `${sceneCostEstimate?.pricedObjectCount ?? 0}/${sceneCostEstimate?.totalObjectCount ?? objects.length}`;
  const primaryCostClass = sceneCostEstimate?.byCostClass?.[0];
  const primaryCostClassLabel = primaryCostClass
    ? `${primaryCostClass.costClass} · ${formatInspectorKrw(primaryCostClass.estimatedCostKrw) ?? "0원"}`
    : "없음";
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
            <dt>견적 후보</dt>
            <dd>{sceneCostTotalLabel}</dd>
          </div>
          <div>
            <dt>가격 매핑</dt>
            <dd>{sceneCostMappedLabel}</dd>
          </div>
          <div>
            <dt>주요 공종</dt>
            <dd>{primaryCostClassLabel}</dd>
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
