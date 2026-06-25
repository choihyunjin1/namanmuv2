import React, { useEffect, useMemo, useRef, useState } from "react";
import { ContactShadows, Edges, Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EDITOR_GRID } from "./editorDefaults.js";
import { EditorGround } from "./EditorGround.jsx";
import { getEditorInteractionMode } from "./editorInteractionMode.js";
import { buildBoundsTreesForScene, installStudioEditorRaycastAcceleration } from "./editorRaycastAcceleration.js";
import { isObjectHidden, isObjectLocked } from "./editorObjectState.js";
import { GlbAssetRenderer } from "./viewportRenderers/GlbAssetRenderer.jsx";
import { RoomBody, StructuralWallBody } from "./viewportRenderers/RoomWallRenderers.jsx";
import { PrimitiveAssetRenderer } from "./viewportRenderers/PrimitiveAssetRenderer.jsx";
import { RoofAccessoryRenderer } from "./viewportRenderers/RoofAccessoryRenderer.jsx";
import { ScenePlanAssetRenderer, getObjectScenePlan } from "./viewportRenderers/ScenePlanAssetRenderer.jsx";
import { StairAssetRenderer, StairPlanFootprint } from "./viewportRenderers/StairAssetRenderer.jsx";
import { VIEWPORT_RENDERER_TYPES, getViewportRendererType } from "./viewportRenderers/viewportRendererRegistry.js";
import { getWallEndpoints, getWallSegment, isStructuralWallObject } from "./wallJoinRules.js";

const DRAG_GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const MIN_OBJECT_SCALE_FACTOR = 0.45;
const MAX_OBJECT_SCALE_FACTOR = 2.25;
const TRANSFORM_HANDLE_COLOR = "#21a79b";
const TRANSFORM_HANDLE_INVALID_COLOR = "#d8703f";
const PLAN_BACKDROP_SIZE = Math.max(
  EDITOR_GRID.size * 4,
  EDITOR_GRID.parcelWidth * 6,
  EDITOR_GRID.parcelDepth * 6
);

function createStudioRenderer(defaultProps) {
  const renderer = new THREE.WebGLRenderer({
    ...defaultProps,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
    preserveDrawingBuffer: true
  });
  renderer.setClearColor("#dfe8e3", 1);
  renderer.setClearAlpha(1);
  return renderer;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getHorizontalAngle(point, centerX, centerZ) {
  return Math.atan2(point.x - centerX, point.z - centerZ);
}

function getHorizontalDistance(point, centerX, centerZ) {
  return Math.hypot(point.x - centerX, point.z - centerZ);
}

function createDragTransactionId(mode, objectId) {
  return `${mode}-${objectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPointerSelectionGesture(event) {
  const source = event?.nativeEvent ?? event;
  return {
    additive: Boolean(source?.ctrlKey || source?.metaKey),
    range: Boolean(source?.shiftKey)
  };
}

function stopNativePointerEvent(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function getPlanMarqueeBounds(start, current) {
  if (!start || !current) return null;
  return {
    maxX: Math.max(start.x, current.x),
    maxZ: Math.max(start.z, current.z),
    minX: Math.min(start.x, current.x),
    minZ: Math.min(start.z, current.z)
  };
}

function createPlanMarqueeOutline(width, depth) {
  const x = width / 2;
  const z = depth / 2;
  return new Float32Array([
    -x, 0, -z, x, 0, -z,
    x, 0, -z, x, 0, z,
    x, 0, z, -x, 0, z,
    -x, 0, z, -x, 0, -z
  ]);
}

function getAncestorStudioObjectId(object) {
  let current = object;
  while (current) {
    if (current.userData?.studioObjectId) return current.userData.studioObjectId;
    current = current.parent;
  }
  return null;
}

function getPlanObjectFootprint(object) {
  const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
  if (isStructuralWallObject(object)) {
    const segment = getWallSegment(object);
    const width = segment.orientation === "x" ? segment.width : segment.thickness;
    const depth = segment.orientation === "x" ? segment.thickness : segment.width;
    return {
      maxX: x + width / 2,
      maxZ: z + depth / 2,
      minX: x - width / 2,
      minZ: z - depth / 2
    };
  }

  const [width = 1, , depth = 1] = object.size ?? [1, 1, 1];
  return {
    maxX: x + width / 2,
    maxZ: z + depth / 2,
    minX: x - width / 2,
    minZ: z - depth / 2
  };
}

function planFootprintsOverlap(first, second) {
  return (
    first.minX <= second.maxX &&
    first.maxX >= second.minX &&
    first.minZ <= second.maxZ &&
    first.maxZ >= second.minZ
  );
}

function countPlanMarqueeHits(bounds, objects, activeFloor) {
  if (!bounds) return 0;
  return objects
    .filter((object) => getObjectFloor(object) === activeFloor)
    .filter((object) => planFootprintsOverlap(bounds, getPlanObjectFootprint(object)))
    .length;
}

function PlanMarqueePreview({ draft, floorBaseY = 0 }) {
  const bounds = getPlanMarqueeBounds(draft?.start, draft?.current);
  if (!bounds) return null;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width < 0.05 || depth < 0.05) return null;

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const y = Number((floorBaseY + 0.34).toFixed(3));
  const outline = createPlanMarqueeOutline(width, depth);

  return (
    <group position={[centerX, y, centerZ]} renderOrder={90}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={90}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#20a39a" depthTest={false} depthWrite={false} opacity={0.18} transparent />
      </mesh>
      <lineSegments renderOrder={91}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[outline, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#095f58" depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <Html center distanceFactor={16} position={[0, 0.16, 0]} style={{ pointerEvents: "none" }}>
        <div className={`studio-editor-plan-label studio-editor-plan-marquee-label${draft?.additive ? " is-additive" : ""}`}>
          <strong>{draft?.hitCount ?? 0} selected</strong>
          <span>{draft?.additive ? "add to selection" : "replace selection"}</span>
        </div>
      </Html>
    </group>
  );
}

function PlanMarqueeController({
  active = false,
  activeFloor = 1,
  floorBaseY = 0,
  onGroundClick,
  onMarqueeSelect,
  objects = []
}) {
  const [draft, setDraft] = useState(null);
  const { camera, gl, scene } = useThree();
  const dragStateRef = useRef(null);
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorBaseY));
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());

  groundPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -floorBaseY);

  const getGroundPoint = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const point = new THREE.Vector3();
    return raycasterRef.current.ray.intersectPlane(groundPlaneRef.current, point) ? point : null;
  };

  const pointerHitsStudioObject = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    return raycasterRef.current
      .intersectObjects(scene.children, true)
      .some((hit) => Boolean(getAncestorStudioObjectId(hit.object)));
  };

  useEffect(() => {
    if (!active) {
      dragStateRef.current = null;
      setDraft(null);
      return undefined;
    }

    const canvas = gl.domElement;

    const clearDrag = () => {
      dragStateRef.current = null;
      setDraft(null);
      canvas.style.cursor = "";
    };

    const updateDrag = (event) => {
      const state = dragStateRef.current;
      if (!state) return;
      const point = getGroundPoint(event.clientX, event.clientY);
      if (!point) return;
      const current = { x: point.x, z: point.z };
      const distance = Math.hypot(current.x - state.start.x, current.z - state.start.z);
      state.current = current;
      state.moved = state.moved || distance > 0.12;
      const bounds = getPlanMarqueeBounds(state.start, current);
      setDraft({
        additive: state.additive,
        current,
        hitCount: countPlanMarqueeHits(bounds, objects, activeFloor),
        start: state.start
      });
      canvas.style.cursor = "crosshair";
      stopNativePointerEvent(event);
    };

    const commitDrag = (event) => {
      const state = dragStateRef.current;
      if (!state) return;
      const point = getGroundPoint(event.clientX, event.clientY);
      const current = point ? { x: point.x, z: point.z } : state.current;
      const bounds = getPlanMarqueeBounds(state.start, current);
      const width = bounds ? bounds.maxX - bounds.minX : 0;
      const depth = bounds ? bounds.maxZ - bounds.minZ : 0;
      if (state.moved && width > 0.15 && depth > 0.15) {
        onMarqueeSelect?.(bounds, { additive: state.additive });
      } else if (point) {
        onGroundClick?.(point);
      }
      clearDrag();
      window.removeEventListener("pointermove", updateDrag, true);
      window.removeEventListener("pointerup", commitDrag, true);
      window.removeEventListener("pointercancel", cancelDrag, true);
      stopNativePointerEvent(event);
    };

    const cancelDrag = (event) => {
      clearDrag();
      window.removeEventListener("pointermove", updateDrag, true);
      window.removeEventListener("pointerup", commitDrag, true);
      window.removeEventListener("pointercancel", cancelDrag, true);
      stopNativePointerEvent(event);
    };

    const handlePointerDown = (event) => {
      if (!active || event.button !== 0) return;
      if (pointerHitsStudioObject(event.clientX, event.clientY)) return;
      const point = getGroundPoint(event.clientX, event.clientY);
      if (!point) return;
      const start = { x: point.x, z: point.z };
      dragStateRef.current = {
        additive: Boolean(event.ctrlKey || event.metaKey),
        current: start,
        moved: false,
        start
      };
      setDraft({ additive: dragStateRef.current.additive, current: start, hitCount: 0, start });
      window.addEventListener("pointermove", updateDrag, true);
      window.addEventListener("pointerup", commitDrag, true);
      window.addEventListener("pointercancel", cancelDrag, true);
      canvas.style.cursor = "crosshair";
      stopNativePointerEvent(event);
    };

    canvas.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", updateDrag, true);
      window.removeEventListener("pointerup", commitDrag, true);
      window.removeEventListener("pointercancel", cancelDrag, true);
      clearDrag();
    };
  }, [active, activeFloor, camera, floorBaseY, gl, objects, onGroundClick, onMarqueeSelect, scene]);

  return <PlanMarqueePreview draft={draft} floorBaseY={floorBaseY} />;
}

function getObjectFloor(object) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  return 1;
}

function formatMeters(value) {
  return `${Number(value ?? 0).toFixed(2).replace(/\.?0+$/, "")}m`;
}

function getObjectDimensionLabel(object) {
  if (isStructuralWallObject(object)) {
    const segment = getWallSegment(object);
    return `${formatMeters(segment.width)} L · ${formatMeters(segment.height)} H · ${formatMeters(segment.thickness)} T`;
  }
  const [width = 1, height = 1, depth = 1] = object?.size ?? [1, 1, 1];
  return `${formatMeters(width)} W · ${formatMeters(height)} H · ${formatMeters(depth)} D`;
}

function createPlanDimensionPositions(start, end, tickSize = 0.18) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz) || 1;
  const normalX = -dz / length;
  const normalZ = dx / length;
  return new Float32Array([
    start.x, 0, start.z, end.x, 0, end.z,
    start.x - normalX * tickSize, 0, start.z - normalZ * tickSize,
    start.x + normalX * tickSize, 0, start.z + normalZ * tickSize,
    end.x - normalX * tickSize, 0, end.z - normalZ * tickSize,
    end.x + normalX * tickSize, 0, end.z + normalZ * tickSize
  ]);
}

function PlanDimensionLine({ end, label, start, y }) {
  const positions = useMemo(() => createPlanDimensionPositions(start, end), [end, start]);
  const midX = (start.x + end.x) / 2;
  const midZ = (start.z + end.z) / 2;

  return (
    <group position={[0, y, 0]} renderOrder={48}>
      <lineSegments renderOrder={48}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#4b3a18" depthTest={false} transparent opacity={0.9} />
      </lineSegments>
      <Html center distanceFactor={18} position={[midX, 0.14, midZ]} style={{ pointerEvents: "none" }}>
        <div className="studio-editor-plan-dimension-label">{label}</div>
      </Html>
    </group>
  );
}

function PlanRoomDimensions({ depth, width, x, y, z }) {
  const gap = 0.42;
  return (
    <>
      <PlanDimensionLine
        end={{ x: x + width / 2, z: z - depth / 2 - gap }}
        label={`${formatMeters(width)} W`}
        start={{ x: x - width / 2, z: z - depth / 2 - gap }}
        y={y}
      />
      <PlanDimensionLine
        end={{ x: x + width / 2 + gap, z: z + depth / 2 }}
        label={`${formatMeters(depth)} D`}
        start={{ x: x + width / 2 + gap, z: z - depth / 2 }}
        y={y}
      />
    </>
  );
}

function PlanWallDimensions({ endpoints, label, y }) {
  if (!endpoints?.length) return null;
  const [start, end] = endpoints;
  return (
    <PlanDimensionLine
      end={end}
      label={label}
      start={start}
      y={y}
    />
  );
}

function stopHtmlPointer(event) {
  event.stopPropagation();
}

function SelectedObjectActionMenu({
  activeTool,
  dragging = false,
  isJoinedWall = false,
  locked = false,
  object,
  onDelete,
  onDuplicate,
  onMove
}) {
  if (!object || dragging || activeTool === "erase") return null;
  const objectName = isJoinedWall ? `${object.name} · ${object.metadata?.wallJoin?.sourceCount ?? 1}개 접합` : object.name;

  return (
    <div
      className="studio-editor-object-popover"
      onClick={stopHtmlPointer}
      onPointerDown={stopHtmlPointer}
      onPointerUp={stopHtmlPointer}
    >
      <div className={`studio-editor-object-menu${locked ? " is-locked" : ""}`} aria-label={`${objectName} 작업`}>
        <button disabled={locked} onClick={onMove} type="button">Move</button>
        <button disabled={locked} onClick={onDuplicate} type="button">Duplicate</button>
        <button className="is-danger" disabled={locked} onClick={onDelete} type="button">Delete</button>
      </div>
      <div className="studio-editor-dimensions-pill">
        <strong>{objectName}</strong>
        <span>{locked ? `locked · ${getObjectDimensionLabel(object)}` : getObjectDimensionLabel(object)}</span>
      </div>
    </div>
  );
}

function ViewLights({ planMode = false }) {
  return (
    <>
      <ambientLight intensity={planMode ? 0.78 : 0.58} />
      <hemisphereLight args={["#ffffff", "#bfd0c5", planMode ? 0.72 : 1.12]} />
      <directionalLight
        castShadow={!planMode}
        intensity={planMode ? 0.72 : 1.35}
        position={[5.5, 8.2, 4.8]}
        shadow-bias={-0.0003}
        shadow-mapSize-height={1536}
        shadow-mapSize-width={1536}
      />
    </>
  );
}

function SceneClearRuntime({ planMode = false }) {
  const { gl, invalidate, scene } = useThree();

  useEffect(() => {
    const planColor = new THREE.Color("#fbfdf9");
    if (planMode) {
      scene.background = planColor;
      gl.setClearColor(planColor, 1);
      gl.setClearAlpha(1);
    } else {
      const color = new THREE.Color("#dfe8e3");
      scene.background = color;
      gl.setClearColor(color, 1);
      gl.setClearAlpha(1);
    }
    invalidate();
    requestAnimationFrame(() => invalidate());
  }, [gl, invalidate, planMode, scene]);

  return null;
}

function PlanModeBackdrop({ activeFloorBaseY = 0, visible = false }) {
  if (!visible) return null;

  return (
    <mesh
      frustumCulled={false}
      position={[0, activeFloorBaseY - 0.06, 0]}
      raycast={() => null}
      renderOrder={-100}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[PLAN_BACKDROP_SIZE, PLAN_BACKDROP_SIZE]} />
      <meshBasicMaterial
        color="#fbfdf9"
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

function DropPlacementResolver({ activeFloorBaseY = 0, dropRequest, onDropPointResolved }) {
  const { camera, gl } = useThree();

  useEffect(() => {
    if (!dropRequest) return;

    const rect = gl.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((dropRequest.clientX - rect.left) / rect.width) * 2 - 1,
      -((dropRequest.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -activeFloorBaseY);
    const point = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(groundPlane, point)) {
      onDropPointResolved(point, dropRequest.asset);
    }
  }, [activeFloorBaseY, camera, dropRequest, gl, onDropPointResolved]);

  return null;
}

function CameraViewController({ activeFloorBaseY = 0, cameraView = "orbit", controlsRef }) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const target = new THREE.Vector3(0, activeFloorBaseY + 0.15, 0);
    const isPlanView = cameraView === "top";
    const positions = {
      front: new THREE.Vector3(0, activeFloorBaseY + 4.6, 13.5),
      orbit: new THREE.Vector3(8.5, activeFloorBaseY + 7.2, 9.5),
      side: new THREE.Vector3(13.5, activeFloorBaseY + 4.6, 0),
      top: new THREE.Vector3(0, activeFloorBaseY + 18, 0)
    };
    const nextPosition = positions[cameraView] ?? positions.orbit;
    camera.up.copy(isPlanView ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0));
    camera.position.copy(nextPosition);
    camera.lookAt(target);
    if (camera.isOrthographicCamera) {
      camera.zoom = isPlanView ? 62 : 42;
    }
    camera.updateProjectionMatrix();

    const controls = controlsRef?.current;
    if (controls) {
      controls.target.copy(target);
      controls.enableRotate = !isPlanView;
      controls.enablePan = true;
      controls.update();
    }
    invalidate();
    requestAnimationFrame(() => invalidate());
  }, [activeFloorBaseY, camera, cameraView, controlsRef, invalidate]);

  return null;
}

function RaycastAccelerationRuntime({
  activeTool,
  cameraView,
  objects,
  roomDraft,
  selectedAttachmentId,
  selectedObjectId,
  selectedObjectIds = [],
  selectedOpeningId,
  wallAttachmentPreview,
  wallDraft,
  wallOpeningPreview
}) {
  const { invalidate, scene } = useThree();

  useEffect(() => {
    installStudioEditorRaycastAcceleration();
    const stats = buildBoundsTreesForScene(scene);
    if (stats.builtCount > 0) invalidate();
  }, [
    activeTool,
    cameraView,
    invalidate,
    objects,
    roomDraft,
    scene,
    selectedAttachmentId,
    selectedObjectId,
    selectedOpeningId,
    wallAttachmentPreview,
    wallDraft,
    wallOpeningPreview
  ]);

  return null;
}

function RoomDraftPreview({ draft }) {
  if (!draft) return null;
  const width = Math.max(draft.size[0], 0.5);
  const depth = Math.max(draft.size[2], 0.5);
  const previewObject = {
    color: draft.valid ? "#8bc8bb" : "#d48c72",
    position: draft.position,
    room: {
      wallThickness: draft.wallThickness
    },
    size: [width, draft.size[1], depth]
  };

  return (
    <group position={draft.position}>
      <RoomBody object={previewObject} preview selected={draft.valid} />
      {(draft.unsupportedPoints ?? []).map((point, index) => (
        <mesh key={`${point.x}-${point.z}-${index}`} position={[point.x - draft.position[0], 0.09, point.z - draft.position[2]]}>
          <boxGeometry args={[0.18, 0.04, 0.18]} />
          <meshStandardMaterial color="#d95f4b" emissive="#8b261e" emissiveIntensity={0.18} />
        </mesh>
      ))}
      <Html center distanceFactor={10} position={[0, draft.size[1] + 0.3, 0]}>
        <div className={`studio-editor-object-label${draft.valid ? " is-drafting" : " is-invalid"}`}>
          {draft.label}
        </div>
      </Html>
    </group>
  );
}

function WallDraftPreview({ draft }) {
  if (!draft) return null;
  const size = [
    Math.max(draft.size?.[0] ?? 0.5, 0.5),
    draft.size?.[1] ?? 2.7,
    draft.size?.[2] ?? 0.16
  ];
  const color = draft.valid ? "#7fb6a8" : "#d48c72";
  const edgeColor = draft.valid ? "#1d6f65" : "#8b261e";

  return (
    <group position={draft.position} rotation={draft.rotation ?? [0, 0, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} metalness={0.02} opacity={0.58} roughness={0.7} transparent />
        <Edges color={edgeColor} lineWidth={2} />
      </mesh>
      {(draft.snapPoints ?? []).map((snapPoint, index) => (
        <group
          key={`${snapPoint.objectId}-${index}`}
          position={[
            snapPoint.position[0] - draft.position[0],
            snapPoint.position[1] - draft.position[1],
            snapPoint.position[2] - draft.position[2]
          ]}
        >
          <mesh>
            <sphereGeometry args={[0.12, 16, 10]} />
            <meshStandardMaterial color="#21a79b" emissive="#0b6f63" emissiveIntensity={0.25} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.2, 0.28, 28]} />
            <meshBasicMaterial color="#0b6f63" depthTest={false} transparent opacity={0.86} />
          </mesh>
          <Html center distanceFactor={11} position={[0, 0.24, 0]}>
            <div className="studio-editor-snap-label">
              <strong>{snapPoint.kind ?? "snap"}</strong>
              <span>{snapPoint.distance != null ? `${snapPoint.distance}m` : "locked"}</span>
            </div>
          </Html>
        </group>
      ))}
      <Html center distanceFactor={10} position={[0, size[1] / 2 + 0.28, 0]}>
        <div className={`studio-editor-object-label${draft.valid ? " is-drafting" : " is-invalid"}`}>
          {draft.label}
        </div>
      </Html>
    </group>
  );
}

function RoomDrawingPlane({
  activeAsset,
  floorBaseY = 0,
  onDraftChange,
  onDraftCommit,
  onDrawingStateChange
}) {
  const { camera, gl } = useThree();
  const startPointRef = useRef(null);
  const activeAssetRef = useRef(activeAsset);
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const groundPointRef = useRef(new THREE.Vector3());
  const drawingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorBaseY));
  const chainWallMode = activeAsset?.placementMode === "draw-wall" && activeAsset?.drawMode === "chain-wall";

  useEffect(() => {
    activeAssetRef.current = activeAsset;
  }, [activeAsset]);

  useEffect(() => {
    drawingPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -floorBaseY);
  }, [floorBaseY]);

  useEffect(() => {
    startPointRef.current = null;
    onDrawingStateChange(false);
    onDraftChange(null);
  }, [activeAsset?.id, floorBaseY]);

  const getGroundPointFromClient = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    if (!raycasterRef.current.ray.intersectPlane(drawingPlaneRef.current, groundPointRef.current)) {
      return null;
    }
    return groundPointRef.current.clone();
  };

  useEffect(() => {
    if (!activeAsset) return undefined;
    const previousCursor = gl.domElement.style.cursor;
    gl.domElement.style.cursor = "crosshair";
    return () => {
      gl.domElement.style.cursor = previousCursor;
    };
  }, [activeAsset, gl]);

  const clearDraft = () => {
    startPointRef.current = null;
    onDrawingStateChange(false);
    onDraftChange(null);
  };

  useEffect(() => {
    if (!activeAsset) return undefined;

    const handlePointerMove = (event) => {
      if (!startPointRef.current) return;
      const point = getGroundPointFromClient(event.clientX, event.clientY);
      if (!point) return;
      onDraftChange(startPointRef.current, point, activeAssetRef.current);
    };

    const handlePointerUp = (event) => {
      if (activeAssetRef.current?.placementMode === "draw-wall" && activeAssetRef.current?.drawMode === "chain-wall") return;
      if (!startPointRef.current) return;
      const point = getGroundPointFromClient(event.clientX, event.clientY);
      if (point) onDraftCommit(startPointRef.current, point, activeAssetRef.current);
      clearDraft();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") clearDraft();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeAsset, camera, floorBaseY, gl, onDraftChange, onDraftCommit, onDrawingStateChange]);

  if (!activeAsset) return null;

  return (
    <mesh
      position={[0, floorBaseY + 0.12, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerCancel={(event) => {
        event.stopPropagation();
        clearDraft();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        const sourceEvent = event.nativeEvent ?? event;
        const point = getGroundPointFromClient(sourceEvent.clientX, sourceEvent.clientY);
        if (!point) return;
        if (chainWallMode) {
          if (!startPointRef.current) {
            startPointRef.current = point;
            onDrawingStateChange(true);
            onDraftChange(startPointRef.current, point, activeAsset);
            return;
          }

          const createdObject = onDraftCommit(startPointRef.current, point, activeAsset);
          if (createdObject) {
            const nextPoint = createdObject.metadata?.draftEndPoint;
            startPointRef.current = nextPoint
              ? new THREE.Vector3(nextPoint.x, floorBaseY, nextPoint.z)
              : point;
          }
          onDrawingStateChange(true);
          onDraftChange(startPointRef.current, point, activeAsset);
          return;
        }

        startPointRef.current = point;
        onDrawingStateChange(true);
        onDraftChange(startPointRef.current, point, activeAsset);
      }}
    >
      <planeGeometry args={[24, 24]} />
      <meshBasicMaterial color="#ffffff" depthWrite={false} opacity={0} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

function getRoomWallDefinitions(room) {
  const [width = 1, height = 2.7, depth = 1] = room.size ?? [1, 2.7, 1];
  const [roomX = 0, roomY = 0, roomZ = 0] = room.position ?? [0, 0, 0];

  return [
    {
      wall: "north",
      normal: new THREE.Vector3(0, 0, -1),
      point: new THREE.Vector3(roomX, roomY, roomZ - depth / 2),
      roomDepth: depth,
      roomHeight: height,
      roomWidth: width
    },
    {
      wall: "south",
      normal: new THREE.Vector3(0, 0, 1),
      point: new THREE.Vector3(roomX, roomY, roomZ + depth / 2),
      roomDepth: depth,
      roomHeight: height,
      roomWidth: width
    },
    {
      wall: "west",
      normal: new THREE.Vector3(-1, 0, 0),
      point: new THREE.Vector3(roomX - width / 2, roomY, roomZ),
      roomDepth: depth,
      roomHeight: height,
      roomWidth: width
    },
    {
      wall: "east",
      normal: new THREE.Vector3(1, 0, 0),
      point: new THREE.Vector3(roomX + width / 2, roomY, roomZ),
      roomDepth: depth,
      roomHeight: height,
      roomWidth: width
    }
  ];
}

function WallOpeningController({
  activeAsset,
  movingOpening,
  objects,
  onCommit,
  onMoveEnd,
  onPreview
}) {
  const { camera, gl } = useThree();
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane());
  const hitPointRef = useRef(new THREE.Vector3());

  const getWallHitFromClient = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);

    let bestHit = null;
    objects
      .filter((object) => object.type === "room")
      .forEach((room) => {
        const [roomX = 0, roomY = 0, roomZ = 0] = room.position ?? [0, 0, 0];
        getRoomWallDefinitions(room).forEach((definition) => {
          planeRef.current.setFromNormalAndCoplanarPoint(definition.normal, definition.point);
          if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitPointRef.current)) return;

          const localX = hitPointRef.current.x - roomX;
          const localY = hitPointRef.current.y - roomY;
          const localZ = hitPointRef.current.z - roomZ;
          const wallLength = definition.wall === "north" || definition.wall === "south" ? definition.roomWidth : definition.roomDepth;
          const offset = definition.wall === "north" || definition.wall === "south" ? localX : localZ;

          if (localY < 0 || localY > definition.roomHeight) return;
          if (offset < -wallLength / 2 || offset > wallLength / 2) return;

          const distance = raycasterRef.current.ray.origin.distanceTo(hitPointRef.current);
          if (!bestHit || distance < bestHit.distance) {
            bestHit = {
              distance,
              height: localY,
              offset,
              roomId: room.id,
              wall: definition.wall
            };
          }
        });
      });
    objects
      .filter(isStructuralWallObject)
      .forEach((wallObject) => {
        const segment = getWallSegment(wallObject);
        const [wallX = 0, wallY = 0, wallZ = 0] = wallObject.position ?? [0, 0, 0];
        const normal = segment.orientation === "x"
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(1, 0, 0);
        const point = new THREE.Vector3(wallX, wallY, wallZ);
        planeRef.current.setFromNormalAndCoplanarPoint(normal, point);
        if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitPointRef.current)) return;

        const localY = hitPointRef.current.y - (wallY - segment.height / 2);
        const offset = segment.orientation === "x"
          ? hitPointRef.current.x - wallX
          : hitPointRef.current.z - wallZ;

        if (localY < 0 || localY > segment.height) return;
        if (offset < -segment.width / 2 || offset > segment.width / 2) return;

        const distance = raycasterRef.current.ray.origin.distanceTo(hitPointRef.current);
        if (!bestHit || distance < bestHit.distance) {
          bestHit = {
            distance,
            height: localY,
            offset,
            wall: "body",
            wallObjectId: wallObject.id
          };
        }
      });

    return bestHit;
  };

  useEffect(() => {
    const enabled = Boolean(activeAsset || movingOpening);
    if (!enabled) return undefined;

    const previousCursor = gl.domElement.style.cursor;
    gl.domElement.style.cursor = movingOpening ? "grabbing" : "crosshair";

    const activeOpeningAsset = movingOpening?.asset ?? activeAsset;
    const handlePointerMove = (event) => {
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      onPreview(hit, activeOpeningAsset, movingOpening);
    };

    const handlePointerDown = (event) => {
      if (movingOpening) return;
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      if (!hit) {
        onPreview(null, activeOpeningAsset, null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onCommit(hit, activeOpeningAsset, null);
    };

    const handlePointerUp = (event) => {
      if (!movingOpening) return;
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      if (hit) onCommit(hit, activeOpeningAsset, movingOpening);
      onMoveEnd();
    };

    gl.domElement.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      gl.domElement.style.cursor = previousCursor;
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeAsset, camera, gl, movingOpening, objects, onCommit, onMoveEnd, onPreview]);

  return null;
}

function WallAttachmentController({
  activeAsset,
  movingAttachment,
  objects,
  onCommit,
  onMoveEnd,
  onPreview
}) {
  const { camera, gl } = useThree();
  const pointerRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane());
  const hitPointRef = useRef(new THREE.Vector3());

  const getWallHitFromClient = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);

    let bestHit = null;
    objects
      .filter((object) => object.type === "room")
      .forEach((room) => {
        const [roomX = 0, roomY = 0, roomZ = 0] = room.position ?? [0, 0, 0];
        getRoomWallDefinitions(room).forEach((definition) => {
          planeRef.current.setFromNormalAndCoplanarPoint(definition.normal, definition.point);
          if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitPointRef.current)) return;

          const localY = hitPointRef.current.y - roomY;
          const localX = hitPointRef.current.x - roomX;
          const localZ = hitPointRef.current.z - roomZ;
          const wallLength = definition.wall === "north" || definition.wall === "south" ? definition.roomWidth : definition.roomDepth;
          const offset = definition.wall === "north" || definition.wall === "south" ? localX : localZ;

          if (localY < 0 || localY > definition.roomHeight) return;
          if (offset < -wallLength / 2 || offset > wallLength / 2) return;

          const distance = raycasterRef.current.ray.origin.distanceTo(hitPointRef.current);
          if (!bestHit || distance < bestHit.distance) {
            bestHit = {
              distance,
              height: localY,
              offset,
              roomId: room.id,
              wall: definition.wall
            };
          }
        });
      });
    objects
      .filter(isStructuralWallObject)
      .forEach((wallObject) => {
        const segment = getWallSegment(wallObject);
        const [wallX = 0, wallY = 0, wallZ = 0] = wallObject.position ?? [0, 0, 0];
        const normal = segment.orientation === "x"
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(1, 0, 0);
        const point = new THREE.Vector3(wallX, wallY, wallZ);
        planeRef.current.setFromNormalAndCoplanarPoint(normal, point);
        if (!raycasterRef.current.ray.intersectPlane(planeRef.current, hitPointRef.current)) return;

        const localY = hitPointRef.current.y - (wallY - segment.height / 2);
        const offset = segment.orientation === "x"
          ? hitPointRef.current.x - wallX
          : hitPointRef.current.z - wallZ;

        if (localY < 0 || localY > segment.height) return;
        if (offset < -segment.width / 2 || offset > segment.width / 2) return;

        const distance = raycasterRef.current.ray.origin.distanceTo(hitPointRef.current);
        if (!bestHit || distance < bestHit.distance) {
          bestHit = {
            distance,
            height: localY,
            offset,
            wall: "body",
            wallObjectId: wallObject.id
          };
        }
      });

    return bestHit;
  };

  useEffect(() => {
    const enabled = Boolean(activeAsset || movingAttachment);
    if (!enabled) return undefined;

    const previousCursor = gl.domElement.style.cursor;
    gl.domElement.style.cursor = movingAttachment ? "grabbing" : "crosshair";

    const activeAttachmentAsset = movingAttachment?.asset ?? activeAsset;
    const handlePointerMove = (event) => {
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      onPreview(hit, activeAttachmentAsset, movingAttachment);
    };

    const handlePointerDown = (event) => {
      if (movingAttachment) return;
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      if (!hit) {
        onPreview(null, activeAttachmentAsset, null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onCommit(hit, activeAttachmentAsset, null);
    };

    const handlePointerUp = (event) => {
      if (!movingAttachment) return;
      const hit = getWallHitFromClient(event.clientX, event.clientY);
      if (hit) onCommit(hit, activeAttachmentAsset, movingAttachment);
      onMoveEnd();
    };

    gl.domElement.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      gl.domElement.style.cursor = previousCursor;
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeAsset, camera, gl, movingAttachment, objects, onCommit, onMoveEnd, onPreview]);

  return null;
}

function PlacedEditorBox({
  activeRoofAsset,
  activeTool,
  groundDrawToolActive = false,
  object,
  onAttachRoof,
  onDeleteObject,
  onDeleteAttachment,
  onDeleteOpening,
  onDeleteRoomWall,
  onDuplicateObject,
  onDragObject,
  onDragSelectedObjects,
  onDragStateChange,
  onMoveWallNormal,
  onRequestMoveObject,
  onAttachmentDragStart,
  onOpeningDragStart,
  onResizeRoom,
  onResizeWallEndpoint,
  onRotateObject,
  onScaleObject,
  onSelect,
  onSelectAttachment,
  onSelectOpening,
  planMode = false,
  primarySelected = false,
  resizeHandleHostRoomId,
  selected,
  selectedAttachmentId,
  selectedOpeningId,
  selectedObjectIds = [],
  activeFloor,
  wallAttachmentPreview,
  wallOpeningPreview,
  wallViewMode = "cutaway"
}) {
  const [x, y, z] = object.position;
  const size = object.size ?? [1, 1, 1];
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef(null);
  const dragPointRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(DRAG_GROUND_PLANE.clone());
  const { gl } = useThree();
  const editorLocked = isObjectLocked(object);
  const structuralWallObject = isStructuralWallObject(object);
  const transformLocked = editorLocked || object.type === "room" || structuralWallObject;
  const canMoveObject = !editorLocked && (activeTool === "select" || activeTool === "move");
  const canRotateObject = !editorLocked && activeTool === "rotate" && !transformLocked;
  const canScaleObject = !editorLocked && activeTool === "scale" && !transformLocked;
  const directPlanRoomResizeTool = planMode && (activeTool === "select" || activeTool === "move");
  const canResizeRoom = !editorLocked && object.type === "room" && (activeTool === "scale" || directPlanRoomResizeTool);
  const roomResizeHandleActive = canResizeRoom && (primarySelected || object.id === resizeHandleHostRoomId);
  const objectFloor = getObjectFloor(object);
  const floorMode = objectFloor === activeFloor ? "current" : objectFloor < activeFloor ? "below" : "above";
  const wallJoinCount = object.metadata?.wallJoin?.sourceCount ?? 1;
  const isJoinedWall = object.supportKind === "wall" && wallJoinCount > 1;
  const viewportRendererType = getViewportRendererType(object, {
    hasScenePlan: Boolean(getObjectScenePlan(object)),
    planMode,
    structuralWall: structuralWallObject
  });
  const handleY = object.type === "room" ? size[1] + 0.42 : size[1] / 2 + 0.42;
  const handleRadius = Math.max(size[0] ?? 1, size[2] ?? 1) / 2 + 0.42;
  const handleActive = primarySelected && !editorLocked && !transformLocked && (activeTool === "rotate" || activeTool === "scale");
  const planHandleY = object.type === "room" ? size[1] + 0.18 : size[1] / 2 + 0.18;

  useEffect(() => {
    if (!dragging) return undefined;
    const previousCursor = gl.domElement.style.cursor;
    gl.domElement.style.cursor = "grabbing";
    return () => {
      gl.domElement.style.cursor = previousCursor;
    };
  }, [dragging, gl]);

  const setObjectCursor = () => {
    if (groundDrawToolActive) return;
    if (editorLocked) {
      gl.domElement.style.cursor = "default";
      return;
    }
    if (activeRoofAsset && object.type === "room") {
      gl.domElement.style.cursor = "crosshair";
      return;
    }
    if (activeTool === "erase") {
      gl.domElement.style.cursor = "crosshair";
      return;
    }
    if (canMoveObject || canRotateObject || canScaleObject || canResizeRoom) gl.domElement.style.cursor = "grab";
  };

  const endDrag = (event) => {
    if (!dragStateRef.current) return;
    event.stopPropagation();
    try {
      event.target?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can already be released by the browser if the pointer left the canvas.
    }
    dragStateRef.current = null;
    setDragging(false);
    onDragStateChange(null);
  };

  const moveToPointer = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    dragPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -dragState.planeY);
    if (!event.ray.intersectPlane(dragPlaneRef.current, dragPointRef.current)) return;

    if (dragState.mode === "rotate") {
      const angle = getHorizontalAngle(dragPointRef.current, dragState.centerX, dragState.centerZ);
      const nextYaw = dragState.initialYaw + (angle - dragState.initialAngle);
      onRotateObject(object.id, [dragState.initialRotation[0] ?? 0, nextYaw, dragState.initialRotation[2] ?? 0], dragState.transactionId);
      return;
    }

    if (dragState.mode === "room-resize") {
      onResizeRoom(object.id, dragState.side, [
        Number(dragPointRef.current.x.toFixed(2)),
        dragState.planeY,
        Number(dragPointRef.current.z.toFixed(2))
      ], dragState.transactionId);
      return;
    }

    if (dragState.mode === "wall-endpoint") {
      onResizeWallEndpoint(object.id, dragState.endpoint, [
        Number(dragPointRef.current.x.toFixed(2)),
        dragState.planeY,
        Number(dragPointRef.current.z.toFixed(2))
      ], dragState.transactionId);
      return;
    }

    if (dragState.mode === "wall-normal") {
      onMoveWallNormal(object.id, dragState.side, [
        Number(dragPointRef.current.x.toFixed(2)),
        dragState.planeY,
        Number(dragPointRef.current.z.toFixed(2))
      ], dragState.transactionId);
      return;
    }

    if (dragState.mode === "scale") {
      const distance = Math.max(getHorizontalDistance(dragPointRef.current, dragState.centerX, dragState.centerZ), 0.01);
      const factor = clampNumber(distance / dragState.initialDistance, MIN_OBJECT_SCALE_FACTOR, MAX_OBJECT_SCALE_FACTOR);
      onScaleObject(object.id, [
        Number((dragState.initialSize[0] * factor).toFixed(2)),
        dragState.initialSize[1],
        Number((dragState.initialSize[2] * factor).toFixed(2))
      ], dragState.transactionId);
      return;
    }

    const nextPosition = [
      dragPointRef.current.x + dragState.offsetX,
      dragState.y,
      dragPointRef.current.z + dragState.offsetZ
    ];
    if (dragState.groupMove && onDragSelectedObjects) {
      onDragSelectedObjects(object.id, nextPosition, dragState.transactionId);
      return;
    }
    onDragObject(object.id, nextPosition, dragState.transactionId);
  };

  const startDrag = (event, mode, options = {}) => {
    event.stopPropagation();
    if (!options.preserveSelection) onSelect(object.id);
    if (editorLocked) return;

    try {
      event.target?.setPointerCapture?.(event.pointerId);
    } catch {
      // Drag still works while the pointer remains over the canvas.
    }

    if (mode === "rotate") {
      dragStateRef.current = {
        centerX: object.position[0],
        centerZ: object.position[2],
        initialAngle: getHorizontalAngle(event.point, object.position[0], object.position[2]),
        initialRotation: object.rotation ?? [0, 0, 0],
        initialYaw: object.rotation?.[1] ?? 0,
        mode: "rotate",
        planeY: object.position[1],
        transactionId: createDragTransactionId("rotate", object.id)
      };
    } else if (mode === "room-resize") {
      dragStateRef.current = {
        mode: "room-resize",
        planeY: object.position[1],
        side: options.side,
        transactionId: createDragTransactionId("room-resize", object.id)
      };
    } else if (mode === "wall-endpoint") {
      dragStateRef.current = {
        endpoint: options.endpoint,
        mode: "wall-endpoint",
        planeY: object.position[1] - size[1] / 2,
        transactionId: createDragTransactionId(`wall-endpoint-${options.endpoint}`, object.id)
      };
    } else if (mode === "wall-normal") {
      dragStateRef.current = {
        mode: "wall-normal",
        planeY: object.position[1] - size[1] / 2,
        side: options.side,
        transactionId: createDragTransactionId(`wall-normal-${options.side}`, object.id)
      };
    } else if (mode === "scale") {
      dragStateRef.current = {
        centerX: object.position[0],
        centerZ: object.position[2],
        initialDistance: Math.max(getHorizontalDistance(event.point, object.position[0], object.position[2]), 0.1),
        initialSize: size,
        mode: "scale",
        planeY: object.position[1],
        transactionId: createDragTransactionId("scale", object.id)
      };
    } else {
      const groupMove = Boolean(options.groupMove);
      dragStateRef.current = {
        groupMove,
        mode: "move",
        planeY: object.type === "room" ? object.position[1] : object.position[1] - size[1] / 2,
        y: object.position[1],
        offsetX: object.position[0] - event.point.x,
        offsetZ: object.position[2] - event.point.z,
        transactionId: createDragTransactionId(groupMove ? "group-move" : "move", object.id)
      };
    }
    setDragging(true);
    onDragStateChange(object.id);
  };

  const handleTransformPointerMove = (event) => {
    if (!dragStateRef.current) return;
    event.stopPropagation();
    moveToPointer(event);
  };

  const getPlanRoomResizeSideFromPoint = (point) => {
    if (!point || object.type !== "room") return null;
    const localX = point.x - object.position[0];
    const localZ = point.z - object.position[2];
    const halfWidth = size[0] / 2;
    const halfDepth = size[2] / 2;
    const tolerance = 0.68;
    const withinX = localX >= -halfWidth - tolerance && localX <= halfWidth + tolerance;
    const withinZ = localZ >= -halfDepth - tolerance && localZ <= halfDepth + tolerance;
    const nearNorth = withinX && Math.abs(localZ + halfDepth) <= tolerance;
    const nearSouth = withinX && Math.abs(localZ - halfDepth) <= tolerance;
    const nearWest = withinZ && Math.abs(localX + halfWidth) <= tolerance;
    const nearEast = withinZ && Math.abs(localX - halfWidth) <= tolerance;
    const vertical = nearNorth ? "north" : nearSouth ? "south" : "";
    const horizontal = nearWest ? "west" : nearEast ? "east" : "";
    return [vertical, horizontal].filter(Boolean).join("-") || null;
  };

  const getPlanWallEndpointFromPoint = (point) => {
    if (!point || !structuralWallObject) return null;
    const endpoints = getWallEndpoints(object);
    const distanceToStart = Math.hypot(point.x - endpoints[0].x, point.z - endpoints[0].z);
    const distanceToEnd = Math.hypot(point.x - endpoints[1].x, point.z - endpoints[1].z);
    if (Math.min(distanceToStart, distanceToEnd) > 0.78) return null;
    return distanceToStart <= distanceToEnd ? "start" : "end";
  };

  return (
    <group
      position={[x, y, z]}
      rotation={object.rotation ?? [0, 0, 0]}
      userData={{ studioObjectId: object.id }}
      onPointerDown={(event) => {
        if (groundDrawToolActive) return;
        event.stopPropagation();
        const selectionGesture = getPointerSelectionGesture(event);
        const groupDragCandidate = selected && selectedObjectIds.length > 1 && !selectionGesture.additive && !selectionGesture.range;
        if (!groupDragCandidate) onSelect(object.id, selectionGesture);
        if (selectionGesture.additive || selectionGesture.range) return;
        if (editorLocked) return;
        if (activeRoofAsset && object.type === "room") {
          onAttachRoof(object.id, activeRoofAsset);
          return;
        }
        if (activeTool === "erase") {
          onDeleteObject(object.id);
          return;
        }
        if (planMode && canResizeRoom) {
          const resizeSide = getPlanRoomResizeSideFromPoint(event.point);
          if (resizeSide) {
            startDrag(event, "room-resize", { side: resizeSide });
            return;
          }
        }
        if (!editorLocked && planMode && primarySelected && structuralWallObject && (activeTool === "select" || activeTool === "scale")) {
          const endpoint = getPlanWallEndpointFromPoint(event.point);
          if (endpoint) {
            startDrag(event, "wall-endpoint", { endpoint });
            return;
          }
        }
        if (!canMoveObject && !canRotateObject && !canScaleObject) return;
        const dragMode = canRotateObject ? "rotate" : canScaleObject ? "scale" : "move";
        const groupMove = dragMode === "move" && groupDragCandidate;
        startDrag(event, dragMode, {
          groupMove,
          preserveSelection: groupMove
        });
      }}
      onPointerMove={(event) => {
        if (groundDrawToolActive) return;
        if (!dragStateRef.current) return;
        event.stopPropagation();
        moveToPointer(event);
      }}
      onPointerOut={() => {
        if (!dragging) gl.domElement.style.cursor = "";
      }}
      onPointerOver={(event) => {
        if (groundDrawToolActive) return;
        event.stopPropagation();
        setObjectCursor();
      }}
      onPointerCancel={endDrag}
      onPointerUp={endDrag}
    >
      {viewportRendererType === VIEWPORT_RENDERER_TYPES.ROOM ? (
        <RoomBody
          activeTool={activeTool}
          dragging={dragging}
          floorMode={floorMode}
          object={object}
          onDeleteAttachment={onDeleteAttachment}
          onDeleteOpening={onDeleteOpening}
          onDeleteRoomWall={onDeleteRoomWall}
          onAttachmentDragStart={onAttachmentDragStart}
          onOpeningDragStart={onOpeningDragStart}
          onSelectAttachment={onSelectAttachment}
          onSelectOpening={onSelectOpening}
          planMode={planMode}
          selected={selected}
          selectedAttachmentId={selectedAttachmentId}
          selectedOpeningId={selectedOpeningId}
          wallAttachmentPreview={wallAttachmentPreview}
          wallOpeningPreview={wallOpeningPreview}
          wallViewMode={wallViewMode}
        />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.STRUCTURAL_WALL ? (
        <StructuralWallBody
          activeTool={activeTool}
          dragging={dragging}
          floorMode={floorMode}
          object={object}
          onDeleteAttachment={onDeleteAttachment}
          onDeleteOpening={onDeleteOpening}
          onAttachmentDragStart={onAttachmentDragStart}
          onOpeningDragStart={onOpeningDragStart}
          onSelectAttachment={onSelectAttachment}
          onSelectOpening={onSelectOpening}
          planMode={planMode}
          selected={selected}
          selectedAttachmentId={selectedAttachmentId}
          selectedOpeningId={selectedOpeningId}
          wallAttachmentPreview={wallAttachmentPreview}
          wallOpeningPreview={wallOpeningPreview}
          wallViewMode={wallViewMode}
        />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.ROOF_ACCESSORY ? (
        <RoofAccessoryRenderer dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.STAIR_PLAN ? (
        <StairPlanFootprint dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.STAIR ? (
        <StairAssetRenderer dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.SCENE_PLAN ? (
        <ScenePlanAssetRenderer dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
      ) : viewportRendererType === VIEWPORT_RENDERER_TYPES.GLB ? (
        <GlbAssetRenderer dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
      ) : (
        <PrimitiveAssetRenderer dragging={dragging} floorMode={floorMode} isJoinedWall={isJoinedWall} object={object} selected={selected} />
      )}
      {primarySelected && !planMode ? (
        <Html
          center
          distanceFactor={9}
          position={[0, object.type === "room" ? size[1] + 0.3 : size[1] / 2 + 0.26, 0]}
        >
          <SelectedObjectActionMenu
            activeTool={activeTool}
            dragging={dragging}
            isJoinedWall={isJoinedWall}
            locked={editorLocked}
            object={object}
            onDelete={() => onDeleteObject(object.id)}
            onDuplicate={onDuplicateObject}
            onMove={onRequestMoveObject}
          />
        </Html>
      ) : null}
      {roomResizeHandleActive ? planMode ? (
        <group>
          {[
            { side: "north", position: [0, planHandleY, -size[2] / 2 - 0.28], args: [0.92, 0.035, 0.18], hitArgs: [1.12, 0.08, 0.48], cursor: "ns-resize" },
            { side: "south", position: [0, planHandleY, size[2] / 2 + 0.28], args: [0.92, 0.035, 0.18], hitArgs: [1.12, 0.08, 0.48], cursor: "ns-resize" },
            { side: "west", position: [-size[0] / 2 - 0.28, planHandleY, 0], args: [0.18, 0.035, 0.92], hitArgs: [0.48, 0.08, 1.12], cursor: "ew-resize" },
            { side: "east", position: [size[0] / 2 + 0.28, planHandleY, 0], args: [0.18, 0.035, 0.92], hitArgs: [0.48, 0.08, 1.12], cursor: "ew-resize" },
            { side: "north-west", position: [-size[0] / 2 - 0.28, planHandleY, -size[2] / 2 - 0.28], args: [0.36, 0.035, 0.36], hitArgs: [0.72, 0.08, 0.72], cursor: "nwse-resize" },
            { side: "north-east", position: [size[0] / 2 + 0.28, planHandleY, -size[2] / 2 - 0.28], args: [0.36, 0.035, 0.36], hitArgs: [0.72, 0.08, 0.72], cursor: "nesw-resize" },
            { side: "south-west", position: [-size[0] / 2 - 0.28, planHandleY, size[2] / 2 + 0.28], args: [0.36, 0.035, 0.36], hitArgs: [0.72, 0.08, 0.72], cursor: "nesw-resize" },
            { side: "south-east", position: [size[0] / 2 + 0.28, planHandleY, size[2] / 2 + 0.28], args: [0.36, 0.035, 0.36], hitArgs: [0.72, 0.08, 0.72], cursor: "nwse-resize" }
          ].map((handle) => (
            <group key={`room-resize-${handle.side}`} position={handle.position}>
              <mesh
                renderOrder={44}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "room-resize", { side: handle.side })}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = handle.cursor;
                }}
                onPointerUp={endDrag}
              >
                <boxGeometry args={handle.args} />
                <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
              </mesh>
              <mesh
                renderOrder={45}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "room-resize", { side: handle.side })}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = handle.cursor;
                }}
                onPointerUp={endDrag}
              >
                <boxGeometry args={handle.hitArgs.map((value, index) => (index === 1 ? value : value * 1.55))} />
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} opacity={0.01} transparent depthWrite={false} />
              </mesh>
            </group>
          ))}
        </group>
      ) : (
        <group>
          {[
            { side: "north", position: [0, size[1] + 0.18, -size[2] / 2 - 0.34], args: [0.88, 0.18, 0.18], cursor: "ns-resize" },
            { side: "south", position: [0, size[1] + 0.18, size[2] / 2 + 0.34], args: [0.88, 0.18, 0.18], cursor: "ns-resize" },
            { side: "west", position: [-size[0] / 2 - 0.34, size[1] + 0.18, 0], args: [0.18, 0.18, 0.88], cursor: "ew-resize" },
            { side: "east", position: [size[0] / 2 + 0.34, size[1] + 0.18, 0], args: [0.18, 0.18, 0.88], cursor: "ew-resize" },
            { corner: true, side: "north-west", position: [-size[0] / 2 - 0.34, size[1] + 0.2, -size[2] / 2 - 0.34], args: [0.46, 0.2, 0.46], cursor: "nwse-resize" },
            { corner: true, side: "north-east", position: [size[0] / 2 + 0.34, size[1] + 0.2, -size[2] / 2 - 0.34], args: [0.46, 0.2, 0.46], cursor: "nesw-resize" },
            { corner: true, side: "south-west", position: [-size[0] / 2 - 0.34, size[1] + 0.2, size[2] / 2 + 0.34], args: [0.46, 0.2, 0.46], cursor: "nesw-resize" },
            { corner: true, side: "south-east", position: [size[0] / 2 + 0.34, size[1] + 0.2, size[2] / 2 + 0.34], args: [0.46, 0.2, 0.46], cursor: "nwse-resize" }
          ].map((handle) => (
            <mesh
              key={`room-resize-${handle.side}`}
              renderOrder={24}
              position={handle.position}
              onPointerCancel={endDrag}
              onPointerDown={(event) => startDrag(event, "room-resize", { side: handle.side })}
              onPointerMove={handleTransformPointerMove}
              onPointerOut={() => {
                if (!dragging) gl.domElement.style.cursor = "";
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                gl.domElement.style.cursor = handle.cursor;
              }}
              onPointerUp={endDrag}
            >
              <boxGeometry args={handle.corner ? [0.82, 0.24, 0.82] : handle.args} />
              {handle.corner ? (
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} opacity={0.01} transparent depthWrite={false} />
              ) : (
                <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
              )}
              {handle.corner ? (
                <mesh renderOrder={25}>
                  <boxGeometry args={handle.args} />
                  <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
                </mesh>
              ) : null}
            </mesh>
          ))}
        </group>
      ) : null}
      {primarySelected && !editorLocked && structuralWallObject && (activeTool === "select" || activeTool === "scale") ? planMode ? (
        <group>
          {[
            { endpoint: "start", position: [-size[0] / 2, planHandleY, 0] },
            { endpoint: "end", position: [size[0] / 2, planHandleY, 0] }
          ].map((handle) => (
            <group key={`wall-endpoint-${handle.endpoint}`} position={handle.position}>
              <mesh
                renderOrder={46}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "wall-endpoint", { endpoint: handle.endpoint })}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "grab";
                }}
                onPointerUp={endDrag}
              >
                <cylinderGeometry args={[0.16, 0.16, 0.035, 28]} />
                <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
              </mesh>
              <mesh
                renderOrder={47}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "wall-endpoint", { endpoint: handle.endpoint })}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "grab";
                }}
                onPointerUp={endDrag}
              >
                <cylinderGeometry args={[0.38, 0.38, 0.08, 28]} />
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} opacity={0.01} transparent depthWrite={false} />
              </mesh>
            </group>
          ))}
        </group>
      ) : (
        <group>
          {[
            { endpoint: "start", position: [-size[0] / 2, size[1] / 2 + 0.2, 0] },
            { endpoint: "end", position: [size[0] / 2, size[1] / 2 + 0.2, 0] }
          ].map((handle) => (
            <group key={`wall-endpoint-${handle.endpoint}`} position={handle.position}>
              <mesh
                renderOrder={28}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "wall-endpoint", { endpoint: handle.endpoint })}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "grab";
                }}
                onPointerUp={endDrag}
              >
                <sphereGeometry args={[0.46, 20, 14]} />
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} depthWrite={false} opacity={0.02} transparent />
                <mesh renderOrder={29}>
                  <sphereGeometry args={[0.2, 20, 14]} />
                  <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
                </mesh>
              </mesh>
              <mesh renderOrder={27} position={[0, -0.18, 0]}>
                <boxGeometry args={[0.08, 0.38, 0.08]} />
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} depthTest={false} transparent opacity={0.72} />
              </mesh>
            </group>
          ))}
        </group>
      ) : null}
      {!planMode && primarySelected && !editorLocked && structuralWallObject && (activeTool === "select" || activeTool === "move") ? (
        <group>
          {[
            { side: "front", position: [0, size[1] / 2 + 0.18, size[2] / 2 + 0.42] },
            { side: "back", position: [0, size[1] / 2 + 0.18, -size[2] / 2 - 0.42] }
          ].map((handle) => (
            <mesh
              key={`wall-normal-${handle.side}`}
              renderOrder={26}
              position={handle.position}
              onPointerCancel={endDrag}
              onPointerDown={(event) => startDrag(event, "wall-normal", { side: handle.side })}
              onPointerMove={handleTransformPointerMove}
              onPointerOut={() => {
                if (!dragging) gl.domElement.style.cursor = "";
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                gl.domElement.style.cursor = "move";
              }}
              onPointerUp={endDrag}
            >
              <boxGeometry args={[0.82, 0.16, 0.32]} />
              <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} transparent opacity={0.88} />
            </mesh>
          ))}
        </group>
      ) : null}
      {!planMode && handleActive ? (
        <>
          <mesh
            onPointerCancel={endDrag}
            onPointerDown={(event) => startDrag(event, activeTool === "rotate" ? "rotate" : "scale")}
            onPointerMove={handleTransformPointerMove}
            onPointerOut={() => {
              if (!dragging) gl.domElement.style.cursor = "";
            }}
            onPointerOver={(event) => {
              event.stopPropagation();
              gl.domElement.style.cursor = activeTool === "rotate" ? "alias" : "nwse-resize";
            }}
            onPointerUp={endDrag}
            position={[0, size[1] / 2 + 0.08, 0]}
          >
            <boxGeometry args={[Math.max(size[0], 0.5) + 0.52, Math.max(size[1], 0.12) + 0.18, Math.max(size[2], 0.5) + 0.52]} />
            <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} opacity={0.035} transparent depthWrite={false} />
          </mesh>
          {activeTool === "rotate" ? (
            <>
              <mesh
                renderOrder={20}
                rotation={[Math.PI / 2, 0, 0]}
                position={[0, handleY, 0]}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "rotate")}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "alias";
                }}
                onPointerUp={endDrag}
              >
                <torusGeometry args={[handleRadius, 0.035, 8, 72]} />
                <meshBasicMaterial color={TRANSFORM_HANDLE_COLOR} depthTest={false} transparent opacity={0.9} />
              </mesh>
              <mesh
                renderOrder={21}
                position={[size[0] / 2 + 0.32, handleY, size[2] / 2 + 0.32]}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "rotate")}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "alias";
                }}
                onPointerUp={endDrag}
              >
                <sphereGeometry args={[0.17, 18, 12]} />
                <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
              </mesh>
            </>
          ) : (
            <group position={[size[0] / 2 + 0.32, handleY, size[2] / 2 + 0.32]}>
              <mesh
                renderOrder={20}
                onPointerCancel={endDrag}
                onPointerDown={(event) => startDrag(event, "scale")}
                onPointerMove={handleTransformPointerMove}
                onPointerOut={() => {
                  if (!dragging) gl.domElement.style.cursor = "";
                }}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  gl.domElement.style.cursor = "nwse-resize";
                }}
                onPointerUp={endDrag}
              >
                <boxGeometry args={[0.28, 0.28, 0.28]} />
                <meshBasicMaterial color={dragging ? TRANSFORM_HANDLE_INVALID_COLOR : TRANSFORM_HANDLE_COLOR} depthTest={false} />
              </mesh>
            </group>
          )}
        </>
      ) : null}
    </group>
  );
}

function PlacedEditorObjects({
  activeFloor,
  activeRoofAsset,
  activeTool,
  groundDrawToolActive,
  objects,
  onAttachRoof,
  onDeleteObject,
  onDeleteAttachment,
  onDeleteOpening,
  onDeleteRoomWall,
  onDuplicateObject,
  onDragObject,
  onDragSelectedObjects,
  onDragStateChange,
  onMoveWallNormal,
  onRequestMoveObject,
  onAttachmentDragStart,
  onOpeningDragStart,
  onResizeRoom,
  onResizeWallEndpoint,
  onRotateObject,
  onScaleObject,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  planMode = false,
  resizeHandleHostRoomId,
  selectedAttachmentId,
  selectedOpeningId,
  selectedObjectId,
  selectedObjectIds = [],
  wallAttachmentPreview,
  wallOpeningPreview,
  wallViewMode = "cutaway"
}) {
  const selectedObjectIdSet = useMemo(() => new Set(selectedObjectIds), [selectedObjectIds]);
  return (
    <group>
      {objects.map((object) => (
        <PlacedEditorBox
          activeTool={activeTool}
          activeFloor={activeFloor}
          activeRoofAsset={activeRoofAsset}
          groundDrawToolActive={groundDrawToolActive}
          key={object.id}
          object={object}
          onAttachRoof={onAttachRoof}
          onDeleteObject={onDeleteObject}
          onDeleteAttachment={onDeleteAttachment}
          onDeleteOpening={onDeleteOpening}
          onDeleteRoomWall={onDeleteRoomWall}
          onDuplicateObject={onDuplicateObject}
          onDragObject={onDragObject}
          onDragSelectedObjects={onDragSelectedObjects}
          onDragStateChange={onDragStateChange}
          onMoveWallNormal={onMoveWallNormal}
          onRequestMoveObject={onRequestMoveObject}
          onAttachmentDragStart={onAttachmentDragStart}
          onOpeningDragStart={onOpeningDragStart}
          onResizeRoom={onResizeRoom}
          onResizeWallEndpoint={onResizeWallEndpoint}
          onRotateObject={onRotateObject}
          onScaleObject={onScaleObject}
          onSelect={onSelectObject}
          onSelectAttachment={onSelectAttachment}
          onSelectOpening={onSelectOpening}
          planMode={planMode}
          primarySelected={object.id === selectedObjectId}
          resizeHandleHostRoomId={resizeHandleHostRoomId}
          selected={selectedObjectIdSet.has(object.id) || object.id === selectedObjectId}
          selectedAttachmentId={selectedAttachmentId}
          selectedOpeningId={selectedOpeningId}
          selectedObjectIds={selectedObjectIds}
          wallAttachmentPreview={wallAttachmentPreview}
          wallOpeningPreview={wallOpeningPreview}
          wallViewMode={wallViewMode}
        />
      ))}
    </group>
  );
}

function FloorSupportGuide({ activeFloor, activeFloorBaseY, objects }) {
  if (activeFloor <= 1) return null;

  const lowerRooms = objects.filter((object) => object.type === "room" && getObjectFloor(object) === activeFloor - 1);
  if (!lowerRooms.length) return null;

  return (
    <group>
      {lowerRooms.map((room) => {
        const [width = 1, , depth = 1] = room.size ?? [1, 2.7, 1];
        const [x = 0, , z = 0] = room.position ?? [0, 0, 0];
        return (
          <mesh key={`support-guide-${room.id}`} position={[x, activeFloorBaseY + 0.045, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial color="#35a797" opacity={0.18} transparent side={THREE.DoubleSide} />
            <Edges color="#178879" lineWidth={1} />
          </mesh>
        );
      })}
    </group>
  );
}

function PlanModeOverlay({ activeFloor, activeFloorBaseY, objects, selectedObjectId, selectedObjectIds = [] }) {
  const floorObjects = objects.filter((object) => getObjectFloor(object) === activeFloor);
  const rooms = floorObjects.filter((object) => object.type === "room");
  const walls = floorObjects.filter(isStructuralWallObject);
  const overlayY = activeFloorBaseY + 0.16;
  const selectedObjectIdSet = new Set(selectedObjectIds);

  if (!rooms.length && !walls.length) return null;

  return (
    <group>
      {rooms.map((room) => {
        const [width = 1, , depth = 1] = room.size ?? [1, 2.7, 1];
        const [x = 0, , z = 0] = room.position ?? [0, 0, 0];
        const selected = selectedObjectIdSet.has(room.id) || room.id === selectedObjectId;
        return (
          <group key={`plan-room-${room.id}`} position={[x, overlayY + 0.01, z]}>
            <mesh raycast={() => null} rotation={[-Math.PI / 2, 0, 0]} renderOrder={34}>
              <planeGeometry args={[width, depth]} />
              <meshBasicMaterial
                color={selected ? "#f6c879" : "#d7ebe5"}
                depthTest={false}
                opacity={selected ? 0.28 : 0.16}
                transparent
              />
              <Edges color={selected ? "#a66e19" : "#248c7e"} lineWidth={selected ? 2 : 1} />
            </mesh>
            <Html center distanceFactor={16} position={[0, 0.15, 0]} style={{ pointerEvents: "none" }}>
              <div className={`studio-editor-plan-label${selected ? " is-selected" : ""}`}>{room.name}</div>
            </Html>
            {selected ? (
              <PlanRoomDimensions
                depth={depth}
                width={width}
                x={x}
                y={overlayY + 0.18}
                z={z}
              />
            ) : null}
          </group>
        );
      })}
      {walls.map((wall) => {
        const [x = 0, , z = 0] = wall.position ?? [0, 0, 0];
        const segment = getWallSegment(wall);
        const selected = selectedObjectIdSet.has(wall.id) || wall.id === selectedObjectId;
        const endpoints = getWallEndpoints(wall);
        const wallOpenings = wall.wallOpenings ?? [];
        const wallAxisLabel = segment.orientation === "x" ? "X axis" : "Z axis";
        return (
          <group key={`plan-wall-${wall.id}`}>
            <mesh
              position={[x, overlayY + 0.04, z]}
              raycast={() => null}
              renderOrder={36}
              rotation={[0, segment.orientation === "z" ? Math.PI / 2 : 0, 0]}
            >
              <boxGeometry args={[segment.width, 0.035, Math.max(segment.thickness, 0.1)]} />
              <meshBasicMaterial
                color={selected ? "#f2ba52" : "#267f74"}
                depthTest={false}
                opacity={selected ? 0.95 : 0.74}
                transparent
              />
            </mesh>
            {endpoints.map((endpoint, index) => (
              <group
                key={`plan-wall-endpoint-${wall.id}-${index}`}
                position={[endpoint.x, overlayY + (selected ? 0.115 : 0.08), endpoint.z]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <mesh raycast={() => null} renderOrder={selected ? 43 : 37}>
                  <circleGeometry args={[selected ? 0.16 : 0.1, 28]} />
                  <meshBasicMaterial color={selected ? "#f2ba52" : "#21a79b"} depthTest={false} />
                </mesh>
                {selected ? (
                  <mesh raycast={() => null} renderOrder={44}>
                    <ringGeometry args={[0.2, 0.245, 28]} />
                    <meshBasicMaterial color="#2f2310" depthTest={false} transparent opacity={0.88} />
                  </mesh>
                ) : null}
              </group>
            ))}
            {wallOpenings.map((opening) => {
              const offset = opening.offset ?? 0;
              const openingX = segment.orientation === "x" ? x + offset : x;
              const openingZ = segment.orientation === "x" ? z : z + offset;
              return (
                <mesh
                  key={`plan-wall-opening-${wall.id}-${opening.id}`}
                  position={[openingX, overlayY + 0.09, openingZ]}
                  raycast={() => null}
                  renderOrder={38}
                  rotation={[0, segment.orientation === "z" ? Math.PI / 2 : 0, 0]}
                >
                  <boxGeometry args={[opening.width ?? 0.9, 0.04, Math.max(segment.thickness + 0.1, 0.2)]} />
                  <meshBasicMaterial color="#f7fbfa" depthTest={false} opacity={0.96} transparent />
                </mesh>
              );
            })}
            {selected ? (
              <Html center distanceFactor={16} position={[x, overlayY + 0.24, z]} style={{ pointerEvents: "none" }}>
                <div className="studio-editor-plan-label studio-editor-plan-wall-label is-selected">
                  <strong>{wall.name}</strong>
                  <span>{formatMeters(segment.width)} · {wallAxisLabel} · {wallOpenings.length} openings</span>
                </div>
              </Html>
            ) : null}
            {selected ? (
              <PlanWallDimensions
                endpoints={endpoints}
                label={`${formatMeters(segment.width)} L`}
                y={overlayY + 0.18}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export function EditorViewport({
  activeFloor = 1,
  activeFloorBaseY = 0,
  activeRoofAsset,
  activeRoomAsset,
  activeWallAttachmentAsset,
  activeWallDrawAsset,
  activeWallOpeningAsset,
  activeTool = "select",
  cameraView = "orbit",
  dropRequest,
  gridVisible = true,
  movingAttachment,
  movingOpening,
  objects = [],
  onAttachRoof,
  onDeleteObject,
  onDeleteAttachment,
  onDeleteOpening,
  onDeleteRoomWall,
  onDuplicateObject,
  onDragObject,
  onDragSelectedObjects,
  onDropPointResolved,
  onGroundMarqueeSelect,
  onGroundPointerDown,
  onMoveWallNormal,
  onRequestMoveObject,
  onAttachmentMoveEnd,
  onAttachmentDragStart,
  onOpeningDragStart,
  onOpeningMoveEnd,
  onResizeRoom,
  onResizeWallEndpoint,
  onRotateObject,
  onRoomDraftChange,
  onRoomDraftCommit,
  onScaleObject,
  onSelectAttachment,
  onSelectObject,
  onSelectOpening,
  onWallDraftChange,
  onWallDraftCommit,
  onWallAttachmentCommit,
  onWallAttachmentPreview,
  onWallOpeningCommit,
  onWallOpeningPreview,
  roomDraft,
  resizeHandleHostRoomId,
  selectedAttachmentId,
  selectedObjectId,
  selectedObjectIds = [],
  selectedOpeningId,
  wallDraft,
  wallAttachmentPreview,
  wallOpeningPreview,
  wallViewMode = "cutaway"
}) {
  const [draggingObjectId, setDraggingObjectId] = useState(null);
  const [drawingRoom, setDrawingRoom] = useState(false);
  const [drawingWall, setDrawingWall] = useState(false);
  const orbitControlsRef = useRef(null);
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
  const planMode = interactionMode.planMode;
  const visibleObjects = useMemo(() => objects.filter((object) => !isObjectHidden(object)), [objects]);
  const marqueeSelectionActive = interactionMode.canMarqueeSelect;

  return (
    <Canvas
      className={`studio-editor-canvas${planMode ? " is-plan-mode" : ""}`}
      dpr={[1, 1.6]}
      frameloop={planMode ? "always" : "demand"}
      gl={createStudioRenderer}
      key={planMode ? "studio-editor-plan-canvas" : "studio-editor-3d-canvas"}
      shadows
    >
      {planMode ? null : <color attach="background" args={["#dfe8e3"]} />}
      {planMode ? null : <fog attach="fog" args={["#dfe8e3", 18, 34]} />}
      <SceneClearRuntime planMode={planMode} />
      {planMode ? (
        <OrthographicCamera
          makeDefault
          far={100}
          key="studio-plan-camera"
          near={0.1}
          position={[0, activeFloorBaseY + 18, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          zoom={62}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          fov={44}
          key="studio-perspective-camera"
          position={[8.5, activeFloorBaseY + 7.2, 9.5]}
        />
      )}
      <CameraViewController
        activeFloorBaseY={activeFloorBaseY}
        cameraView={cameraView}
        controlsRef={orbitControlsRef}
      />
      <PlanModeBackdrop activeFloorBaseY={activeFloorBaseY} visible={planMode} />
      <RaycastAccelerationRuntime
        activeTool={activeTool}
        cameraView={cameraView}
        objects={visibleObjects}
        roomDraft={roomDraft}
        selectedAttachmentId={selectedAttachmentId}
        selectedObjectId={selectedObjectId}
        selectedOpeningId={selectedOpeningId}
        wallAttachmentPreview={wallAttachmentPreview}
        wallDraft={wallDraft}
        wallOpeningPreview={wallOpeningPreview}
      />
      <ViewLights planMode={planMode} />
      <EditorGround
        activeFloorBaseY={activeFloorBaseY}
        gridVisible={gridVisible}
        marqueeEnabled={marqueeSelectionActive}
        onGroundMarqueeSelect={onGroundMarqueeSelect}
        onGroundPointerDown={onGroundPointerDown}
        planMode={planMode}
      />
      <PlanMarqueeController
        active={marqueeSelectionActive}
        activeFloor={activeFloor}
        floorBaseY={activeFloorBaseY}
        objects={visibleObjects}
        onGroundClick={onGroundPointerDown}
        onMarqueeSelect={onGroundMarqueeSelect}
      />
      <FloorSupportGuide
        activeFloor={activeFloor}
        activeFloorBaseY={activeFloorBaseY}
        objects={visibleObjects}
      />
      <RoomDraftPreview draft={roomDraft} />
      <WallDraftPreview draft={wallDraft} />
      <RoomDrawingPlane
        activeAsset={activeRoomAsset}
        floorBaseY={activeFloorBaseY}
        onDraftChange={onRoomDraftChange}
        onDraftCommit={onRoomDraftCommit}
        onDrawingStateChange={setDrawingRoom}
      />
      <RoomDrawingPlane
        activeAsset={activeWallDrawAsset}
        floorBaseY={activeFloorBaseY}
        onDraftChange={onWallDraftChange}
        onDraftCommit={onWallDraftCommit}
        onDrawingStateChange={setDrawingWall}
      />
      <WallOpeningController
        activeAsset={activeWallOpeningAsset}
        movingOpening={movingOpening}
        objects={visibleObjects}
        onCommit={onWallOpeningCommit}
        onMoveEnd={onOpeningMoveEnd}
        onPreview={onWallOpeningPreview}
      />
      <WallAttachmentController
        activeAsset={activeWallAttachmentAsset}
        movingAttachment={movingAttachment}
        objects={visibleObjects}
        onCommit={onWallAttachmentCommit}
        onMoveEnd={onAttachmentMoveEnd}
        onPreview={onWallAttachmentPreview}
      />
      <DropPlacementResolver
        activeFloorBaseY={activeFloorBaseY}
        dropRequest={dropRequest}
        onDropPointResolved={onDropPointResolved}
      />
      <PlacedEditorObjects
        activeFloor={activeFloor}
        activeRoofAsset={activeRoofAsset}
        activeTool={activeTool}
        groundDrawToolActive={interactionMode.groundDrawToolActive}
        objects={visibleObjects}
        onAttachRoof={onAttachRoof}
        onDeleteObject={onDeleteObject}
        onDeleteAttachment={onDeleteAttachment}
        onDeleteOpening={onDeleteOpening}
        onDeleteRoomWall={onDeleteRoomWall}
        onDuplicateObject={onDuplicateObject}
        onDragObject={onDragObject}
        onDragSelectedObjects={onDragSelectedObjects}
        onMoveWallNormal={onMoveWallNormal}
        onRequestMoveObject={onRequestMoveObject}
        onDragStateChange={setDraggingObjectId}
        onAttachmentDragStart={onAttachmentDragStart}
        onOpeningDragStart={onOpeningDragStart}
        onResizeRoom={onResizeRoom}
        onResizeWallEndpoint={onResizeWallEndpoint}
        onRotateObject={onRotateObject}
        onScaleObject={onScaleObject}
        onSelectAttachment={onSelectAttachment}
        onSelectObject={onSelectObject}
        onSelectOpening={onSelectOpening}
        planMode={planMode}
        resizeHandleHostRoomId={resizeHandleHostRoomId}
        selectedAttachmentId={selectedAttachmentId}
        selectedOpeningId={selectedOpeningId}
        selectedObjectId={selectedObjectId}
        selectedObjectIds={selectedObjectIds}
        wallAttachmentPreview={wallAttachmentPreview}
        wallOpeningPreview={wallOpeningPreview}
        wallViewMode={wallViewMode}
      />
      {planMode ? (
        <PlanModeOverlay
          activeFloor={activeFloor}
          activeFloorBaseY={activeFloorBaseY}
          objects={visibleObjects}
          selectedObjectId={selectedObjectId}
          selectedObjectIds={selectedObjectIds}
        />
      ) : null}
      {planMode ? null : (
        <ContactShadows
          blur={2.6}
          far={18}
          opacity={0.18}
          position={[0, 0.015, 0]}
          scale={18}
        />
      )}
      <OrbitControls
        ref={orbitControlsRef}
        key={`studio-orbit-controls-${cameraView}`}
        enabled={
          !draggingObjectId &&
          !drawingRoom &&
          !drawingWall &&
          !interactionMode.viewportControlsBlockedByTool
        }
        enableRotate={!planMode}
        enableDamping
        enablePan
        enableZoom
        makeDefault
        mouseButtons={
          planMode
            ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
            : undefined
        }
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.08}
        minDistance={5}
        screenSpacePanning={planMode}
        target={[0, activeFloorBaseY + 0.15, 0]}
        touches={
          planMode
            ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
            : undefined
        }
      />
    </Canvas>
  );
}
