export const PLACEMENT_RULES = {
  columnSupportRadius: 0.6,
  overhangLimit: 0.5,
  roomOverlapEpsilon: 0.001,
  supportSampleStep: 0.5,
  wallSupportTolerance: 0.25
};

export const PLACEMENT_REASON_LABELS = {
  "outside-buildable": "건축 가능 영역 밖",
  "room-too-small": "방 최소 크기 미달",
  "same-floor-overlap": "같은 층 방 겹침",
  "missing-lower-floor": "아래층 구조 없음",
  "unsupported-overhang": "하부 지지 없음"
};

export const PLACEMENT_MODE_ALIASES = {
  "room-draw": "draw-room"
};

export const PLACEMENT_MODE_POLICIES = {
  "floor-free": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: true,
    categories: ["gate", "stairs-ladder", "railing"],
    erasableSubFeature: false,
    placementMode: "floor-free",
    requiresRoomHost: false,
    requiresWallHost: false
  },
  "floor-stair": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: true,
    categories: ["stairs-ladder"],
    erasableSubFeature: false,
    placementMode: "floor-stair",
    requiresRoomHost: false,
    requiresWallHost: false
  },
  "floor-structural": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: true,
    categories: ["column", "wall-tool"],
    erasableSubFeature: false,
    overlapSupportKinds: ["wall"],
    placementMode: "floor-structural",
    requiresRoomHost: false,
    requiresWallHost: false
  },
  "draw-wall": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: true,
    categories: ["wall-tool"],
    erasableSubFeature: false,
    overlapSupportKinds: ["wall"],
    placementMode: "draw-wall",
    requiresRoomHost: false,
    requiresWallHost: false
  },
  "draw-room": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: true,
    categories: ["wall-tool"],
    erasableSubFeature: false,
    placementMode: "draw-room",
    requiresRoomHost: false,
    requiresWallHost: false
  },
  "wall-opening": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: false,
    categories: ["door", "window"],
    erasableSubFeature: true,
    placementMode: "wall-opening",
    requiresRoomHost: false,
    requiresWallHost: true
  },
  "wall-attached": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: false,
    categories: ["exterior-trim", "wall-pattern", "spandrel"],
    erasableSubFeature: true,
    placementMode: "wall-attached",
    requiresRoomHost: false,
    requiresWallHost: true
  },
  "roof-attached": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: false,
    categories: ["roof"],
    erasableSubFeature: false,
    placementMode: "roof-attached",
    requiresRoomHost: true,
    requiresWallHost: false
  },
  "roof-accessory": {
    canOverlapSameCategory: false,
    canPlaceOnFloor: false,
    categories: ["roof-decor", "roof-pattern", "roof-trim"],
    erasableSubFeature: false,
    placementMode: "roof-accessory",
    requiresRoofHost: true,
    requiresRoomHost: true,
    requiresWallHost: false
  }
};

export function normalizePlacementMode(target) {
  const placementMode = typeof target === "string" ? target : target?.placementMode;
  return PLACEMENT_MODE_ALIASES[placementMode] ?? placementMode ?? "floor-free";
}

export function getPlacementPolicy(target) {
  const placementMode = normalizePlacementMode(target);
  return PLACEMENT_MODE_POLICIES[placementMode] ?? PLACEMENT_MODE_POLICIES["floor-free"];
}

export function canPlaceOnFloor(target) {
  return getPlacementPolicy(target).canPlaceOnFloor;
}

export function requiresWallHost(target) {
  return getPlacementPolicy(target).requiresWallHost;
}

export function requiresRoomHost(target) {
  return getPlacementPolicy(target).requiresRoomHost;
}

export function isErasableSubFeature(target) {
  if (target?.openingId || target?.attachmentId) return true;
  return getPlacementPolicy(target).erasableSubFeature;
}

function getPolicySupportKind(target) {
  return target?.supportKind ?? target?.metadata?.supportKind ?? null;
}

export function canOverlapSameCategory(candidate, other = null) {
  const policy = getPlacementPolicy(candidate);
  const candidateSupportKind = getPolicySupportKind(candidate);
  if (policy.overlapSupportKinds?.includes(candidateSupportKind)) {
    return other ? candidateSupportKind === getPolicySupportKind(other) : true;
  }
  if (!policy.canOverlapSameCategory) return false;
  if (!other) return true;
  return candidate?.categoryId === other?.categoryId || normalizePlacementMode(candidate) === normalizePlacementMode(other);
}

export function getObjectFloor(object, floorHeight = 2.7) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  if (Number.isFinite(object?.metadata?.floorNumber)) return object.metadata.floorNumber;
  const [objectY = 0] = object?.position?.slice(1, 2) ?? [0];
  return Math.max(1, Math.round(objectY / floorHeight) + 1);
}

export function getRectFromPositionSize(position, size) {
  const [x = 0, , z = 0] = position ?? [0, 0, 0];
  const [width = 1, , depth = 1] = size ?? [1, 1, 1];
  return {
    maxX: x + width / 2,
    maxZ: z + depth / 2,
    minX: x - width / 2,
    minZ: z - depth / 2
  };
}

export function getObjectRect(object) {
  return getRectFromPositionSize(object?.position, object?.size);
}

export function isRectInsideBuildable(rect, buildable) {
  const halfWidth = buildable.width / 2;
  const halfDepth = buildable.depth / 2;
  return rect.minX >= -halfWidth && rect.maxX <= halfWidth && rect.minZ >= -halfDepth && rect.maxZ <= halfDepth;
}

export function rectsOverlap(first, second, epsilon = PLACEMENT_RULES.roomOverlapEpsilon) {
  return (
    first.minX < second.maxX - epsilon &&
    second.minX < first.maxX - epsilon &&
    first.minZ < second.maxZ - epsilon &&
    second.minZ < first.maxZ - epsilon
  );
}

export function getRectIntersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX));
  const depth = Math.max(0, Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ));
  return width * depth;
}

export function isPointInsideRect(point, rect, tolerance = 0) {
  return (
    point.x >= rect.minX - tolerance &&
    point.x <= rect.maxX + tolerance &&
    point.z >= rect.minZ - tolerance &&
    point.z <= rect.maxZ + tolerance
  );
}

export function getPointToRectDistance(point, rect) {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dz = Math.max(rect.minZ - point.z, 0, point.z - rect.maxZ);
  return Math.sqrt(dx * dx + dz * dz);
}

function sampleAxis(min, max, step) {
  const values = [];
  for (let value = min; value <= max + 0.001; value += step) {
    values.push(Number(Math.min(max, value).toFixed(2)));
  }
  if (values[values.length - 1] !== Number(max.toFixed(2))) {
    values.push(Number(max.toFixed(2)));
  }
  return [...new Set(values)];
}

export function sampleRect(rect, step = PLACEMENT_RULES.supportSampleStep) {
  const xs = sampleAxis(rect.minX, rect.maxX, step);
  const zs = sampleAxis(rect.minZ, rect.maxZ, step);
  const points = [];
  xs.forEach((x) => {
    zs.forEach((z) => {
      points.push({ x, z });
    });
  });
  return points;
}

function getSupportSourceRect(object) {
  const rect = getObjectRect(object);
  const supportKind = object?.supportKind ?? object?.metadata?.supportKind;
  if (supportKind === "column") {
    const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
    return { center: { x, z }, rect, supportKind };
  }
  return { rect, supportKind };
}

export function analyzeRoomSupport({
  candidateRect,
  lowerRooms,
  lowerSupports,
  rules = PLACEMENT_RULES
}) {
  const lowerRoomRects = lowerRooms.map(getObjectRect);
  const supportSources = lowerSupports.map(getSupportSourceRect);
  const hasPrimarySupport =
    lowerRoomRects.some((rect) => getRectIntersectionArea(candidateRect, rect) > 0.01) ||
    supportSources.some((source) => getRectIntersectionArea(candidateRect, source.rect) > 0.01);

  const unsupportedPoints = sampleRect(candidateRect, rules.supportSampleStep)
    .filter((point) => {
      if (lowerRoomRects.some((rect) => isPointInsideRect(point, rect))) return false;
      if (lowerRoomRects.some((rect) => getPointToRectDistance(point, rect) <= rules.overhangLimit)) return false;
      return !supportSources.some((source) => {
        if (source.supportKind === "column") {
          const dx = point.x - source.center.x;
          const dz = point.z - source.center.z;
          return Math.sqrt(dx * dx + dz * dz) <= rules.columnSupportRadius;
        }
        return getPointToRectDistance(point, source.rect) <= rules.wallSupportTolerance;
      });
    })
    .slice(0, 80);

  return {
    hasPrimarySupport,
    supported: hasPrimarySupport && unsupportedPoints.length === 0,
    unsupportedPoints
  };
}

export function validateRoomPlacement({
  activeFloor,
  buildable,
  candidate,
  floorHeight = 2.7,
  ignoreObjectId = null,
  objects,
  rules = PLACEMENT_RULES
}) {
  if (!candidate?.valid) {
    return { reason: "room-too-small", supported: false, unsupportedPoints: [], valid: false };
  }

  const candidateRect = getRectFromPositionSize(candidate.position, candidate.size);
  if (!isRectInsideBuildable(candidateRect, buildable)) {
    return { reason: "outside-buildable", supported: false, unsupportedPoints: [], valid: false };
  }

  const sameFloorRooms = objects.filter(
    (object) =>
      object.id !== ignoreObjectId &&
      object.type === "room" &&
      getObjectFloor(object, floorHeight) === activeFloor
  );
  const overlapsSameFloor = sameFloorRooms.some((room) => rectsOverlap(candidateRect, getObjectRect(room)));
  if (overlapsSameFloor) {
    return { reason: "same-floor-overlap", supported: false, unsupportedPoints: [], valid: false };
  }

  if (activeFloor <= 1) {
    return { reason: null, supported: true, unsupportedPoints: [], valid: true };
  }

  const lowerFloor = activeFloor - 1;
  const lowerRooms = objects.filter((object) => object.type === "room" && getObjectFloor(object, floorHeight) === lowerFloor);
  const lowerSupports = objects.filter(
    (object) =>
      object.id !== ignoreObjectId &&
      object.type !== "room" &&
      getObjectFloor(object, floorHeight) === lowerFloor &&
      ["column", "wall"].includes(object.supportKind ?? object.metadata?.supportKind)
  );

  if (lowerRooms.length === 0 && lowerSupports.length === 0) {
    return {
      reason: "missing-lower-floor",
      supported: false,
      unsupportedPoints: sampleRect(candidateRect, rules.supportSampleStep).slice(0, 80),
      valid: false
    };
  }

  const support = analyzeRoomSupport({ candidateRect, lowerRooms, lowerSupports, rules });
  if (!support.supported) {
    return {
      reason: "unsupported-overhang",
      supported: false,
      unsupportedPoints: support.unsupportedPoints,
      valid: false
    };
  }

  return { reason: null, supported: true, unsupportedPoints: [], valid: true };
}
