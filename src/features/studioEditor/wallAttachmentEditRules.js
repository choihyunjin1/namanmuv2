const DEFAULT_CONSTRAINTS = {
  edgeMargin: 0.08,
  maxDepth: 0.4,
  minDepth: 0.01,
  minHeight: 0.05,
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
    maxDepth: Math.max(0, toFiniteNumber(constraints.maxDepth, DEFAULT_CONSTRAINTS.maxDepth)),
    minDepth: Math.max(0, toFiniteNumber(constraints.minDepth, DEFAULT_CONSTRAINTS.minDepth)),
    minHeight: Math.max(0, toFiniteNumber(constraints.minHeight, DEFAULT_CONSTRAINTS.minHeight)),
    minWidth: Math.max(0, toFiniteNumber(constraints.minWidth, DEFAULT_CONSTRAINTS.minWidth)),
    snapEnabled: constraints.snapEnabled ?? DEFAULT_CONSTRAINTS.snapEnabled,
    snapStep: toFiniteNumber(constraints.snapStep, DEFAULT_CONSTRAINTS.snapStep),
    wallHeight: Math.max(0, toFiniteNumber(constraints.wallHeight, DEFAULT_CONSTRAINTS.wallHeight)),
    wallLength: Math.max(0, toFiniteNumber(constraints.wallLength, DEFAULT_CONSTRAINTS.wallLength))
  };
}

function getAttachmentId(attachment) {
  return attachment?.id ?? attachment?.attachmentId ?? null;
}

function getHorizontalRange(item) {
  const offset = toFiniteNumber(item?.offset, 0);
  const width = Math.max(0, toFiniteNumber(item?.width, 0));
  return [offset - width / 2, offset + width / 2];
}

function getAttachmentVerticalRange(attachment) {
  const centerY = toFiniteNumber(attachment?.centerY, 0);
  const height = Math.max(0, toFiniteNumber(attachment?.height, 0));
  return [centerY - height / 2, centerY + height / 2];
}

function getOpeningVerticalRange(opening) {
  const sillHeight = toFiniteNumber(opening?.sillHeight, 0);
  const height = Math.max(0, toFiniteNumber(opening?.height, 0));
  return [sillHeight, sillHeight + height];
}

function rangesOverlap(firstMin, firstMax, secondMin, secondMax) {
  return firstMin < secondMax - WALL_TOLERANCE && secondMin < firstMax - WALL_TOLERANCE;
}

function isAttachmentInsideWall(attachment, constraints) {
  const [minX, maxX] = getHorizontalRange(attachment);
  const [minY, maxY] = getAttachmentVerticalRange(attachment);

  return (
    minX >= -constraints.wallLength / 2 + constraints.edgeMargin - WALL_TOLERANCE &&
    maxX <= constraints.wallLength / 2 - constraints.edgeMargin + WALL_TOLERANCE &&
    minY >= constraints.edgeMargin - WALL_TOLERANCE &&
    maxY <= constraints.wallHeight - constraints.edgeMargin + WALL_TOLERANCE &&
    attachment.width >= constraints.minWidth - WALL_TOLERANCE &&
    attachment.height >= constraints.minHeight - WALL_TOLERANCE &&
    attachment.depth >= constraints.minDepth - WALL_TOLERANCE &&
    attachment.depth <= constraints.maxDepth + WALL_TOLERANCE
  );
}

export function normalizeWallAttachmentPatch(attachment = {}, patch = {}, constraints = {}) {
  const normalizedConstraints = getConstraints(constraints);
  const next = {
    ...attachment,
    ...patch
  };

  const maxWidth = Math.max(0, normalizedConstraints.wallLength - normalizedConstraints.edgeMargin * 2);
  const requestedWidth = snapMetric(
    toFiniteNumber(next.width, toFiniteNumber(attachment.width, normalizedConstraints.minWidth)),
    normalizedConstraints
  );
  const width = roundMetric(clamp(requestedWidth, normalizedConstraints.minWidth, maxWidth));

  const minOffset = -normalizedConstraints.wallLength / 2 + width / 2 + normalizedConstraints.edgeMargin;
  const maxOffset = normalizedConstraints.wallLength / 2 - width / 2 - normalizedConstraints.edgeMargin;
  const requestedOffset = snapMetric(
    toFiniteNumber(next.offset, toFiniteNumber(attachment.offset, 0)),
    normalizedConstraints
  );
  const offset = roundMetric(clamp(requestedOffset, minOffset, maxOffset));

  const maxHeight = Math.max(0, normalizedConstraints.wallHeight - normalizedConstraints.edgeMargin * 2);
  const requestedHeight = snapMetric(
    toFiniteNumber(next.height, toFiniteNumber(attachment.height, normalizedConstraints.minHeight)),
    normalizedConstraints
  );
  const height = roundMetric(clamp(requestedHeight, normalizedConstraints.minHeight, maxHeight));

  const minCenterY = height / 2 + normalizedConstraints.edgeMargin;
  const maxCenterY = normalizedConstraints.wallHeight - height / 2 - normalizedConstraints.edgeMargin;
  const requestedCenterY = snapMetric(
    toFiniteNumber(next.centerY, toFiniteNumber(attachment.centerY, minCenterY)),
    normalizedConstraints
  );
  const centerY = roundMetric(clamp(requestedCenterY, minCenterY, maxCenterY));

  const requestedDepth = toFiniteNumber(next.depth, toFiniteNumber(attachment.depth, normalizedConstraints.minDepth));
  const depth = roundMetric(clamp(requestedDepth, normalizedConstraints.minDepth, normalizedConstraints.maxDepth));

  return {
    ...next,
    centerY,
    depth,
    height,
    offset,
    width
  };
}

export function validateWallAttachmentPatch({ openings = [], attachments = [] } = {}, nextAttachment = {}, movingAttachmentId = null) {
  const [nextMinX, nextMaxX] = getHorizontalRange(nextAttachment);
  const [nextMinY, nextMaxY] = getAttachmentVerticalRange(nextAttachment);

  const overlapsOpening = Array.isArray(openings) && openings.some((opening) => {
    if (opening?.wall !== nextAttachment?.wall) return false;

    const [openingMinX, openingMaxX] = getHorizontalRange(opening);
    const [openingMinY, openingMaxY] = getOpeningVerticalRange(opening);
    return (
      rangesOverlap(nextMinX, nextMaxX, openingMinX, openingMaxX) &&
      rangesOverlap(nextMinY, nextMaxY, openingMinY, openingMaxY)
    );
  });

  if (overlapsOpening) return false;

  return !(Array.isArray(attachments) && attachments.some((attachment) => {
    if (movingAttachmentId != null && getAttachmentId(attachment) === movingAttachmentId) return false;
    if (attachment?.wall !== nextAttachment?.wall) return false;

    const [attachmentMinX, attachmentMaxX] = getHorizontalRange(attachment);
    const [attachmentMinY, attachmentMaxY] = getAttachmentVerticalRange(attachment);
    return (
      rangesOverlap(nextMinX, nextMaxX, attachmentMinX, attachmentMaxX) &&
      rangesOverlap(nextMinY, nextMaxY, attachmentMinY, attachmentMaxY)
    );
  }));
}

export function applyWallAttachmentPatch(attachment = {}, patch = {}, constraints = {}, hosted = {}) {
  const normalizedConstraints = getConstraints(constraints);
  const nextAttachment = normalizeWallAttachmentPatch(attachment, patch, normalizedConstraints);

  if (!isAttachmentInsideWall(nextAttachment, normalizedConstraints)) {
    return {
      attachment: nextAttachment,
      valid: false,
      invalidReason: "out-of-wall"
    };
  }

  if (!validateWallAttachmentPatch(hosted, nextAttachment, getAttachmentId(attachment))) {
    return {
      attachment: nextAttachment,
      valid: false,
      invalidReason: "overlap"
    };
  }

  return {
    attachment: nextAttachment,
    valid: true,
    invalidReason: null
  };
}
