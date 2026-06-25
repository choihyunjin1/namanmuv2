const PASSIVE_OBJECT_TOOLS = new Set(["select", "move"]);

export function getEditorInteractionMode({
  activeRoofAsset = null,
  activeRoomAsset = null,
  activeTool = "select",
  activeWallAttachmentAsset = null,
  activeWallDrawAsset = null,
  activeWallOpeningAsset = null,
  cameraView = "orbit",
  movingAttachment = null,
  movingOpening = null
} = {}) {
  const planMode = cameraView === "top";
  const drawingRoom = Boolean(activeRoomAsset);
  const drawingWall = Boolean(activeWallDrawAsset);
  const attachingRoof = Boolean(activeRoofAsset);
  const placingWallAttachment = Boolean(activeWallAttachmentAsset || movingAttachment);
  const placingWallOpening = Boolean(activeWallOpeningAsset || movingOpening);
  const passiveObjectTool = PASSIVE_OBJECT_TOOLS.has(activeTool);
  const hasHostedTool = attachingRoof || drawingRoom || drawingWall || placingWallAttachment || placingWallOpening;

  const key = drawingRoom
    ? "draw-room"
    : drawingWall
      ? "draw-wall"
      : placingWallOpening
        ? movingOpening ? "move-wall-opening" : "place-wall-opening"
        : placingWallAttachment
          ? movingAttachment ? "move-wall-attachment" : "place-wall-attachment"
          : attachingRoof
            ? "attach-roof"
            : activeTool;

  return {
    canMarqueeSelect: planMode && passiveObjectTool && !hasHostedTool,
    drawingRoom,
    drawingWall,
    groundDrawToolActive: drawingRoom || drawingWall,
    hasHostedTool,
    key,
    passiveObjectTool,
    planMode,
    viewportControlsBlockedByTool: hasHostedTool
  };
}
