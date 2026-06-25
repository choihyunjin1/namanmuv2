import React, { useMemo } from "react";
import { Edges, Html } from "@react-three/drei";
import * as THREE from "three";

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStairSpec(object) {
  const [width = 1.2, height = 1.8, depth = 2.8] = object.size ?? [1.2, 1.8, 2.8];
  const stairMetadata = object.metadata?.stair ?? {};
  const normalized = stairMetadata.normalized ?? {};
  const stepMetadata = stairMetadata.stepMetadata ?? {};
  const rawStepCount = stepMetadata.stepCount ?? normalized.stepCount ?? object.stepCount ?? object.metadata?.stepCount ?? 8;
  const stepCount = Math.max(2, Math.min(24, Math.round(rawStepCount)));
  const stairRise = Math.max(0.08, object.stairRise ?? object.metadata?.stairRise ?? normalized.stairRise ?? normalized.riserHeight ?? height / stepCount);
  const stairType = stairMetadata.layout ?? normalized.layout ?? object.stairType ?? object.metadata?.stairType ?? "straight";
  const stairKind = stairMetadata.kind ?? normalized.kind ?? (object.shape === "ladder" || stairType === "ladder" ? "ladder" : "stair");
  const landingDepth = stairKind === "ladder"
    ? 0
    : Math.max(0, stairMetadata.landingDepth ?? normalized.landingDepth ?? object.metadata?.landingDepth ?? object.landingDepth ?? 0);
  const availableRunDepth = Math.max(0.4, depth - landingDepth);
  const stairRun = Math.max(0.08, object.stairRun ?? object.metadata?.stairRun ?? normalized.stairRun ?? normalized.treadDepth ?? availableRunDepth / stepCount);
  const actualHeight = Math.max(height, stairRise * stepCount);
  const actualDepth = Math.max(depth, stairRun * stepCount + landingDepth);
  return {
    actualDepth,
    actualHeight,
    landingDepth,
    stairRun,
    stairRise,
    stepCount,
    stairKind,
    stairType,
    railingAttachments: Array.isArray(stairMetadata.railingAttachments) ? stairMetadata.railingAttachments : [],
    width
  };
}

function getFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getStairPlanSpec(object) {
  const fallback = getStairSpec(object);
  const stairMetadata = object.metadata?.stair ?? {};
  const normalized = stairMetadata.normalized ?? {};
  const stepMetadata = stairMetadata.stepMetadata ?? {};
  const footprint = stairMetadata.footprint ?? {};
  const footprintAabb = footprint.aabb ?? {};
  const [sizeWidth, sizeHeight, sizeDepth] = object.size ?? normalized.size ?? footprint.size ?? [];
  const width = Math.max(0.2, getFiniteNumber(sizeWidth, normalized.width ?? footprint.width ?? footprintAabb.width ?? fallback.width));
  const height = Math.max(0.1, getFiniteNumber(sizeHeight, normalized.height ?? footprint.height ?? fallback.actualHeight));
  const depth = Math.max(0.2, getFiniteNumber(sizeDepth, footprintAabb.depth ?? footprint.length ?? normalized.length ?? fallback.actualDepth));
  const stairType = stairMetadata.layout ?? normalized.layout ?? object.stairType ?? object.metadata?.stairType ?? fallback.stairType;
  const stairKind = stairMetadata.kind ?? normalized.kind ?? fallback.stairKind;
  const isLadder = stairKind === "ladder" || stairType === "ladder" || object.shape === "ladder";
  const rawStepCount = stepMetadata.stepCount ?? normalized.stepCount ?? object.stepCount ?? object.metadata?.stepCount ?? fallback.stepCount;
  const minStepCount = isLadder ? 4 : 2;
  const stepCount = Math.max(minStepCount, Math.min(24, Math.round(getFiniteNumber(rawStepCount, fallback.stepCount))));
  const landingDepth = isLadder
    ? 0
    : clampNumber(getFiniteNumber(stairMetadata.landingDepth ?? normalized.landingDepth ?? object.metadata?.landingDepth ?? object.landingDepth ?? fallback.landingDepth, 0), 0, depth * 0.72);

  return {
    depth,
    height,
    isLadder,
    landingDepth,
    stepCount,
    width
  };
}

function createStairPlanArrowPositions(depth, landingDepth) {
  const inset = Math.min(0.24, depth * 0.18);
  const tailZ = -depth / 2 + inset;
  const tipInset = Math.max(inset, Math.min(landingDepth * 0.42, depth * 0.36));
  const tipZ = depth / 2 - tipInset;
  if (tipZ - tailZ < 0.18) return null;

  const headSize = Math.min(0.18, Math.max(0.08, depth * 0.08));
  return new Float32Array([
    0, 0, tailZ, 0, 0, tipZ,
    0, 0, tipZ, -headSize, 0, tipZ - headSize,
    0, 0, tipZ, headSize, 0, tipZ - headSize
  ]);
}

export function StairPlanFootprint({ dragging = false, floorMode = "current", object, selected = false }) {
  const spec = getStairPlanSpec(object);
  const planY = -spec.height / 2 + 0.085;
  const selectedOrDragging = selected || dragging;
  const baseColor = dragging ? "#f6c879" : selected ? "#f0b45f" : object.color ?? "#b7bab0";
  const footprintColor = spec.isLadder ? "#68d8c4" : "#f3b64c";
  const lineColor = selectedOrDragging ? "#122922" : spec.isLadder ? "#064d45" : "#573300";
  const opacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.54 : 0.3;
  const markerOpacity = floorMode === "current" ? 0.98 : 0.48;
  const runDepth = Math.max(0.08, spec.depth - spec.landingDepth);
  const lowerZ = -spec.depth / 2;
  const markerCount = spec.isLadder
    ? spec.stepCount
    : Math.max(1, spec.landingDepth > 0 ? spec.stepCount : spec.stepCount - 1);
  const markerPositions = Array.from({ length: markerCount }, (_, index) => {
    if (spec.isLadder) return lowerZ + ((index + 1) * spec.depth) / (markerCount + 1);
    return lowerZ + ((index + 1) * runDepth) / spec.stepCount;
  });
  const arrowPositions = useMemo(
    () => (spec.isLadder ? null : createStairPlanArrowPositions(spec.depth, spec.landingDepth)),
    [spec.depth, spec.isLadder, spec.landingDepth]
  );

  return (
    <group>
      <mesh position={[0, planY, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={70}>
        <planeGeometry args={[spec.width, spec.depth]} />
        <meshBasicMaterial color={footprintColor} depthTest={false} depthWrite={false} opacity={0.78 * opacity} side={THREE.DoubleSide} transparent />
        <Edges color={lineColor} lineWidth={selectedOrDragging ? 2 : 1} />
      </mesh>
      {spec.isLadder ? (
        <>
          {[-1, 1].map((side) => (
            <mesh key={`plan-ladder-rail-${side}`} position={[side * spec.width * 0.34, planY + 0.025, 0]} renderOrder={73}>
              <boxGeometry args={[0.035, 0.025, Math.max(0.08, spec.depth * 0.82)]} />
              <meshBasicMaterial color={lineColor} depthTest={false} depthWrite={false} opacity={markerOpacity} transparent />
            </mesh>
          ))}
          {markerPositions.map((markerZ, index) => (
            <mesh key={`plan-ladder-rung-${index}`} position={[0, planY + 0.035, markerZ]} renderOrder={74}>
              <boxGeometry args={[Math.max(0.08, spec.width * 0.78), 0.032, 0.028]} />
              <meshBasicMaterial color={lineColor} depthTest={false} depthWrite={false} opacity={markerOpacity} transparent />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {markerPositions.map((markerZ, index) => (
            <mesh key={`plan-stair-tread-${index}`} position={[0, planY + 0.03, markerZ]} renderOrder={74}>
              <boxGeometry args={[Math.max(0.08, spec.width * 0.92), 0.032, 0.03]} />
              <meshBasicMaterial color={lineColor} depthTest={false} depthWrite={false} opacity={markerOpacity} transparent />
            </mesh>
          ))}
          {spec.landingDepth > 0 ? (
            <mesh position={[0, planY + 0.024, spec.depth / 2 - spec.landingDepth / 2]} renderOrder={72}>
              <boxGeometry args={[Math.max(0.08, spec.width * 0.92), 0.018, Math.max(0.08, spec.landingDepth * 0.84)]} />
              <meshBasicMaterial color={baseColor} depthTest={false} depthWrite={false} opacity={0.65 * opacity} transparent />
            </mesh>
          ) : null}
          {arrowPositions ? (
            <lineSegments position={[0, planY + 0.052, 0]} renderOrder={75}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[arrowPositions, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color={lineColor} depthTest={false} transparent opacity={markerOpacity} />
            </lineSegments>
          ) : null}
        </>
      )}
      <Html center position={[0, planY + 0.14, 0]} style={{ pointerEvents: "none" }}>
        <div className={`studio-editor-plan-label studio-editor-plan-stair-label${selectedOrDragging ? " is-selected" : ""}`}>
          {spec.isLadder ? `LADDER ${spec.stepCount}` : `STAIR ${spec.stepCount}`}
        </div>
      </Html>
    </group>
  );
}

function LadderAssetBody({ dragging = false, floorMode = "current", object, selected = false }) {
  const [width = 0.7, height = 2.5, depth = 0.35] = object.size ?? [0.7, 2.5, 0.35];
  const stepCount = Math.max(4, Math.min(16, Math.round(object.stepCount ?? object.metadata?.stepCount ?? 8)));
  const color = dragging ? "#f6c879" : selected ? "#f0b45f" : object.color ?? "#8f9a93";
  const opacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.58 : 0.28;
  const railSize = [0.08, height, 0.08];
  const rungSize = [width, 0.06, 0.08];
  const rungStart = -height / 2 + height / (stepCount + 1);

  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh castShadow key={`ladder-rail-${side}`} position={[side * width / 2, 0, 0]} receiveShadow>
          <boxGeometry args={railSize} />
          <meshStandardMaterial color={color} metalness={0.18} opacity={opacity} roughness={0.46} transparent={floorMode !== "current"} />
          <Edges color={selected || dragging ? "#1b2f2a" : "#4b5b55"} lineWidth={selected || dragging ? 2 : 1} />
        </mesh>
      ))}
      {Array.from({ length: stepCount }).map((_, index) => (
        <mesh castShadow key={`ladder-rung-${index}`} position={[0, rungStart + index * (height / (stepCount + 1)), depth * 0.18]} receiveShadow>
          <boxGeometry args={rungSize} />
          <meshStandardMaterial color={color} metalness={0.2} opacity={opacity} roughness={0.4} transparent={floorMode !== "current"} />
        </mesh>
      ))}
    </group>
  );
}

function StairRailingAttachments({ color = "#8c9591", opacity = 1, spec }) {
  const attachments = spec.railingAttachments ?? [];
  if (!attachments.length || spec.stairKind === "ladder") return null;

  const lowerZ = -spec.actualDepth / 2;
  const runDepth = Math.max(0.12, spec.stairRun * spec.stepCount);
  const segmentSpecs = {
    full: {
      centerZ: 0,
      length: Math.max(0.12, spec.actualDepth * 0.92)
    },
    landing: {
      centerZ: spec.actualDepth / 2 - Math.max(0.12, spec.landingDepth) / 2,
      length: Math.max(0.12, spec.landingDepth * 0.9)
    },
    run: {
      centerZ: lowerZ + runDepth / 2,
      length: Math.max(0.12, runDepth * 0.94)
    }
  };

  return (
    <group>
      {attachments.flatMap((attachment) => {
        const sides = attachment.side === "both" ? ["left", "right"] : [attachment.side ?? "right"];
        const segment = segmentSpecs[attachment.segment] ?? segmentSpecs.full;
        const railDepth = attachment.depth ?? 0.06;
        const railHeight = attachment.height ?? 0.85;
        const localOffset = attachment.localOffset ?? [0, 0, 0];
        const postCount = Math.max(2, Math.min(4, Math.ceil(segment.length / 1.15) + 1));
        return sides.flatMap((side) => {
          const sideSign = side === "left" ? -1 : 1;
          const x = sideSign * (spec.width / 2 + railDepth * 0.8) + localOffset[0];
          const baseY = -spec.actualHeight / 2 + localOffset[1];
          const centerZ = segment.centerZ + localOffset[2];
          const posts = Array.from({ length: postCount }, (_, index) => {
            const t = postCount === 1 ? 0.5 : index / (postCount - 1);
            return centerZ - segment.length / 2 + segment.length * t;
          });
          return [
            <mesh castShadow key={`${attachment.id}-${side}-rail`} position={[x, baseY + railHeight, centerZ]} receiveShadow>
              <boxGeometry args={[railDepth, railDepth, segment.length]} />
              <meshStandardMaterial color={color} metalness={0.08} opacity={opacity} roughness={0.52} transparent={opacity < 1} />
            </mesh>,
            ...posts.map((z, postIndex) => (
              <mesh castShadow key={`${attachment.id}-${side}-post-${postIndex}`} position={[x, baseY + railHeight / 2, z]} receiveShadow>
                <boxGeometry args={[railDepth * 0.9, railHeight, railDepth * 0.9]} />
                <meshStandardMaterial color={color} metalness={0.08} opacity={opacity} roughness={0.52} transparent={opacity < 1} />
              </mesh>
            ))
          ];
        });
      })}
    </group>
  );
}

export function StairAssetRenderer({ dragging = false, floorMode = "current", object, selected = false }) {
  const spec = getStairSpec(object);
  if (spec.stairKind === "ladder" || spec.stairType === "ladder" || object.shape === "ladder") {
    return <LadderAssetBody dragging={dragging} floorMode={floorMode} object={object} selected={selected} />;
  }

  const color = dragging ? "#f6c879" : selected ? "#f0b45f" : object.color ?? "#b7bab0";
  const opacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.58 : 0.28;
  const edgeColor = selected || dragging ? "#1b2f2a" : "#5c635d";
  const treadColor = selected || dragging ? color : "#d0d0c6";
  const stringerColor = selected || dragging ? "#8f816b" : "#8a8d82";
  const lowerZ = -spec.actualDepth / 2;
  const slopedLength = Math.hypot(spec.stairRun * spec.stepCount, spec.stairRise * spec.stepCount);
  const slopeAngle = Math.atan2(spec.stairRise * spec.stepCount, spec.stairRun * spec.stepCount);
  const stringerY = -spec.actualHeight / 2 + (spec.stairRise * spec.stepCount) / 2;
  const stringerZ = lowerZ + (spec.stairRun * spec.stepCount) / 2;

  return (
    <group>
      {Array.from({ length: spec.stepCount }).map((_, index) => {
        const y = -spec.actualHeight / 2 + spec.stairRise * index + spec.stairRise / 2;
        const z = lowerZ + spec.stairRun * index + spec.stairRun / 2;
        const stepWidth = spec.width * 0.96;
        return (
          <mesh castShadow key={`stair-step-${index}`} position={[0, y, z]} receiveShadow>
            <boxGeometry args={[stepWidth, spec.stairRise * 0.92, spec.stairRun * 0.96]} />
            <meshStandardMaterial color={treadColor} metalness={0.02} opacity={opacity} roughness={0.7} transparent={floorMode !== "current"} />
            <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
          </mesh>
        );
      })}
      {spec.landingDepth > 0 ? (
        <mesh
          castShadow
          position={[
            0,
            -spec.actualHeight / 2 + spec.stairRise * spec.stepCount - spec.stairRise / 2,
            lowerZ + spec.stairRun * spec.stepCount + spec.landingDepth / 2
          ]}
          receiveShadow
        >
          <boxGeometry args={[spec.width, spec.stairRise * 0.92, spec.landingDepth]} />
          <meshStandardMaterial color={treadColor} metalness={0.02} opacity={opacity} roughness={0.72} transparent={floorMode !== "current"} />
          <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
        </mesh>
      ) : null}
      {[-1, 1].map((side) => (
        <mesh
          castShadow
          key={`stair-stringer-${side}`}
          position={[side * spec.width / 2, stringerY - spec.stairRise * 0.18, stringerZ]}
          receiveShadow
          rotation={[slopeAngle, 0, 0]}
        >
          <boxGeometry args={[0.09, 0.16, slopedLength]} />
          <meshStandardMaterial color={stringerColor} metalness={0.04} opacity={opacity} roughness={0.58} transparent={floorMode !== "current"} />
        </mesh>
      ))}
      <StairRailingAttachments color={object.color ?? "#8c9591"} opacity={opacity} spec={spec} />
      <mesh position={[0, -spec.actualHeight / 2 + 0.025, 0]} receiveShadow>
        <boxGeometry args={[spec.width + 0.12, 0.05, spec.actualDepth]} />
        <meshStandardMaterial color="#a7aba3" metalness={0.02} opacity={floorMode === "current" ? 0.52 : 0.22} roughness={0.82} transparent />
      </mesh>
    </group>
  );
}
