import React, { useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { AssetGeometry } from "./PrimitiveAssetRenderer.jsx";

function createRenderableGlbScene(sourceScene) {
  const scene = sourceScene.clone(true);
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return scene;
}

function getNormalizedGlbTransform(scene, size) {
  const box = new THREE.Box3().setFromObject(scene);
  const sourceSize = box.getSize(new THREE.Vector3());
  const sourceCenter = box.getCenter(new THREE.Vector3());
  const targetSize = new THREE.Vector3(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
  const scaleCandidates = [
    targetSize.x / Math.max(sourceSize.x, 0.001),
    targetSize.y / Math.max(sourceSize.y, 0.001),
    targetSize.z / Math.max(sourceSize.z, 0.001)
  ].filter((value) => Number.isFinite(value) && value > 0);
  const scale = Math.min(...scaleCandidates, 1);
  const offset = sourceCenter.multiplyScalar(-scale);
  return {
    offset: [offset.x, offset.y, offset.z],
    scale
  };
}

export function GlbAssetFallback({ dragging, floorMode, object, selected }) {
  const isBelow = floorMode === "below";
  return (
    <mesh castShadow receiveShadow>
      <AssetGeometry object={object} />
      <meshStandardMaterial
        color={dragging ? "#f6c879" : selected ? "#f0b45f" : "#9fb8b0"}
        metalness={0.02}
        opacity={floorMode === "current" ? 0.42 : isBelow ? 0.28 : 0.18}
        roughness={0.72}
        transparent
      />
      <Edges color={selected || dragging ? "#1b2f2a" : "#42615a"} lineWidth={selected || dragging ? 2 : 1} />
    </mesh>
  );
}

function GlbAssetBody({ dragging, floorMode, object, selected }) {
  const size = object.size ?? [1, 1, 1];
  const gltf = useGLTF(object.modelUrl);
  const { offset, scale, scene } = useMemo(() => {
    const renderableScene = createRenderableGlbScene(gltf.scene);
    return {
      scene: renderableScene,
      ...getNormalizedGlbTransform(renderableScene, size)
    };
  }, [gltf.scene, size]);
  const opacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.48 : 0.22;

  return (
    <group>
      <primitive object={scene} position={offset} scale={scale} />
      {floorMode !== "current" ? (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#d5ded8" opacity={0.08} transparent />
        </mesh>
      ) : null}
      {selected || dragging ? (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial color={dragging ? "#f6c879" : "#f0b45f"} opacity={0.08} transparent />
          <Edges color={dragging ? "#6c4a16" : "#1b2f2a"} lineWidth={2} />
        </mesh>
      ) : null}
      {opacity < 1 ? (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial color="#d5ded8" opacity={1 - opacity} transparent />
        </mesh>
      ) : null}
    </group>
  );
}

export function GlbAssetRenderer({ dragging, floorMode, object, selected }) {
  return (
    <React.Suspense fallback={<GlbAssetFallback dragging={dragging} floorMode={floorMode} object={object} selected={selected} />}>
      <GlbAssetBody dragging={dragging} floorMode={floorMode} object={object} selected={selected} />
    </React.Suspense>
  );
}
