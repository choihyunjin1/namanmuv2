const DEFAULT_STAIR_WIDTH = 1;
const DEFAULT_STAIR_LENGTH = 3;
const DEFAULT_STAIR_HEIGHT = 2.5;
const DEFAULT_STAIR_STEP_COUNT = 10;
const DEFAULT_STAIR_THICKNESS = 0.25;
const DEFAULT_STAIR_FILL_TO_FLOOR = true;
const DEFAULT_ORIGIN_MODE = "run-start";
const DEFAULT_STAIR_DIRECTION = "south";
const STAIR_DIRECTIONS = ["south", "east", "north", "west"];
const STAIR_DIRECTION_TO_ROTATION = {
  east: Math.PI / 2,
  north: Math.PI,
  south: 0,
  west: -Math.PI / 2
};

const DEFAULT_SIZE_RULES = {
  maxHeight: 8,
  maxLength: 30,
  maxStepCount: 80,
  maxThickness: 1,
  maxWidth: 6,
  minHeight: 0.1,
  minLength: 0.6,
  minStepCount: 1,
  minThickness: 0.04,
  minWidth: 0.5
};

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, precision = 3) {
  return Number(value.toFixed(precision));
}

function readStairValue(source, key) {
  return source?.stair?.[key] ??
    source?.metadata?.stair?.[key] ??
    source?.metadata?.[key] ??
    source?.placementRules?.stair?.[key] ??
    source?.[key];
}

function readDimension(source, keys, sizeIndex, fallback) {
  for (const key of keys) {
    const value = readStairValue(source, key);
    if (Number.isFinite(Number(value))) return Number(value);
  }
  const sizeValue = source?.size?.[sizeIndex];
  return finiteNumber(sizeValue, fallback);
}

function normalizeRotationY(rotation) {
  if (Array.isArray(rotation)) return finiteNumber(rotation[1], 0);
  return finiteNumber(rotation, 0);
}

function normalizeAngleRadians(angle) {
  const twoPi = Math.PI * 2;
  let normalized = finiteNumber(angle, 0) % twoPi;
  if (normalized > Math.PI) normalized -= twoPi;
  if (normalized <= -Math.PI) normalized += twoPi;
  return normalized;
}

function angularDistance(first, second) {
  return Math.abs(normalizeAngleRadians(first - second));
}

export function getStairRotationForDirection(direction = DEFAULT_STAIR_DIRECTION) {
  return STAIR_DIRECTION_TO_ROTATION[direction] ?? STAIR_DIRECTION_TO_ROTATION[DEFAULT_STAIR_DIRECTION];
}

export function getStairDirectionFromRotation(rotation = 0) {
  const rotationY = normalizeAngleRadians(normalizeRotationY(rotation));
  return STAIR_DIRECTIONS.reduce((closest, direction) => {
    const distance = angularDistance(rotationY, STAIR_DIRECTION_TO_ROTATION[direction]);
    return distance < closest.distance ? { direction, distance } : closest;
  }, { direction: DEFAULT_STAIR_DIRECTION, distance: Number.POSITIVE_INFINITY }).direction;
}

export function normalizeStairDirection(source = {}, options = {}) {
  const explicitDirection =
    source?.stair?.orientation?.ascentDirection ??
    source?.metadata?.stair?.orientation?.ascentDirection ??
    source?.metadata?.stair?.ascentDirection ??
    source?.ascentDirection ??
    options.ascentDirection;
  if (STAIR_DIRECTIONS.includes(explicitDirection)) return explicitDirection;
  return getStairDirectionFromRotation(source?.rotation ?? options.rotation ?? 0);
}

function normalizePosition(position) {
  return [
    finiteNumber(position?.[0], 0),
    finiteNumber(position?.[1], 0),
    finiteNumber(position?.[2], 0)
  ];
}

function normalizeOriginMode(originMode) {
  return originMode === "center" ? "center" : DEFAULT_ORIGIN_MODE;
}

function rotateXZ(x, z, rotationY) {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [x * cos + z * sin, -x * sin + z * cos];
}

function getLocalFootprintCorners(width, length, originMode) {
  const halfWidth = width / 2;
  if (originMode === "center") {
    const halfLength = length / 2;
    return [
      [-halfWidth, -halfLength],
      [halfWidth, -halfLength],
      [halfWidth, halfLength],
      [-halfWidth, halfLength]
    ];
  }
  return [
    [-halfWidth, 0],
    [halfWidth, 0],
    [halfWidth, length],
    [-halfWidth, length]
  ];
}

function getAabbFromCorners(corners) {
  const xs = corners.map((corner) => corner.x);
  const zs = corners.map((corner) => corner.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    center: [round((minX + maxX) / 2), round((minZ + maxZ) / 2)],
    depth: round(maxZ - minZ),
    maxX: round(maxX),
    maxZ: round(maxZ),
    minX: round(minX),
    minZ: round(minZ),
    width: round(maxX - minX)
  };
}

function rectsOverlap(first, second, epsilon = 0.001) {
  return (
    first.minX < second.maxX - epsilon &&
    second.minX < first.maxX - epsilon &&
    first.minZ < second.maxZ - epsilon &&
    second.minZ < first.maxZ - epsilon
  );
}

function getBuildableRect(buildable) {
  const width = finiteNumber(buildable?.width, 0);
  const depth = finiteNumber(buildable?.depth, 0);
  if (!(width > 0 && depth > 0)) return null;
  return {
    maxX: width / 2,
    maxZ: depth / 2,
    minX: -width / 2,
    minZ: -depth / 2
  };
}

function isRectInside(rect, bounds) {
  if (!bounds) return true;
  return (
    rect.minX >= bounds.minX &&
    rect.maxX <= bounds.maxX &&
    rect.minZ >= bounds.minZ &&
    rect.maxZ <= bounds.maxZ
  );
}

function normalizeStairKind(source = {}) {
  const kind = readStairValue(source, "kind");
  if (kind === "ladder") return "ladder";
  if (kind === "stair") return "stair";
  return source?.shape === "ladder" || readStairValue(source, "stairType") === "ladder" ? "ladder" : "stair";
}

function normalizeStairLayout(source = {}, kind = normalizeStairKind(source)) {
  if (kind === "ladder") return "ladder";
  const layout = readStairValue(source, "layout") ?? readStairValue(source, "stairType");
  if (layout === "landing" || layout === "straight") return layout;
  return finiteNumber(readStairValue(source, "landingDepth"), 0) > 0 ? "landing" : "straight";
}

function normalizeStairLandingDepth(source = {}, length = DEFAULT_STAIR_LENGTH, layout = normalizeStairLayout(source)) {
  if (layout === "ladder") return 0;
  const rawLandingDepth = finiteNumber(readStairValue(source, "landingDepth"), 0);
  return round(clamp(rawLandingDepth, 0, Math.max(0, length * 0.72)));
}

function normalizeStairRailingAttachments(source = {}, objectId = null) {
  const attachments =
    source?.stair?.railingAttachments ??
    source?.metadata?.stair?.railingAttachments ??
    source?.railingAttachments ??
    [];
  if (!Array.isArray(attachments)) return [];

  return attachments.map((attachment, index) => {
    const side = ["left", "right", "both"].includes(attachment?.side) ? attachment.side : "both";
    const segment = ["run", "landing", "full"].includes(attachment?.segment) ? attachment.segment : "full";
    return {
      assetId: attachment?.assetId ?? "test-railing-01",
      attachedToObjectId: objectId ?? attachment?.attachedToObjectId ?? null,
      depth: round(clamp(finiteNumber(attachment?.depth, 0.06), 0.02, 0.3)),
      height: round(clamp(finiteNumber(attachment?.height, 0.85), 0.2, 2)),
      id: attachment?.id ?? `${objectId ?? "stair"}-railing-${index + 1}`,
      localOffset: Array.isArray(attachment?.localOffset)
        ? attachment.localOffset.slice(0, 3).map((value) => round(finiteNumber(value, 0)))
        : [0, 0, 0],
      relation: "stair-railing",
      segment,
      side
    };
  });
}

function getObjectFloor(object, floorHeight = 2.7) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  if (Number.isFinite(object?.metadata?.floorNumber)) return object.metadata.floorNumber;
  const y = finiteNumber(object?.position?.[1], 0);
  return Math.max(1, Math.round(y / floorHeight) + 1);
}

function getObjectPlanRect(object) {
  const stairAabb = object?.metadata?.stair?.footprint?.aabb ?? object?.stairFootprint?.aabb;
  if (stairAabb) {
    return {
      maxX: finiteNumber(stairAabb.maxX, 0),
      maxZ: finiteNumber(stairAabb.maxZ, 0),
      minX: finiteNumber(stairAabb.minX, 0),
      minZ: finiteNumber(stairAabb.minZ, 0)
    };
  }

  const [x = 0, , z = 0] = object?.position ?? [0, 0, 0];
  const [sizeX = 1, , sizeZ = 1] = object?.size ?? [1, 1, 1];
  const supportKind = object?.supportKind ?? object?.metadata?.supportKind;
  const orientation = object?.wallOrientation ?? object?.metadata?.wallOrientation;
  const width = supportKind === "wall" && orientation === "z" ? sizeZ : sizeX;
  const depth = supportKind === "wall" && orientation === "z" ? sizeX : sizeZ;

  return {
    maxX: x + width / 2,
    maxZ: z + depth / 2,
    minX: x - width / 2,
    minZ: z - depth / 2
  };
}

export function normalizeStraightStairSize(source = {}, options = {}) {
  const rules = { ...DEFAULT_SIZE_RULES, ...(options.rules ?? {}) };
  const width = clamp(
    readDimension(source, ["width", "stairWidth"], 0, options.width ?? DEFAULT_STAIR_WIDTH),
    rules.minWidth,
    rules.maxWidth
  );
  const length = clamp(
    readDimension(source, ["length", "totalRun", "run"], 2, options.length ?? DEFAULT_STAIR_LENGTH),
    rules.minLength,
    rules.maxLength
  );
  const height = clamp(
    readDimension(source, ["height", "totalRise", "rise"], 1, options.height ?? DEFAULT_STAIR_HEIGHT),
    rules.minHeight,
    rules.maxHeight
  );
  const rawStepCount = readStairValue(source, "stepCount") ?? options.stepCount ?? DEFAULT_STAIR_STEP_COUNT;
  const stepCount = clamp(Math.round(finiteNumber(rawStepCount, DEFAULT_STAIR_STEP_COUNT)), rules.minStepCount, rules.maxStepCount);
  const thickness = clamp(
    finiteNumber(readStairValue(source, "thickness"), options.thickness ?? DEFAULT_STAIR_THICKNESS),
    rules.minThickness,
    rules.maxThickness
  );
  const fillToFloor = readStairValue(source, "fillToFloor") ?? options.fillToFloor ?? DEFAULT_STAIR_FILL_TO_FLOOR;
  const kind = normalizeStairKind(source);
  const layout = normalizeStairLayout(source, kind);
  const landingDepth = normalizeStairLandingDepth(source, length, layout);
  const defaultRunLength = layout === "ladder" ? length : Math.max(0.08, length - landingDepth);
  const treadDepth = clamp(
    finiteNumber(readStairValue(source, "stairRun"), options.stairRun ?? defaultRunLength / stepCount),
    0.04,
    rules.maxLength
  );
  const riserHeight = clamp(
    finiteNumber(readStairValue(source, "stairRise"), options.stairRise ?? height / stepCount),
    0.02,
    rules.maxHeight
  );
  const runLength = layout === "ladder" ? length : Math.max(0.08, Math.min(length, treadDepth * stepCount));

  return {
    fillToFloor: Boolean(fillToFloor),
    height: round(height),
    kind,
    landingDepth,
    layout,
    length: round(length),
    riserHeight: round(riserHeight),
    runLength: round(runLength),
    stairRun: round(treadDepth),
    stairRise: round(riserHeight),
    size: [round(width), round(height), round(length)],
    slopeAngle: round(Math.atan2(height, runLength)),
    stepCount,
    thickness: round(thickness),
    treadDepth: round(treadDepth),
    width: round(width)
  };
}

export function getStraightStairFootprint(input = {}, options = {}) {
  const normalized = input.width && input.length && input.height
    ? normalizeStraightStairSize(input, options)
    : normalizeStraightStairSize(input.size ? input : input.asset ?? input.source ?? input, options);
  const position = normalizePosition(input.position ?? options.position);
  const rotationY = normalizeRotationY(input.rotation ?? options.rotation);
  const originMode = normalizeOriginMode(input.originMode ?? options.originMode);
  const localCorners = getLocalFootprintCorners(normalized.width, normalized.length, originMode);
  const corners = localCorners.map(([localX, localZ]) => {
    const [x, z] = rotateXZ(localX, localZ, rotationY);
    return {
      x: round(position[0] + x),
      z: round(position[2] + z)
    };
  });
  const aabb = getAabbFromCorners(corners);

  return {
    aabb,
    corners,
    height: normalized.height,
    length: normalized.length,
    localCorners: localCorners.map(([x, z]) => [round(x), round(z)]),
    originMode,
    position,
    rotationY: round(rotationY),
    size: normalized.size,
    width: normalized.width
  };
}

export function createStraightStairStepMetadata(input = {}, options = {}) {
  const rawSource = input.source ?? input.asset ?? input;
  const normalized = normalizeStraightStairSize(input.size ? { ...rawSource, size: input.size } : rawSource, options);
  const originMode = normalizeOriginMode(input.originMode ?? options.originMode);
  const position = normalizePosition(input.position ?? options.position);
  const rotationY = normalizeRotationY(input.rotation ?? options.rotation);
  const runLength = normalized.layout === "ladder"
    ? normalized.length
    : Math.max(0.08, Math.min(normalized.length, normalized.runLength ?? normalized.length - normalized.landingDepth));
  const treadDepth = normalized.layout === "ladder" ? normalized.treadDepth : runLength / normalized.stepCount;
  const startRun = originMode === "center" ? -normalized.length / 2 : 0;
  const steps = Array.from({ length: normalized.stepCount }, (_, index) => {
    const localStartZ = startRun + index * treadDepth;
    const localEndZ = localStartZ + treadDepth;
    const riseStart = index * normalized.riserHeight;
    const riseEnd = (index + 1) * normalized.riserHeight;
    const localFootprint = getLocalFootprintCorners(normalized.width, treadDepth, "run-start")
      .map(([x, z]) => [round(x), round(z + localStartZ)]);
    const worldFootprint = localFootprint.map(([localX, localZ]) => {
      const [x, z] = rotateXZ(localX, localZ, rotationY);
      return [round(position[0] + x), round(position[2] + z)];
    });

    return {
      centerRun: round((localStartZ + localEndZ) / 2),
      index,
      localFootprint,
      number: index + 1,
      riseEnd: round(riseEnd),
      riseStart: round(riseStart),
      runEnd: round(localEndZ),
      runStart: round(localStartZ),
      topElevation: round(riseEnd),
      treadDepth: round(treadDepth),
      worldFootprint
    };
  });
  const landingStart = normalized.layout === "landing" ? startRun + runLength : null;

  return {
    height: normalized.height,
    kind: normalized.kind,
    landing: normalized.layout === "landing"
      ? {
          depth: normalized.landingDepth,
          localFootprint: getLocalFootprintCorners(normalized.width, normalized.landingDepth, "run-start")
            .map(([x, z]) => [round(x), round(z + landingStart)])
        }
      : null,
    landingDepth: normalized.landingDepth,
    length: normalized.length,
    layout: normalized.layout,
    originMode,
    riserHeight: normalized.riserHeight,
    runLength: round(runLength),
    stepCount: normalized.stepCount,
    steps,
    totalRise: normalized.height,
    totalRun: normalized.length,
    treadDepth: round(treadDepth),
    width: normalized.width
  };
}

export function createStairObjectMetadata(input = {}, options = {}) {
  const source = input.source ?? input.asset ?? input;
  const normalized = normalizeStraightStairSize(source, options);
  const ascentDirection = normalizeStairDirection(source, options);
  const rotationY = Number.isFinite(options.rotation)
    ? normalizeRotationY(options.rotation)
    : getStairRotationForDirection(ascentDirection);
  const footprint = getStraightStairFootprint({
    originMode: input.originMode ?? options.originMode,
    position: input.position ?? options.position,
    rotation: rotationY,
    size: normalized.size
  });
  const stepMetadata = createStraightStairStepMetadata({
    originMode: input.originMode ?? options.originMode,
    position: input.position ?? options.position,
    rotation: rotationY,
    source,
    size: normalized.size
  }, options);

  return {
    footprint,
    kind: normalized.kind,
    landingDepth: normalized.landingDepth,
    layout: normalized.layout,
    normalized,
    orientation: {
      ascentDirection,
      rotationY: round(rotationY)
    },
    railingAttachments: normalizeStairRailingAttachments(source, options.objectId),
    stepMetadata
  };
}

export function buildStraightStairPlacementValidationInput({
  activeFloor = 1,
  asset = {},
  buildable = null,
  floorBaseY = null,
  floorHeight = 2.7,
  ignoreObjectId = null,
  objects = [],
  originMode = "center",
  position = [0, 0, 0],
  rotation = 0,
  source = null
} = {}) {
  const normalized = normalizeStraightStairSize(source ?? asset, { height: asset?.size?.[1] });
  const footprint = getStraightStairFootprint({
    originMode,
    position,
    rotation,
    size: normalized.size
  });
  const [centerX, centerZ] = footprint.aabb.center;
  const centerY = Number.isFinite(floorBaseY)
    ? round(floorBaseY + normalized.height / 2)
    : normalizePosition(position)[1];
  const candidate = {
    floor: activeFloor,
    footprint,
    position: [centerX, centerY, centerZ],
    rotation: [0, footprint.rotationY, 0],
    size: [footprint.aabb.width, normalized.height, footprint.aabb.depth],
    valid: true
  };
  const buildableRect = getBuildableRect(buildable);
  const sameFloorObjects = (Array.isArray(objects) ? objects : []).filter(
    (object) => object?.id !== ignoreObjectId && getObjectFloor(object, floorHeight) === activeFloor
  );
  const blockingObjects = sameFloorObjects.filter((object) => rectsOverlap(footprint.aabb, getObjectPlanRect(object)));
  const stepMetadata = createStraightStairStepMetadata({
    originMode,
    position,
    rotation,
    source: source ?? asset,
    size: normalized.size,
    stepCount: normalized.stepCount
  });
  const stairMetadata = createStairObjectMetadata({
    originMode,
    position,
    source: source ?? asset
  }, {
    height: asset?.size?.[1],
    rotation
  });

  return {
    activeFloor,
    blockingObjects,
    buildable,
    buildableRect,
    candidate,
    floorBaseY,
    floorHeight,
    footprint,
    normalized,
    originMode,
    stairMetadata,
    stepMetadata,
    withinBuildable: isRectInside(footprint.aabb, buildableRect)
  };
}

export function validateStraightStairPlacement(input = {}) {
  const validationInput = buildStraightStairPlacementValidationInput(input);
  let reason = null;
  if (!validationInput.withinBuildable) {
    reason = "out-of-bounds";
  } else if (validationInput.blockingObjects.length > 0) {
    reason = "footprint-overlap";
  }

  return {
    blockingObjectIds: validationInput.blockingObjects.map((object) => object.id).filter(Boolean),
    footprint: validationInput.footprint,
    invalidReason: reason,
    normalized: validationInput.normalized,
    reason,
    stairMetadata: validationInput.stairMetadata,
    stepMetadata: validationInput.stepMetadata,
    validationInput,
    valid: reason === null
  };
}
