import {
  Copy,
  Cuboid,
  Eraser,
  Grid3X3,
  Hand,
  Magnet,
  MousePointer2,
  Move3D,
  PanelRightClose,
  Redo2,
  Rotate3D,
  Scale3D,
  Undo2
} from "lucide-react";

export const EDITOR_GRID = {
  size: 24,
  minorStep: 1,
  subdivisionStep: 0.5,
  snapStep: 0.5,
  majorStep: 4,
  parcelWidth: 12,
  parcelDepth: 8,
  setback: 1
};

export const EDITOR_FLOORS = {
  min: 1,
  floorHeight: 2.7
};

export const EDITOR_TOOLS = [
  { id: "select", label: "선택", icon: MousePointer2 },
  { id: "duplicate", label: "복사", icon: Copy },
  { id: "pan", label: "이동 보기", icon: Hand },
  { id: "move", label: "이동", icon: Move3D },
  { id: "rotate", label: "회전", icon: Rotate3D },
  { id: "scale", label: "스케일", icon: Scale3D },
  { id: "undo", label: "실행취소", icon: Undo2 },
  { id: "redo", label: "재실행", icon: Redo2 },
  { id: "snap", label: "스냅", icon: Magnet },
  { id: "erase", label: "지우개", icon: Eraser }
];

export const VIEW_OPTIONS = [
  { id: "grid", label: "그리드", icon: Grid3X3 },
  { id: "snap", label: "0.5m 스냅", icon: Magnet }
];

export const CAMERA_VIEW_OPTIONS = [
  { id: "orbit", label: "3D", icon: Cuboid },
  { id: "top", label: "평면", icon: Grid3X3 },
  { id: "front", label: "정면", icon: PanelRightClose },
  { id: "side", label: "측면", icon: Move3D }
];

export function getBuildableFootprint() {
  return {
    width: EDITOR_GRID.parcelWidth - EDITOR_GRID.setback * 2,
    depth: EDITOR_GRID.parcelDepth - EDITOR_GRID.setback * 2
  };
}

export function getFloorBaseY(floor) {
  return Number(((floor - 1) * EDITOR_FLOORS.floorHeight).toFixed(2));
}
