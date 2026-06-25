import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBatchedBoundsTree,
  computeBoundsTree,
  disposeBatchedBoundsTree,
  disposeBoundsTree
} from "three-mesh-bvh";

const INSTALL_FLAG = Symbol.for("ploton.studioEditor.raycastAccelerationInstalled");

export function installStudioEditorRaycastAcceleration() {
  if (THREE.Mesh.prototype[INSTALL_FLAG]) {
    return { installed: false, reason: "already-installed" };
  }

  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  THREE.Mesh.prototype[INSTALL_FLAG] = true;

  if (THREE.BatchedMesh) {
    THREE.BatchedMesh.prototype.computeBoundsTree = computeBatchedBoundsTree;
    THREE.BatchedMesh.prototype.disposeBoundsTree = disposeBatchedBoundsTree;
    THREE.BatchedMesh.prototype.raycast = acceleratedRaycast;
  }

  return { installed: true };
}

export function buildBoundsTreesForScene(scene) {
  let builtCount = 0;
  let skippedCount = 0;

  scene.traverse((object) => {
    if (!object.isMesh) return;

    const geometry = object.geometry;
    if (!geometry?.isBufferGeometry || !geometry.attributes?.position) {
      skippedCount += 1;
      return;
    }

    if (geometry.boundsTree) return;

    try {
      geometry.computeBoundsTree?.();
      if (geometry.boundsTree) builtCount += 1;
    } catch {
      skippedCount += 1;
    }
  });

  return { builtCount, skippedCount };
}
