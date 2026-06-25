import { useState } from "react";

export function useStudioEditorState() {
  const [activeWorkflowMode, setActiveWorkflowMode] = useState("build");
  const [activeTool, setActiveTool] = useState("select");
  const [activeCategoryId, setActiveCategoryId] = useState("roof");
  const [wallViewMode, setWallViewMode] = useState("cutaway");
  const [cameraView, setCameraView] = useState("orbit");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridVisible, setGridVisible] = useState(true);
  const [activeFloor, setActiveFloor] = useState(1);

  return {
    activeCategoryId,
    activeFloor,
    activeTool,
    activeWorkflowMode,
    cameraView,
    gridVisible,
    setActiveCategoryId,
    setActiveFloor,
    setActiveTool,
    setActiveWorkflowMode,
    setCameraView,
    setGridVisible,
    setSnapEnabled,
    setWallViewMode,
    snapEnabled,
    wallViewMode
  };
}
