import React from "react";
import { Edges } from "@react-three/drei";
import { GlbAssetFallback } from "./GlbAssetRenderer.jsx";

export function getObjectScenePlan(object) {
  const scenePlan = object?.metadata?.scenePlan ?? object?.metadata?.sourceAssetMetadata?.scenePlan ?? object?.scenePlan;
  if (!scenePlan || !Array.isArray(scenePlan.primitives) || scenePlan.primitives.length === 0) return null;
  return scenePlan;
}

function ScenePlanPrimitive({ dragging = false, floorMode = "current", primitive, selected = false }) {
  const size = Array.isArray(primitive.size) && primitive.size.length >= 3 ? primitive.size : [1, 1, 1];
  const position = Array.isArray(primitive.position) && primitive.position.length >= 3 ? primitive.position : [0, 0, 0];
  const rotation = Array.isArray(primitive.rotation) && primitive.rotation.length >= 3 ? primitive.rotation : [0, 0, 0];
  const isGlass = /glass|glazing/i.test([primitive.kind, primitive.material, primitive.role].filter(Boolean).join(" "));
  const opacityBase = isGlass ? 0.48 : 1;
  const opacity = floorMode === "current" ? opacityBase : floorMode === "below" ? Math.min(opacityBase, 0.46) : Math.min(opacityBase, 0.22);
  const color = dragging ? "#f6c879" : selected ? primitive.color ?? "#f0b45f" : primitive.color ?? "#9fb8b0";
  const isCylinder = primitive.type === "cylinder" || /column|shaft/i.test(primitive.kind ?? "");
  const radius = Math.max(0.03, Math.max(size[0] ?? 0.2, size[2] ?? 0.2) / 2);
  const height = Math.max(0.04, size[1] ?? 1);

  return (
    <mesh castShadow position={position} receiveShadow rotation={rotation}>
      {isCylinder ? (
        <cylinderGeometry args={[radius, radius, height, 24]} />
      ) : (
        <boxGeometry args={size} />
      )}
      <meshStandardMaterial
        color={color}
        metalness={isGlass ? 0.05 : 0.02}
        opacity={opacity}
        roughness={isGlass ? 0.16 : 0.66}
        transparent={opacity < 1}
      />
      {selected || dragging ? <Edges color={dragging ? "#6c4a16" : "#1b2f2a"} lineWidth={1.5} /> : null}
    </mesh>
  );
}

export function ScenePlanAssetRenderer({ dragging = false, floorMode = "current", object, selected = false }) {
  const scenePlan = getObjectScenePlan(object);
  if (!scenePlan) return <GlbAssetFallback dragging={dragging} floorMode={floorMode} object={object} selected={selected} />;

  return (
    <group>
      {scenePlan.primitives.map((primitive, index) => (
        <ScenePlanPrimitive
          dragging={dragging}
          floorMode={floorMode}
          key={primitive.id ?? `${primitive.kind ?? "primitive"}-${index}`}
          primitive={primitive}
          selected={selected}
        />
      ))}
      {selected || dragging ? (
        <mesh>
          <boxGeometry args={object.size ?? scenePlan.bounds?.size ?? [1, 1, 1]} />
          <meshBasicMaterial color={dragging ? "#f6c879" : "#f0b45f"} opacity={0.06} transparent />
          <Edges color={dragging ? "#6c4a16" : "#1b2f2a"} lineWidth={2} />
        </mesh>
      ) : null}
    </group>
  );
}
