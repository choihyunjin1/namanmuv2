import assert from "node:assert/strict";
import {
  VIEWPORT_RENDERER_TYPES,
  getViewportRendererType
} from "../src/features/studioEditor/viewportRenderers/viewportRendererRegistry.js";

assert.equal(
  getViewportRendererType({ modelUrl: "/assets/models/room.glb", type: "room" }, { hasScenePlan: true }),
  VIEWPORT_RENDERER_TYPES.ROOM,
  "room renderer should win over GLB and scenePlan"
);

assert.equal(
  getViewportRendererType({ modelUrl: "/assets/models/wall.glb" }, { structuralWall: true }),
  VIEWPORT_RENDERER_TYPES.STRUCTURAL_WALL,
  "structural wall renderer should win over GLB"
);

assert.equal(
  getViewportRendererType({ placementMode: "roof-accessory", shape: "stairs" }),
  VIEWPORT_RENDERER_TYPES.ROOF_ACCESSORY,
  "roof accessory renderer should win over stair shape"
);

assert.equal(
  getViewportRendererType({ placementMode: "floor-stair" }, { planMode: true }),
  VIEWPORT_RENDERER_TYPES.STAIR_PLAN,
  "stair objects should use plan footprint renderer in plan mode"
);

assert.equal(
  getViewportRendererType({ shape: "ladder" }),
  VIEWPORT_RENDERER_TYPES.STAIR,
  "ladder shape should use stair/ladder renderer"
);

assert.equal(
  getViewportRendererType({ modelUrl: "/assets/models/generated.glb" }, { hasScenePlan: true }),
  VIEWPORT_RENDERER_TYPES.SCENE_PLAN,
  "scenePlan renderer should win over GLB in 3D mode"
);

assert.equal(
  getViewportRendererType({ modelUrl: "/assets/models/generated.glb" }, { hasScenePlan: true, planMode: true }),
  VIEWPORT_RENDERER_TYPES.PRIMITIVE,
  "plan mode should skip scenePlan and GLB renderers"
);

assert.equal(
  getViewportRendererType({ modelUrl: "/assets/models/component.glb" }),
  VIEWPORT_RENDERER_TYPES.GLB,
  "GLB renderer should be used for modelUrl objects"
);

assert.equal(
  getViewportRendererType({ shape: "box" }),
  VIEWPORT_RENDERER_TYPES.PRIMITIVE,
  "plain assets should fall back to primitive renderer"
);

console.log("viewport renderer registry OK");
