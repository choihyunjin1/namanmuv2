import React, { useMemo } from "react";
import { Edges } from "@react-three/drei";
import * as THREE from "three";

export function createGableGeometry([width = 1, height = 1, depth = 1], skew = 0) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const ridgeX = skew * halfWidth;
  const vertices = new Float32Array([
    -halfWidth, -halfHeight, halfDepth,
    halfWidth, -halfHeight, halfDepth,
    ridgeX, halfHeight, halfDepth,
    -halfWidth, -halfHeight, -halfDepth,
    halfWidth, -halfHeight, -halfDepth,
    ridgeX, halfHeight, -halfDepth
  ]);
  const indices = [
    0, 1, 2,
    5, 4, 3,
    3, 4, 1, 3, 1, 0,
    0, 2, 5, 0, 5, 3,
    2, 1, 4, 2, 4, 5
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function AssetGeometry({ object }) {
  const size = object.size ?? [1, 1, 1];
  const roofGeometry = useMemo(() => {
    if (object.shape === "gable") return createGableGeometry(size);
    if (object.shape === "hip") return createGableGeometry(size, -0.32);
    if (object.shape === "shed") return createGableGeometry(size, 0.6);
    return null;
  }, [object.shape, size]);

  if (roofGeometry) return <primitive attach="geometry" object={roofGeometry} />;
  return <boxGeometry args={size} />;
}

export function PrimitiveAssetRenderer({
  dragging = false,
  floorMode = "current",
  isJoinedWall = false,
  object,
  selected = false
}) {
  return (
    <mesh castShadow receiveShadow>
      <AssetGeometry object={object} />
      <meshStandardMaterial
        color={dragging ? "#f6c879" : selected ? "#f0b45f" : isJoinedWall ? "#6cbcaf" : object.color ?? "#7fb6a8"}
        metalness={0.02}
        opacity={floorMode === "current" ? 1 : floorMode === "below" ? 0.58 : 0.28}
        roughness={0.68}
        transparent={floorMode !== "current"}
      />
      <Edges color={selected || dragging ? "#1b2f2a" : isJoinedWall ? "#0f6f64" : "#315b52"} lineWidth={selected || dragging || isJoinedWall ? 2 : 1} />
    </mesh>
  );
}
