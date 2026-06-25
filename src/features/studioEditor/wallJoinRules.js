export const WALL_JOIN_TOLERANCE = 0.001;

export function getSupportKind(item) {
  return item?.supportKind ?? item?.metadata?.supportKind ?? null;
}

export function isStructuralWallObject(object) {
  return object?.type === "catalog-asset" && getSupportKind(object) === "wall";
}

export function getWallOrientation(object) {
  if (object?.wallOrientation === "z" || object?.metadata?.wallOrientation === "z") return "z";
  if (object?.wallOrientation === "x" || object?.metadata?.wallOrientation === "x") return "x";

  const rotationY = object?.rotation?.[1] ?? 0;
  const normalized = ((rotationY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(normalized - Math.PI / 2) <= 0.001 ? "z" : "x";
}

export function getWallSegment(object) {
  const [x = 0, y = 0, z = 0] = object.position ?? [0, 0, 0];
  const [width = 1, height = 1, depth = 1] = object.size ?? [1, 1, 1];
  const orientation = getWallOrientation(object);
  const axisCenter = orientation === "x" ? x : z;
  const cross = orientation === "x" ? z : x;
  return {
    depth,
    floor: object.floor ?? object.metadata?.floorNumber ?? 1,
    height,
    maxU: axisCenter + width / 2,
    minU: axisCenter - width / 2,
    orientation,
    thickness: depth,
    width,
    y,
    cross
  };
}

export function getWallEndpoints(object) {
  const segment = getWallSegment(object);
  if (segment.orientation === "x") {
    return [
      {
        floor: segment.floor,
        objectId: object.id,
        x: Number(segment.minU.toFixed(3)),
        z: Number(segment.cross.toFixed(3))
      },
      {
        floor: segment.floor,
        objectId: object.id,
        x: Number(segment.maxU.toFixed(3)),
        z: Number(segment.cross.toFixed(3))
      }
    ];
  }

  return [
    {
      floor: segment.floor,
      objectId: object.id,
      x: Number(segment.cross.toFixed(3)),
      z: Number(segment.minU.toFixed(3))
    },
    {
      floor: segment.floor,
      objectId: object.id,
      x: Number(segment.cross.toFixed(3)),
      z: Number(segment.maxU.toFixed(3))
    }
  ];
}

export function collectWallEndpoints(objects, floor) {
  return objects
    .filter(isStructuralWallObject)
    .filter((object) => floor == null || getWallSegment(object).floor === floor)
    .flatMap(getWallEndpoints);
}

export function areWallSegmentsCollinear(first, second, tolerance = WALL_JOIN_TOLERANCE) {
  return (
    first.floor === second.floor &&
    first.orientation === second.orientation &&
    Math.abs(first.cross - second.cross) <= tolerance &&
    Math.abs(first.y - second.y) <= tolerance &&
    Math.abs(first.height - second.height) <= tolerance &&
    Math.abs(first.thickness - second.thickness) <= tolerance
  );
}

export function getWallSegmentOverlapKind(first, second, tolerance = WALL_JOIN_TOLERANCE) {
  const overlapStart = Math.max(first.minU, second.minU);
  const overlapEnd = Math.min(first.maxU, second.maxU);
  const overlapLength = overlapEnd - overlapStart;

  if (overlapLength < -tolerance) return "separate";
  if (Math.abs(overlapLength) <= tolerance) return "edge-touch";

  const firstContainsSecond = first.minU <= second.minU + tolerance && first.maxU >= second.maxU - tolerance;
  const secondContainsFirst = second.minU <= first.minU + tolerance && second.maxU >= first.maxU - tolerance;

  return firstContainsSecond || secondContainsFirst ? "full-overlap" : "partial-overlap";
}

export function doWallSegmentsTouchOrOverlap(first, second, tolerance = WALL_JOIN_TOLERANCE) {
  return getWallSegmentOverlapKind(first, second, tolerance) !== "separate";
}

export function collectJoinableWalls(candidate, objects, tolerance = WALL_JOIN_TOLERANCE) {
  if (!isStructuralWallObject(candidate)) return [];

  const joinable = [];
  const visited = new Set();
  let mergedSegment = getWallSegment(candidate);
  let changed = true;

  while (changed) {
    changed = false;
    objects.forEach((object) => {
      if (!isStructuralWallObject(object) || visited.has(object.id)) return;
      const segment = getWallSegment(object);
      if (!areWallSegmentsCollinear(mergedSegment, segment, tolerance)) return;
      if (!doWallSegmentsTouchOrOverlap(mergedSegment, segment, tolerance)) return;

      visited.add(object.id);
      joinable.push(object);
      mergedSegment = {
        ...mergedSegment,
        maxU: Math.max(mergedSegment.maxU, segment.maxU),
        minU: Math.min(mergedSegment.minU, segment.minU),
        width: Math.max(mergedSegment.maxU, segment.maxU) - Math.min(mergedSegment.minU, segment.minU)
      };
      changed = true;
    });
  }

  return joinable;
}

export function getMergedWallGeometry(walls) {
  const segments = walls.map(getWallSegment);
  const minU = Math.min(...segments.map((segment) => segment.minU));
  const maxU = Math.max(...segments.map((segment) => segment.maxU));
  const first = segments[0];
  const sourceCount = walls.reduce((sum, wall) => sum + (wall.metadata?.wallJoin?.sourceCount ?? 1), 0);
  const length = Number((maxU - minU).toFixed(2));
  const centerU = Number(((minU + maxU) / 2).toFixed(2));
  const cross = Number(first.cross.toFixed(2));
  const y = Number(first.y.toFixed(2));
  const position = first.orientation === "x" ? [centerU, y, cross] : [cross, y, centerU];

  return {
    position,
    rotation: first.orientation === "x" ? [0, 0, 0] : [0, Math.PI / 2, 0],
    size: [length, first.height, first.thickness],
    wallOrientation: first.orientation,
    sourceCount
  };
}

function getSegmentCenterU(segment) {
  return (segment.minU + segment.maxU) / 2;
}

function getMergedWallCenterU(merged) {
  const [x = 0, , z = 0] = merged?.position ?? [0, 0, 0];
  return merged?.wallOrientation === "z" ? z : x;
}

function roundWallFeatureMetric(value, precision = 2) {
  return Number((Number(value) || 0).toFixed(precision));
}

export function remapHostedWallFeatureToMergedWall(feature = {}, sourceWall, merged, options = {}) {
  const precision = options.precision ?? 2;
  const targetWall = options.targetWall ?? "body";
  const sourceSegment = getWallSegment(sourceWall);
  const sourceCenterU = getSegmentCenterU(sourceSegment);
  const mergedCenterU = getMergedWallCenterU(merged);
  const sourceOffset = Number(feature.offset ?? 0);

  return {
    ...feature,
    offset: roundWallFeatureMetric(sourceCenterU + sourceOffset - mergedCenterU, precision),
    wall: targetWall
  };
}

export function mergeHostedWallFeatures(walls = [], merged, featureKey, options = {}) {
  if (!Array.isArray(walls) || !featureKey) return [];

  return walls.flatMap((wall) =>
    (Array.isArray(wall?.[featureKey]) ? wall[featureKey] : [])
      .map((feature) => remapHostedWallFeatureToMergedWall(feature, wall, merged, options))
  );
}
