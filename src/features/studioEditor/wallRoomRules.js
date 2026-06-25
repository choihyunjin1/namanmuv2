import { getWallSegment, isStructuralWallObject } from "./wallJoinRules.js";

export const WALL_ROOM_TOLERANCE = 0.01;
export const ROOM_WALL_ORDER = ["north", "south", "west", "east"];

function closeEnough(first, second, tolerance = WALL_ROOM_TOLERANCE) {
  return Math.abs(first - second) <= tolerance;
}

function sameLayer(first, second, tolerance = WALL_ROOM_TOLERANCE) {
  return (
    first.floor === second.floor &&
    closeEnough(first.y, second.y, tolerance) &&
    closeEnough(first.height, second.height, tolerance) &&
    closeEnough(first.thickness, second.thickness, tolerance)
  );
}

function covers(segment, min, max, tolerance = WALL_ROOM_TOLERANCE) {
  return segment.minU <= min + tolerance && segment.maxU >= max - tolerance;
}

function hasExistingRoom(objects, candidate, tolerance = WALL_ROOM_TOLERANCE) {
  return objects.some((object) => {
    if (object.type !== "room") return false;
    const [x = 0, y = 0, z = 0] = object.position ?? [0, 0, 0];
    const [width = 0, height = 0, depth = 0] = object.size ?? [0, 0, 0];
    const [candidateX, candidateY, candidateZ] = candidate.position;
    const [candidateWidth, candidateHeight, candidateDepth] = candidate.size;
    const floor = object.room?.floor ?? object.floor ?? 1;

    return (
      floor === candidate.floor &&
      closeEnough(x, candidateX, tolerance) &&
      closeEnough(y, candidateY, tolerance) &&
      closeEnough(z, candidateZ, tolerance) &&
      closeEnough(width, candidateWidth, tolerance) &&
      closeEnough(height, candidateHeight, tolerance) &&
      closeEnough(depth, candidateDepth, tolerance)
    );
  });
}

export function findRectangularWallRoom(objects, options = {}) {
  const tolerance = options.tolerance ?? WALL_ROOM_TOLERANCE;
  const minRoomSize = options.minRoomSize ?? 1;
  const wallRecords = objects
    .filter(isStructuralWallObject)
    .map((object) => ({ object, segment: getWallSegment(object) }));
  const horizontalWalls = wallRecords.filter((record) => record.segment.orientation === "x");
  const verticalWalls = wallRecords.filter((record) => record.segment.orientation === "z");

  for (let firstHorizontalIndex = 0; firstHorizontalIndex < horizontalWalls.length; firstHorizontalIndex += 1) {
    for (let secondHorizontalIndex = firstHorizontalIndex + 1; secondHorizontalIndex < horizontalWalls.length; secondHorizontalIndex += 1) {
      const firstHorizontal = horizontalWalls[firstHorizontalIndex];
      const secondHorizontal = horizontalWalls[secondHorizontalIndex];
      if (!sameLayer(firstHorizontal.segment, secondHorizontal.segment, tolerance)) continue;

      const zMin = Math.min(firstHorizontal.segment.cross, secondHorizontal.segment.cross);
      const zMax = Math.max(firstHorizontal.segment.cross, secondHorizontal.segment.cross);
      if (zMax - zMin < minRoomSize - tolerance) continue;

      for (let firstVerticalIndex = 0; firstVerticalIndex < verticalWalls.length; firstVerticalIndex += 1) {
        for (let secondVerticalIndex = firstVerticalIndex + 1; secondVerticalIndex < verticalWalls.length; secondVerticalIndex += 1) {
          const firstVertical = verticalWalls[firstVerticalIndex];
          const secondVertical = verticalWalls[secondVerticalIndex];
          if (!sameLayer(firstHorizontal.segment, firstVertical.segment, tolerance)) continue;
          if (!sameLayer(firstHorizontal.segment, secondVertical.segment, tolerance)) continue;

          const xMin = Math.min(firstVertical.segment.cross, secondVertical.segment.cross);
          const xMax = Math.max(firstVertical.segment.cross, secondVertical.segment.cross);
          if (xMax - xMin < minRoomSize - tolerance) continue;

          const horizontalCoverage =
            covers(firstHorizontal.segment, xMin, xMax, tolerance) &&
            covers(secondHorizontal.segment, xMin, xMax, tolerance);
          const verticalCoverage =
            covers(firstVertical.segment, zMin, zMax, tolerance) &&
            covers(secondVertical.segment, zMin, zMax, tolerance);
          if (!horizontalCoverage || !verticalCoverage) continue;

          const floorBaseY = Number((firstHorizontal.segment.y - firstHorizontal.segment.height / 2).toFixed(2));
          const candidate = {
            floor: firstHorizontal.segment.floor,
            position: [
              Number(((xMin + xMax) / 2).toFixed(2)),
              floorBaseY,
              Number(((zMin + zMax) / 2).toFixed(2))
            ],
            size: [
              Number((xMax - xMin).toFixed(2)),
              firstHorizontal.segment.height,
              Number((zMax - zMin).toFixed(2))
            ]
          };
          if (hasExistingRoom(objects, candidate, tolerance)) continue;

          return {
            ...candidate,
            sourceWallIds: [
              firstHorizontal.object.id,
              secondHorizontal.object.id,
              firstVertical.object.id,
              secondVertical.object.id
            ],
            wallThickness: firstHorizontal.segment.thickness
          };
        }
      }
    }
  }

  return null;
}

export function decomposeRoomToWalls(room, options = {}) {
  if (!room || room.type !== "room") return [];

  const omitWall = options.omitWall ?? null;
  const idFactory = options.idFactory ?? ((wall) => `${room.id}-${wall}`);
  const [roomX = 0, roomBaseY = 0, roomZ = 0] = room.position ?? [0, 0, 0];
  const [roomWidth = 1, roomHeight = 2.7, roomDepth = 1] = room.size ?? [1, 2.7, 1];
  const wallThickness = room.room?.wallThickness ?? 0.16;
  const floor = room.room?.floor ?? room.floor ?? 1;
  const wallCenterY = Number((roomBaseY + roomHeight / 2).toFixed(2));
  const wallDefinitions = {
    north: {
      label: "북측 벽",
      position: [roomX, wallCenterY, Number((roomZ - roomDepth / 2 + wallThickness / 2).toFixed(2))],
      rotation: [0, 0, 0],
      size: [roomWidth, roomHeight, wallThickness],
      wallOrientation: "x"
    },
    south: {
      label: "남측 벽",
      position: [roomX, wallCenterY, Number((roomZ + roomDepth / 2 - wallThickness / 2).toFixed(2))],
      rotation: [0, 0, 0],
      size: [roomWidth, roomHeight, wallThickness],
      wallOrientation: "x"
    },
    west: {
      label: "서측 벽",
      position: [Number((roomX - roomWidth / 2 + wallThickness / 2).toFixed(2)), wallCenterY, roomZ],
      rotation: [0, Math.PI / 2, 0],
      size: [roomDepth, roomHeight, wallThickness],
      wallOrientation: "z"
    },
    east: {
      label: "동측 벽",
      position: [Number((roomX + roomWidth / 2 - wallThickness / 2).toFixed(2)), wallCenterY, roomZ],
      rotation: [0, Math.PI / 2, 0],
      size: [roomDepth, roomHeight, wallThickness],
      wallOrientation: "z"
    }
  };

  return ROOM_WALL_ORDER
    .filter((wall) => wall !== omitWall)
    .map((wall, index) => {
      const definition = wallDefinitions[wall];
      const id = idFactory(wall, index);
      return {
        id,
        type: "catalog-asset",
        assetId: "test-wall-line",
        categoryId: "wall-tool",
        name: `${room.name ?? "방"} ${definition.label}`,
        color: room.color ?? "#7fb6a8",
        floor,
        position: definition.position,
        placementMode: "draw-wall",
        rotation: definition.rotation,
        shape: "box",
        size: definition.size,
        supportKind: "wall",
        wallOrientation: definition.wallOrientation,
        wallAttachments: (room.room?.attachments ?? [])
          .filter((attachment) => attachment.wall === wall)
          .map((attachment) => ({
            ...attachment,
            wall: "body"
          })),
        wallOpenings: (room.room?.openings ?? [])
          .filter((opening) => opening.wall === wall)
          .map((opening) => ({
            ...opening,
            wall: "body"
          })),
        metadata: {
          floorNumber: floor,
          length: definition.size[0],
          placementSource: "room-wall-decompose",
          source: "studio-editor-wall-edit",
          sourceRoomId: room.id,
          sourceRoomWall: wall,
          supportKind: "wall",
          wallOrientation: definition.wallOrientation
        }
      };
    });
}
