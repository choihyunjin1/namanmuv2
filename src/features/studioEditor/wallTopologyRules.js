import { getWallEndpoints, getWallSegment, isStructuralWallObject } from "./wallJoinRules.js";

const DEFAULT_WALL_ENDPOINT_TOLERANCE = 0.08;
const DEFAULT_MIN_WALL_LENGTH = 0.5;

function getEndpointDistance(first, second) {
  return Math.hypot((first?.x ?? 0) - (second?.x ?? 0), (first?.z ?? 0) - (second?.z ?? 0));
}

function getNextWallPositionForCrossMove(wall, nextCross) {
  const segment = getWallSegment(wall);
  const [x = 0, y = 0, z = 0] = wall.position ?? [0, 0, 0];
  return segment.orientation === "x" ? [x, y, nextCross] : [nextCross, y, z];
}

function getWallGeometryFromEndpoints(wall, endpoints, tolerance = DEFAULT_WALL_ENDPOINT_TOLERANCE, options = {}) {
  const segment = getWallSegment(wall);
  const [first, second] = endpoints;
  const y = wall.position?.[1] ?? segment.y;
  const height = segment.height;
  const thickness = segment.thickness;

  if (segment.orientation === "x") {
    const cross = Number.isFinite(options.forceCross)
      ? options.forceCross
      : Math.abs(first.z - second.z) <= tolerance
      ? (first.z + second.z) / 2
      : segment.cross;
    const minX = Math.min(first.x, second.x);
    const maxX = Math.max(first.x, second.x);
    const length = Number((maxX - minX).toFixed(2));
    return {
      nextSegment: {
        ...segment,
        cross: Number(cross.toFixed(2)),
        maxU: Number(maxX.toFixed(2)),
        minU: Number(minX.toFixed(2)),
        width: length
      },
      position: [Number(((minX + maxX) / 2).toFixed(2)), y, Number(cross.toFixed(2))],
      rotation: [0, 0, 0],
      size: [length, height, thickness],
      wallOrientation: "x"
    };
  }

  const cross = Number.isFinite(options.forceCross)
    ? options.forceCross
    : Math.abs(first.x - second.x) <= tolerance
    ? (first.x + second.x) / 2
    : segment.cross;
  const minZ = Math.min(first.z, second.z);
  const maxZ = Math.max(first.z, second.z);
  const length = Number((maxZ - minZ).toFixed(2));
  return {
    nextSegment: {
      ...segment,
      cross: Number(cross.toFixed(2)),
      maxU: Number(maxZ.toFixed(2)),
      minU: Number(minZ.toFixed(2)),
      width: length
    },
    position: [Number(cross.toFixed(2)), y, Number(((minZ + maxZ) / 2).toFixed(2))],
    rotation: [0, Math.PI / 2, 0],
    size: [length, height, thickness],
    wallOrientation: "z"
  };
}

export function remapWallFeaturesToSegment(features = [], oldSegment, nextSegment) {
  const oldCenterU = Number(((oldSegment.minU + oldSegment.maxU) / 2).toFixed(2));
  const nextCenterU = Number(((nextSegment.minU + nextSegment.maxU) / 2).toFixed(2));
  return features.map((feature) => ({
    ...feature,
    offset: Number((oldCenterU + (feature.offset ?? 0) - nextCenterU).toFixed(2))
  }));
}

export function buildWallNormalMoveTopology({
  minLength = DEFAULT_MIN_WALL_LENGTH,
  nextCross,
  objects = [],
  tolerance = DEFAULT_WALL_ENDPOINT_TOLERANCE,
  wall
}) {
  if (!isStructuralWallObject(wall) || !Number.isFinite(nextCross)) return [];

  const selectedSegment = getWallSegment(wall);
  const selectedOldEndpoints = getWallEndpoints(wall);
  const selectedNextPosition = getNextWallPositionForCrossMove(wall, nextCross);
  const selectedNextEndpoints = selectedOldEndpoints.map((endpoint) =>
    selectedSegment.orientation === "x"
      ? { ...endpoint, z: Number(nextCross.toFixed(2)) }
      : { ...endpoint, x: Number(nextCross.toFixed(2)) }
  );

  const selectedUpdate = {
    id: wall.id,
    nextSegment: {
      ...selectedSegment,
      cross: Number(nextCross.toFixed(2))
    },
    position: selectedNextPosition,
    reason: "selected-wall-normal-move"
  };

  const connectedUpdates = objects
    .filter((object) => object.id !== wall.id)
    .filter(isStructuralWallObject)
    .filter((object) => getWallSegment(object).floor === selectedSegment.floor)
    .filter((object) => getWallSegment(object).orientation !== selectedSegment.orientation)
    .flatMap((object) => {
      const objectSegment = getWallSegment(object);
      const endpoints = getWallEndpoints(object);
      const matchedEndpointIndex = endpoints.findIndex((endpoint) =>
        selectedOldEndpoints.some((selectedEndpoint) => getEndpointDistance(endpoint, selectedEndpoint) <= tolerance)
      );
      if (matchedEndpointIndex < 0) return [];

      const matchedSelectedIndex = selectedOldEndpoints.findIndex(
        (selectedEndpoint) => getEndpointDistance(endpoints[matchedEndpointIndex], selectedEndpoint) <= tolerance
      );
      if (matchedSelectedIndex < 0) return [];

      const nextEndpoints = endpoints.map((endpoint, index) =>
        index === matchedEndpointIndex ? selectedNextEndpoints[matchedSelectedIndex] : endpoint
      );
      const geometry = getWallGeometryFromEndpoints(object, nextEndpoints, tolerance);
      if (geometry.size[0] < minLength) return [];

      return [{
        id: object.id,
        movedEndpoint: matchedEndpointIndex === 0 ? "start" : "end",
        oldSegment: objectSegment,
        reason: "connected-wall-endpoint-follow",
        ...geometry
      }];
    });

  return [selectedUpdate, ...connectedUpdates];
}

export function buildWallEndpointResizeTopology({
  endpoint = "end",
  minLength = DEFAULT_MIN_WALL_LENGTH,
  nextWall,
  objects = [],
  oldWall,
  tolerance = DEFAULT_WALL_ENDPOINT_TOLERANCE
}) {
  if (!isStructuralWallObject(oldWall) || !isStructuralWallObject(nextWall)) return [];
  if (!["start", "end"].includes(endpoint)) return [];

  const oldSegment = getWallSegment(oldWall);
  const nextSegment = getWallSegment(nextWall);
  if (oldSegment.orientation !== nextSegment.orientation || oldSegment.floor !== nextSegment.floor) return [];

  const endpointIndex = endpoint === "start" ? 0 : 1;
  const oldEndpoints = getWallEndpoints(oldWall);
  const nextEndpoints = getWallEndpoints(nextWall);
  const oldMovingEndpoint = oldEndpoints[endpointIndex];
  const nextMovingEndpoint = nextEndpoints[endpointIndex];

  const connectedUpdates = objects
    .filter((object) => object.id !== oldWall.id)
    .filter(isStructuralWallObject)
    .filter((object) => getWallSegment(object).floor === oldSegment.floor)
    .filter((object) => getWallSegment(object).orientation !== oldSegment.orientation)
    .flatMap((object) => {
      const objectSegment = getWallSegment(object);
      const endpoints = getWallEndpoints(object);
      const matchedEndpointIndex = endpoints.findIndex(
        (candidate) => getEndpointDistance(candidate, oldMovingEndpoint) <= tolerance
      );
      if (matchedEndpointIndex < 0) return [];

      const resizedEndpoints = endpoints.map((candidate, index) =>
        index === matchedEndpointIndex ? nextMovingEndpoint : candidate
      );
      const forceCross = objectSegment.orientation === "x" ? nextMovingEndpoint.z : nextMovingEndpoint.x;
      const geometry = getWallGeometryFromEndpoints(object, resizedEndpoints, tolerance, { forceCross });
      if (geometry.size[0] < minLength) return [];

      return [{
        id: object.id,
        movedEndpoint: matchedEndpointIndex === 0 ? "start" : "end",
        oldSegment: objectSegment,
        reason: "connected-wall-endpoint-follow",
        ...geometry
      }];
    });

  return [
    {
      id: nextWall.id,
      nextSegment,
      position: nextWall.position,
      reason: "selected-wall-endpoint-resize",
      rotation: nextWall.rotation,
      size: nextWall.size,
      wallOrientation: nextWall.wallOrientation
    },
    ...connectedUpdates
  ];
}
