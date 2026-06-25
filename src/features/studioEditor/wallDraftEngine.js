import { collectWallEndpoints } from "./wallJoinRules.js";

export const WALL_ENDPOINT_SNAP_RADIUS = 0.45;

function roundMetric(value, precision = 2) {
  return Number((Number(value) || 0).toFixed(precision));
}

function snapToGrid(value, { snapEnabled, snapStep }) {
  if (!snapEnabled) return roundMetric(value);
  return roundMetric(Math.round(value / snapStep) * snapStep);
}

function clampToBoundary(value, axisSize, options) {
  const half = axisSize / 2;
  const snapped = snapToGrid(value, options);
  return roundMetric(Math.min(half, Math.max(-half, snapped)));
}

function normalizeWallDraftPoint(point, { buildable, snapEnabled, snapStep }) {
  return {
    x: clampToBoundary(point.x, buildable.width, { snapEnabled, snapStep }),
    z: clampToBoundary(point.z, buildable.depth, { snapEnabled, snapStep })
  };
}

function snapWallDraftPointToEndpoint(point, { activeFloor, buildable, objects, snapEnabled, snapStep }) {
  const normalized = normalizeWallDraftPoint(point, { buildable, snapEnabled, snapStep });
  const endpoints = collectWallEndpoints(objects, activeFloor);
  let closest = null;
  let closestDistance = Infinity;

  endpoints.forEach((endpoint) => {
    const distance = Math.hypot(endpoint.x - normalized.x, endpoint.z - normalized.z);
    if (distance < closestDistance) {
      closest = endpoint;
      closestDistance = distance;
    }
  });

  if (!closest || closestDistance > WALL_ENDPOINT_SNAP_RADIUS) {
    return {
      point: normalized,
      snapped: false
    };
  }

  return {
    distance: roundMetric(closestDistance, 3),
    point: {
      x: closest.x,
      z: closest.z
    },
    snapped: true,
    target: closest
  };
}

export function createPascalWallDraft({
  activeFloor,
  activeFloorBaseY,
  asset,
  buildable,
  endPoint,
  floorHeight = 2.7,
  objects,
  snapEnabled,
  snapStep,
  startPoint
}) {
  if (!startPoint || !endPoint || !asset) return null;

  const wallHeight = asset.wallHeight ?? asset.size?.[1] ?? floorHeight;
  const wallThickness = asset.wallThickness ?? asset.size?.[2] ?? 0.16;
  const snappedStart = snapWallDraftPointToEndpoint(startPoint, {
    activeFloor,
    buildable,
    objects,
    snapEnabled,
    snapStep
  });
  const snappedEnd = snapWallDraftPointToEndpoint(endPoint, {
    activeFloor,
    buildable,
    objects,
    snapEnabled,
    snapStep
  });
  const startX = snappedStart.point.x;
  const endX = snappedEnd.point.x;
  const startZ = snappedStart.point.z;
  const endZ = snappedEnd.point.z;
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const wallOrientation = Math.abs(deltaX) >= Math.abs(deltaZ) ? "x" : "z";
  const length = roundMetric(Math.abs(wallOrientation === "x" ? deltaX : deltaZ));
  const minLength = snapStep;
  const actualStartPoint = { x: startX, z: startZ };
  const actualEndPoint =
    wallOrientation === "x"
      ? { x: endX, z: startZ }
      : { x: startX, z: endZ };
  const position =
    wallOrientation === "x"
      ? [
          roundMetric((startX + endX) / 2),
          roundMetric(activeFloorBaseY + wallHeight / 2),
          roundMetric(startZ)
        ]
      : [
          roundMetric(startX),
          roundMetric(activeFloorBaseY + wallHeight / 2),
          roundMetric((startZ + endZ) / 2)
        ];

  return {
    asset,
    endPoint: actualEndPoint,
    floor: activeFloor,
    label: `${length >= minLength ? `${length}m 벽` : "벽 길이 부족"}${
      snappedStart.snapped || snappedEnd.snapped ? " · endpoint snap" : ""
    }`,
    position,
    rotation: wallOrientation === "x" ? [0, 0, 0] : [0, Math.PI / 2, 0],
    snapPoints: [
      { ...snappedStart, actualPoint: actualStartPoint },
      { ...snappedEnd, actualPoint: actualEndPoint }
    ]
      .filter(
        (snap) =>
          snap.snapped &&
          Math.hypot(snap.point.x - snap.actualPoint.x, snap.point.z - snap.actualPoint.z) <= 0.001
      )
      .map((snap) => ({
        distance: snap.distance ?? 0,
        kind: "endpoint",
        objectId: snap.target.objectId,
        position: [snap.actualPoint.x, activeFloorBaseY + 0.08, snap.actualPoint.z]
      })),
    size: [Math.max(length, minLength), wallHeight, wallThickness],
    startPoint: actualStartPoint,
    valid: length >= minLength,
    wallOrientation
  };
}
