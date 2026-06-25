import React, { useMemo } from "react";
import { Edges } from "@react-three/drei";
import { createGableGeometry } from "./PrimitiveAssetRenderer.jsx";

export function RoofAccessoryRenderer({ dragging = false, floorMode = "current", object, selected = false }) {
  const [width = 1, height = 0.2, depth = 1] = object.size ?? [1, 0.2, 1];
  const kind = object.metadata?.accessoryKind ?? "pattern";
  const roofShape = object.metadata?.roofShape ?? "slab";
  const color = dragging ? "#f6c879" : selected ? "#f0b45f" : object.color ?? "#6f8791";
  const opacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.58 : 0.28;
  const edgeColor = selected || dragging ? "#1b2f2a" : "#4a554f";
  const decorGeometry = useMemo(() => createGableGeometry([width, height, depth], 0), [depth, height, width]);
  const materialProps = {
    color,
    metalness: 0.04,
    opacity,
    roughness: 0.62,
    transparent: floorMode !== "current"
  };
  const roofSkew = roofShape === "shed" ? 0.6 : roofShape === "hip" ? -0.32 : 0;
  const patternGeometry = useMemo(() => createGableGeometry([width, height, depth], roofSkew), [depth, height, roofSkew, width]);

  if (kind === "trim") {
    const beamHeight = Math.min(height, 0.16);
    const beamDepth = 0.12;
    const sideLength = Math.max(depth, beamDepth);
    const parts = [
      { key: "front", position: [0, 0, depth / 2], size: [width, beamHeight, beamDepth] },
      { key: "back", position: [0, 0, -depth / 2], size: [width, beamHeight, beamDepth] },
      { key: "left", position: [-width / 2, 0, 0], size: [beamDepth, beamHeight, sideLength] },
      { key: "right", position: [width / 2, 0, 0], size: [beamDepth, beamHeight, sideLength] }
    ];

    return (
      <group>
        {parts.map((part) => (
          <mesh castShadow key={part.key} position={part.position} receiveShadow>
            <boxGeometry args={part.size} />
            <meshStandardMaterial {...materialProps} />
            <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === "decor") {
    return (
      <mesh castShadow receiveShadow>
        <primitive attach="geometry" object={decorGeometry} />
        <meshStandardMaterial {...materialProps} />
        <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
      </mesh>
    );
  }

  const stripeCount = Math.max(3, Math.floor(depth / 0.38));
  if (roofShape !== "slab") {
    return (
      <mesh castShadow receiveShadow>
        <primitive attach="geometry" object={patternGeometry} />
        <meshStandardMaterial {...materialProps} />
        <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
      </mesh>
    );
  }

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial {...materialProps} />
        <Edges color={edgeColor} lineWidth={selected || dragging ? 2 : 1} />
      </mesh>
      {Array.from({ length: stripeCount }).map((_, index) => {
        const z = -depth / 2 + ((index + 1) * depth) / (stripeCount + 1);
        return (
          <mesh key={`roof-pattern-stripe-${index}`} position={[0, height / 2 + 0.012, z]}>
            <boxGeometry args={[width * 0.94, 0.018, 0.035]} />
            <meshStandardMaterial color="#dbe4df" opacity={0.38} transparent />
          </mesh>
        );
      })}
    </group>
  );
}
