const DEFAULT_CONSTRAINTS = {
  edgeMargin: 0.12,
  minHeight: 0.2,
  minWidth: 0.2,
  snapEnabled: true,
  snapStep: 0.5,
  wallHeight: 2.7,
  wallLength: 1
};

const METRIC_PRECISION = 100;
const WALL_TOLERANCE = 0.001;

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMetric(value) {
  return Math.round(value * METRIC_PRECISION) / METRIC_PRECISION;
}

function snapMetric(value, constraints) {
  if (!constraints.snapEnabled) return value;

  const snapStep = toFiniteNumber(constraints.snapStep, DEFAULT_CONSTRAINTS.snapStep);
  if (snapStep <= 0) return value;

  return Math.round(value / snapStep) * snapStep;
}

function clamp(value, min, max) {
  if (max < min) return max;
  return Math.min(max, Math.max(min, value));
}

function getConstraints(constraints = {}) {
  return {
    ...DEFAULT_CONSTRAINTS,
    ...constraints,
    edgeMargin: Math.max(0, toFiniteNumber(constraints.edgeMargin, DEFAULT_CONSTRAINTS.edgeMargin)),
    minHeight: Math.max(0, toFiniteNumber(constraints.minHeight, DEFAULT_CONSTRAINTS.minHeight)),
    minWidth: Math.max(0, toFiniteNumber(constraints.minWidth, DEFAULT_CONSTRAINTS.minWidth)),
    snapEnabled: constraints.snapEnabled ?? DEFAULT_CONSTRAINTS.snapEnabled,
    snapStep: toFiniteNumber(constraints.snapStep, DEFAULT_CONSTRAINTS.snapStep),
    wallHeight: Math.max(0, toFiniteNumber(constraints.wallHeight, DEFAULT_CONSTRAINTS.wallHeight)),
    wallLength: Math.max(0, toFiniteNumber(constraints.wallLength, DEFAULT_CONSTRAINTS.wallLength))
  };
}

function getOpeningType(opening) {
  return opening?.type ?? opening?.openingType ?? "window";
}

function getOpeningId(opening) {
  return opening?.id ?? opening?.openingId ?? null;
}

function getHorizontalRange(opening) {
  const offset = toFiniteNumber(opening?.offset, 0);
  const width = Math.max(0, toFiniteNumber(opening?.width, 0));
  return [offset - width / 2, offset + width / 2];
}

function getVerticalRange(opening) {
  const sillHeight = toFiniteNumber(opening?.sillHeight, 0);
  const height = Math.max(0, toFiniteNumber(opening?.height, 0));
  return [sillHeight, sillHeight + height];
}

function rangesOverlap(firstMin, firstMax, secondMin, secondMax) {
  return firstMin < secondMax - WALL_TOLERANCE && secondMin < firstMax - WALL_TOLERANCE;
}

function isOpeningInsideWall(opening, constraints) {
  const [minX, maxX] = getHorizontalRange(opening);
  const [minY, maxY] = getVerticalRange(opening);

  return (
    minX >= -constraints.wallLength / 2 + constraints.edgeMargin - WALL_TOLERANCE &&
    maxX <= constraints.wallLength / 2 - constraints.edgeMargin + WALL_TOLERANCE &&
    minY >= (getOpeningType(opening) === "door" ? 0 : constraints.edgeMargin) - WALL_TOLERANCE &&
    maxY <= constraints.wallHeight - constraints.edgeMargin + WALL_TOLERANCE &&
    opening.width >= constraints.minWidth - WALL_TOLERANCE &&
    opening.height >= constraints.minHeight - WALL_TOLERANCE
  );
}

export function normalizeOpeningPatch(opening = {}, patch = {}, constraints = {}) {
  const normalizedConstraints = getConstraints(constraints);
  const next = {
    ...opening,
    ...patch
  };
  const isDoor = getOpeningType(next) === "door";

  const maxWidth = Math.max(0, normalizedConstraints.wallLength - normalizedConstraints.edgeMargin * 2);
  const requestedWidth = snapMetric(
    toFiniteNumber(next.width, toFiniteNumber(opening.width, normalizedConstraints.minWidth)),
    normalizedConstraints
  );
  const width = roundMetric(clamp(requestedWidth, normalizedConstraints.minWidth, maxWidth));

  const minOffset = -normalizedConstraints.wallLength / 2 + width / 2 + normalizedConstraints.edgeMargin;
  const maxOffset = normalizedConstraints.wallLength / 2 - width / 2 - normalizedConstraints.edgeMargin;
  const requestedOffset = snapMetric(
    toFiniteNumber(next.offset, toFiniteNumber(opening.offset, 0)),
    normalizedConstraints
  );
  const offset = roundMetric(clamp(requestedOffset, minOffset, maxOffset));

  const minSillHeight = isDoor ? 0 : normalizedConstraints.edgeMargin;
  const maxHeight = Math.max(0, normalizedConstraints.wallHeight - normalizedConstraints.edgeMargin - minSillHeight);
  const requestedHeight = snapMetric(
    toFiniteNumber(next.height, toFiniteNumber(opening.height, normalizedConstraints.minHeight)),
    normalizedConstraints
  );
  const height = roundMetric(clamp(requestedHeight, normalizedConstraints.minHeight, maxHeight));

  const maxSillHeight = Math.max(minSillHeight, normalizedConstraints.wallHeight - height - normalizedConstraints.edgeMargin);
  const requestedSillHeight = isDoor
    ? 0
    : snapMetric(toFiniteNumber(next.sillHeight, toFiniteNumber(opening.sillHeight, minSillHeight)), normalizedConstraints);
  const sillHeight = roundMetric(isDoor ? 0 : clamp(requestedSillHeight, minSillHeight, maxSillHeight));

  return {
    ...next,
    height,
    offset,
    sillHeight,
    width
  };
}

export function validateOpeningPatch(hostOpenings = [], nextOpening = {}, movingOpeningId = null) {
  if (!Array.isArray(hostOpenings)) return true;

  const [nextMinX, nextMaxX] = getHorizontalRange(nextOpening);
  const [nextMinY, nextMaxY] = getVerticalRange(nextOpening);

  return !hostOpenings.some((opening) => {
    if (movingOpeningId != null && getOpeningId(opening) === movingOpeningId) return false;
    if (opening?.wall !== nextOpening?.wall) return false;

    const [openingMinX, openingMaxX] = getHorizontalRange(opening);
    const [openingMinY, openingMaxY] = getVerticalRange(opening);
    return (
      rangesOverlap(nextMinX, nextMaxX, openingMinX, openingMaxX) &&
      rangesOverlap(nextMinY, nextMaxY, openingMinY, openingMaxY)
    );
  });
}

export function applyOpeningPatch(opening = {}, patch = {}, constraints = {}, hostOpenings = []) {
  const normalizedConstraints = getConstraints(constraints);
  const nextOpening = normalizeOpeningPatch(opening, patch, normalizedConstraints);

  if (!isOpeningInsideWall(nextOpening, normalizedConstraints)) {
    return {
      opening: nextOpening,
      valid: false,
      invalidReason: "out-of-wall"
    };
  }

  if (!validateOpeningPatch(hostOpenings, nextOpening, getOpeningId(opening))) {
    return {
      opening: nextOpening,
      valid: false,
      invalidReason: "overlap"
    };
  }

  return {
    opening: nextOpening,
    valid: true,
    invalidReason: null
  };
}
