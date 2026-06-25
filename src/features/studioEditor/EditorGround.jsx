import React, { useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EDITOR_GRID, getBuildableFootprint } from "./editorDefaults.js";

function LineSegments({ color, depthTest = true, opacity = 1, positions, renderOrder = 0 }) {
  return (
    <lineSegments renderOrder={renderOrder}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={positions.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} depthTest={depthTest} transparent={opacity < 1} opacity={opacity} />
    </lineSegments>
  );
}

function rectangleSegments(width, depth, y = 0.03) {
  const x = width / 2;
  const z = depth / 2;
  return new Float32Array([
    -x, y, -z, x, y, -z,
    x, y, -z, x, y, z,
    x, y, z, -x, y, z,
    -x, y, z, -x, y, -z
  ]);
}

function createGridPositions({ major = false }) {
  const half = EDITOR_GRID.size / 2;
  const step = major ? EDITOR_GRID.majorStep : EDITOR_GRID.minorStep;
  const values = [];
  for (let value = -half; value <= half + 0.0001; value += step) {
    const rounded = Number(value.toFixed(3));
    if (!major && Math.abs(rounded % EDITOR_GRID.majorStep) < 0.001) continue;
    values.push(rounded);
  }

  const positions = [];
  values.forEach((value) => {
    positions.push(-half, 0.002, value, half, 0.002, value);
    positions.push(value, 0.002, -half, value, 0.002, half);
  });
  return new Float32Array(positions);
}

function createMeterBoxPositions(width, depth, y = 0.064) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [];

  for (let x = -halfWidth; x <= halfWidth + 0.0001; x += 1) {
    positions.push(x, y, -halfDepth, x, y, halfDepth);
  }

  for (let z = -halfDepth; z <= halfDepth + 0.0001; z += 1) {
    positions.push(-halfWidth, y, z, halfWidth, y, z);
  }

  return new Float32Array(positions);
}

function pushDashedLine(positions, start, end, dash = 0.16, gap = 0.16) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const length = direction.length();
  if (length <= 0) return;

  direction.normalize();
  for (let cursor = 0; cursor < length; cursor += dash + gap) {
    const segmentStart = startVector.clone().addScaledVector(direction, cursor);
    const segmentEnd = startVector.clone().addScaledVector(direction, Math.min(cursor + dash, length));
    positions.push(segmentStart.x, segmentStart.y, segmentStart.z, segmentEnd.x, segmentEnd.y, segmentEnd.z);
  }
}

function createSubdivisionDashes(width, depth, y = 0.078) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [];

  for (let x = -halfWidth + EDITOR_GRID.subdivisionStep; x < halfWidth; x += EDITOR_GRID.minorStep) {
    pushDashedLine(positions, [x, y, -halfDepth], [x, y, halfDepth]);
  }

  for (let z = -halfDepth + EDITOR_GRID.subdivisionStep; z < halfDepth; z += EDITOR_GRID.minorStep) {
    pushDashedLine(positions, [-halfWidth, y, z], [halfWidth, y, z]);
  }

  return new Float32Array(positions);
}

function createPlanRulerTicks(width, depth, y = 0.13) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [];
  const shortTick = 0.18;
  const longTick = 0.3;

  for (let x = -halfWidth; x <= halfWidth + 0.0001; x += 1) {
    const rounded = Number(x.toFixed(3));
    const tick = Math.abs(rounded % 2) < 0.001 ? longTick : shortTick;
    positions.push(rounded, y, -halfDepth, rounded, y, -halfDepth - tick);
    positions.push(rounded, y, halfDepth, rounded, y, halfDepth + tick);
  }

  for (let z = -halfDepth; z <= halfDepth + 0.0001; z += 1) {
    const rounded = Number(z.toFixed(3));
    const tick = Math.abs(rounded % 2) < 0.001 ? longTick : shortTick;
    positions.push(-halfWidth, y, rounded, -halfWidth - tick, y, rounded);
    positions.push(halfWidth, y, rounded, halfWidth + tick, y, rounded);
  }

  return new Float32Array(positions);
}

function createPlanRulerLabels(width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const labels = [];

  for (let x = -halfWidth; x <= halfWidth + 0.0001; x += 2) {
    const value = Number(x.toFixed(2));
    labels.push({
      axis: "x",
      id: `x-${value}`,
      label: `${value}m`,
      position: [value, 0, -halfDepth - 0.55]
    });
  }

  for (let z = -halfDepth; z <= halfDepth + 0.0001; z += 2) {
    const value = Number(z.toFixed(2));
    labels.push({
      axis: "z",
      id: `z-${value}`,
      label: `${value}m`,
      position: [-halfWidth - 0.55, 0, value]
    });
  }

  return labels;
}

function PlanRuler({ floorBaseY = 0, visible }) {
  const y = Number((floorBaseY + 0.145).toFixed(3));
  const ticks = useMemo(() => createPlanRulerTicks(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth, y), [y]);
  const labels = useMemo(() => createPlanRulerLabels(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth), []);

  if (!visible) return null;

  return (
    <group>
      <LineSegments color="#4b3a18" depthTest={false} opacity={0.76} positions={ticks} renderOrder={34} />
      {labels.map((item) => (
        <Html
          center
          distanceFactor={20}
          key={item.id}
          position={[item.position[0], y + 0.05, item.position[2]]}
          style={{ pointerEvents: "none" }}
        >
          <div className={`studio-editor-plan-ruler-label is-${item.axis}`}>{item.label}</div>
        </Html>
      ))}
    </group>
  );
}

function GroundGrid({ floorBaseY = 0, planMode = false, visible }) {
  const minorPositions = useMemo(() => createGridPositions({ major: false }), []);
  const majorPositions = useMemo(() => createGridPositions({ major: true }), []);

  if (!visible) return null;
  return (
    <group position={[0, planMode ? floorBaseY + 0.028 : 0, 0]}>
      <LineSegments color={planMode ? "#c7d7cf" : "#cfd8d1"} depthTest={!planMode} opacity={planMode ? 0.52 : 0.42} positions={minorPositions} renderOrder={planMode ? 28 : 0} />
      <LineSegments color={planMode ? "#78958b" : "#8ea49a"} depthTest={!planMode} opacity={planMode ? 0.84 : 0.72} positions={majorPositions} renderOrder={planMode ? 29 : 0} />
    </group>
  );
}

function AxisLines() {
  const positions = useMemo(() => new Float32Array([
    -12, 0.04, 0, 12, 0.04, 0,
    0, 0.04, -12, 0, 0.04, 12
  ]), []);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={4} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial vertexColors={false} color="#55746a" transparent opacity={0.82} />
    </lineSegments>
  );
}

function ActiveFloorPlanOverlay({ floorBaseY = 0, visible }) {
  const y = Number((floorBaseY + 0.115).toFixed(3));
  const parcelBoundary = useMemo(() => rectangleSegments(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth, y), [y]);
  const parcelMeterBoxes = useMemo(() => createMeterBoxPositions(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth, y + 0.002), [y]);
  const parcelSubdivisionDashes = useMemo(() => createSubdivisionDashes(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth, y + 0.004), [y]);
  const buildable = useMemo(() => {
    const footprint = getBuildableFootprint();
    return rectangleSegments(footprint.width, footprint.depth, y + 0.006);
  }, [y]);

  if (!visible) return null;
  return (
    <group>
      <LineSegments color="#095f58" depthTest={false} opacity={0.98} positions={parcelBoundary} renderOrder={32} />
      <LineSegments color="#129487" depthTest={false} opacity={0.72} positions={parcelMeterBoxes} renderOrder={31} />
      <LineSegments color="#129487" depthTest={false} opacity={0.44} positions={parcelSubdivisionDashes} renderOrder={31} />
      <LineSegments color="#c75b43" depthTest={false} opacity={0.98} positions={buildable} renderOrder={33} />
    </group>
  );
}

function getMarqueeBounds(start, current) {
  if (!start || !current) return null;
  return {
    maxX: Math.max(start.x, current.x),
    maxZ: Math.max(start.z, current.z),
    minX: Math.min(start.x, current.x),
    minZ: Math.min(start.z, current.z)
  };
}

function MarqueeSelectionPreview({ draft, floorBaseY = 0 }) {
  const bounds = getMarqueeBounds(draft?.start, draft?.current);
  if (!bounds) return null;

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  if (width < 0.05 || depth < 0.05) return null;

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const y = Number((floorBaseY + 0.18).toFixed(3));
  const outline = rectangleSegments(width, depth, 0.018);

  return (
    <group position={[centerX, y, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={70}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color="#21a79b" depthTest={false} depthWrite={false} opacity={0.16} transparent />
      </mesh>
      <LineSegments color="#0a6f66" depthTest={false} opacity={0.92} positions={outline} renderOrder={71} />
    </group>
  );
}

export function EditorGround({
  activeFloorBaseY = 0,
  gridVisible = true,
  marqueeEnabled = false,
  onGroundMarqueeSelect,
  onGroundPointerDown,
  planMode = false
}) {
  const [marqueeDraft, setMarqueeDraft] = useState(null);
  const marqueeStartRef = useRef(null);
  const { camera, gl } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());
  const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -activeFloorBaseY));
  const parcelBoundary = useMemo(() => rectangleSegments(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth, 0.035), []);
  const parcelMeterBoxes = useMemo(() => createMeterBoxPositions(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth), []);
  const parcelSubdivisionDashes = useMemo(() => createSubdivisionDashes(EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth), []);
  const buildable = useMemo(() => {
    const footprint = getBuildableFootprint();
    return rectangleSegments(footprint.width, footprint.depth, 0.05);
  }, []);

  groundPlaneRef.current.set(new THREE.Vector3(0, 1, 0), -activeFloorBaseY);

  const getGroundPointFromClient = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    pointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(pointerRef.current, camera);
    const point = new THREE.Vector3();
    return raycasterRef.current.ray.intersectPlane(groundPlaneRef.current, point) ? point : null;
  };

  const clearMarquee = () => {
    marqueeStartRef.current = null;
    setMarqueeDraft(null);
  };

  const updateMarqueeFromClient = (clientX, clientY) => {
    const state = marqueeStartRef.current;
    if (!state) return;
    const point = getGroundPointFromClient(clientX, clientY);
    if (!point) return;
    const current = { x: point.x, z: point.z };
    const distance = Math.hypot(current.x - state.start.x, current.z - state.start.z);
    state.current = current;
    state.moved = state.moved || distance > 0.18;
    setMarqueeDraft({ current, start: state.start });
  };

  const commitMarqueeFromClient = (clientX, clientY, fallbackPoint = null) => {
    const state = marqueeStartRef.current;
    if (!state) return;
    const point = getGroundPointFromClient(clientX, clientY) ?? fallbackPoint;
    const current = point ? { x: point.x, z: point.z } : state.current;
    const bounds = getMarqueeBounds(state.start, current);
    const width = bounds ? bounds.maxX - bounds.minX : 0;
    const depth = bounds ? bounds.maxZ - bounds.minZ : 0;
    if (state.moved && width > 0.15 && depth > 0.15) {
      onGroundMarqueeSelect?.(bounds, { additive: state.additive });
    } else if (point) {
      onGroundPointerDown?.(point);
    }
    clearMarquee();
  };

  const installMarqueeWindowListeners = () => {
    const handlePointerMove = (event) => updateMarqueeFromClient(event.clientX, event.clientY);
    const handlePointerUp = (event) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      commitMarqueeFromClient(event.clientX, event.clientY);
    };
    const handlePointerCancel = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      clearMarquee();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  };

  return (
    <group>
      {planMode ? null : (
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[EDITOR_GRID.size, EDITOR_GRID.size]} />
          <meshStandardMaterial color="#eef2ec" roughness={0.88} metalness={0.02} />
        </mesh>
      )}

      <GroundGrid floorBaseY={activeFloorBaseY} planMode={planMode} visible={gridVisible} />
      {planMode ? null : <AxisLines />}

      {planMode ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
          <planeGeometry args={[EDITOR_GRID.parcelWidth, EDITOR_GRID.parcelDepth]} />
          <meshStandardMaterial
            color="#d8eee7"
            roughness={0.82}
            metalness={0}
            transparent
            opacity={0.48}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {planMode ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
          <planeGeometry args={[EDITOR_GRID.parcelWidth - EDITOR_GRID.setback * 2, EDITOR_GRID.parcelDepth - EDITOR_GRID.setback * 2]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.86}
            metalness={0}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {planMode ? null : (
        <>
          <LineSegments color="#0a7e73" opacity={0.95} positions={parcelBoundary} />
          <LineSegments color="#4aa79b" opacity={0.62} positions={parcelMeterBoxes} />
          <LineSegments color="#4aa79b" opacity={0.34} positions={parcelSubdivisionDashes} />
          <LineSegments color="#d2694f" opacity={0.94} positions={buildable} />
        </>
      )}
      <ActiveFloorPlanOverlay floorBaseY={activeFloorBaseY} visible={planMode && gridVisible} />
      <PlanRuler floorBaseY={activeFloorBaseY} visible={planMode && gridVisible} />
      <MarqueeSelectionPreview draft={marqueeDraft} floorBaseY={activeFloorBaseY} />

      {planMode ? null : (
        <mesh position={[0, 0.075, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.05, 32]} />
          <meshStandardMaterial color="#263c36" roughness={0.55} />
        </mesh>
      )}

      <mesh
        position={[0, activeFloorBaseY + 0.09, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (marqueeEnabled && planMode) {
            const source = event.nativeEvent ?? event;
            const startPoint = getGroundPointFromClient(source.clientX, source.clientY) ?? event.point;
            const start = {
              additive: Boolean(source.ctrlKey || source.metaKey),
              current: { x: startPoint.x, z: startPoint.z },
              moved: false,
              pointerId: event.pointerId,
              start: { x: startPoint.x, z: startPoint.z }
            };
            marqueeStartRef.current = start;
            setMarqueeDraft({ current: start.current, start: start.start });
            installMarqueeWindowListeners();
            try {
              event.target?.setPointerCapture?.(event.pointerId);
            } catch {
              // Pointer capture is best-effort; dragging still works while the pointer remains over the canvas.
            }
            return;
          }
          onGroundPointerDown?.(event.point);
        }}
        onPointerMove={(event) => {
          const state = marqueeStartRef.current;
          if (!state) return;
          event.stopPropagation();
          const source = event.nativeEvent ?? event;
          updateMarqueeFromClient(source.clientX, source.clientY);
        }}
        onPointerCancel={(event) => {
          if (!marqueeStartRef.current) return;
          event.stopPropagation();
          marqueeStartRef.current = null;
          setMarqueeDraft(null);
        }}
        onPointerUp={(event) => {
          const state = marqueeStartRef.current;
          if (!state) return;
          event.stopPropagation();
          const source = event.nativeEvent ?? event;
          commitMarqueeFromClient(source.clientX, source.clientY, event.point);
          try {
            event.target?.releasePointerCapture?.(state.pointerId);
          } catch {
            // Pointer capture may already be released.
          }
        }}
      >
        <planeGeometry args={[EDITOR_GRID.size, EDITOR_GRID.size]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
