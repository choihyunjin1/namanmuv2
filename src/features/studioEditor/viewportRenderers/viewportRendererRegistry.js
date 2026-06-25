export const VIEWPORT_RENDERER_TYPES = {
  GLB: "glb",
  PRIMITIVE: "primitive",
  ROOF_ACCESSORY: "roof-accessory",
  ROOM: "room",
  SCENE_PLAN: "scene-plan",
  STAIR: "stair",
  STAIR_PLAN: "stair-plan",
  STRUCTURAL_WALL: "structural-wall"
};

export function getViewportRendererType(object, options = {}) {
  const {
    hasScenePlan = false,
    planMode = false,
    structuralWall = false
  } = options;

  if (object?.type === "room") return VIEWPORT_RENDERER_TYPES.ROOM;
  if (structuralWall) return VIEWPORT_RENDERER_TYPES.STRUCTURAL_WALL;
  if (object?.placementMode === "roof-accessory") return VIEWPORT_RENDERER_TYPES.ROOF_ACCESSORY;

  if (object?.placementMode === "floor-stair" || object?.shape === "stairs" || object?.shape === "ladder") {
    return planMode ? VIEWPORT_RENDERER_TYPES.STAIR_PLAN : VIEWPORT_RENDERER_TYPES.STAIR;
  }

  if (hasScenePlan && !planMode) return VIEWPORT_RENDERER_TYPES.SCENE_PLAN;
  if (object?.modelUrl && !planMode) return VIEWPORT_RENDERER_TYPES.GLB;
  return VIEWPORT_RENDERER_TYPES.PRIMITIVE;
}
