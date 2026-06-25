const DEFAULT_OPTIONS = {
  maxThickness: 0.6,
  minHeight: 0.5,
  minLength: 0.5,
  minThickness: 0.08,
  snapEnabled: true,
  snapStep: 0.5
};

const METRIC_PRECISION = 100;
const ORIENTATION_TOLERANCE = 0.001;

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMetric(value) {
  return Math.round(value * METRIC_PRECISION) / METRIC_PRECISION;
}

function clamp(value, min, max) {
  if (max < min) return max;
  return Math.min(max, Math.max(min, value));
}

function snapMetric(value, options) {
  if (!options.snapEnabled) return value;

  const snapStep = toFiniteNumber(options.snapStep, DEFAULT_OPTIONS.snapStep);
  if (snapStep <= 0) return value;

  return Math.round(value / snapStep) * snapStep;
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    maxThickness: Math.max(0, toFiniteNumber(options.maxThickness, DEFAULT_OPTIONS.maxThickness)),
    minHeight: Math.max(0, toFiniteNumber(options.minHeight, DEFAULT_OPTIONS.minHeight)),
    minLength: Math.max(0, toFiniteNumber(options.minLength, DEFAULT_OPTIONS.minLength)),
    minThickness: Math.max(0, toFiniteNumber(options.minThickness, DEFAULT_OPTIONS.minThickness)),
    snapEnabled: options.snapEnabled ?? DEFAULT_OPTIONS.snapEnabled,
    snapStep: toFiniteNumber(options.snapStep, DEFAULT_OPTIONS.snapStep)
  };
}

function hasPatchValue(patch, key) {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function getWallOrientation(wall) {
  if (wall?.wallOrientation === "z" || wall?.metadata?.wallOrientation === "z") return "z";
  if (wall?.wallOrientation === "x" || wall?.metadata?.wallOrientation === "x") return "x";

  const rotationY = wall?.rotation?.[1] ?? 0;
  const normalized = ((rotationY % Math.PI) + Math.PI) % Math.PI;
  return Math.abs(normalized - Math.PI / 2) <= ORIENTATION_TOLERANCE ? "z" : "x";
}

function normalizePatchedMetric(patch, key, fallback, options) {
  const value = toFiniteNumber(hasPatchValue(patch, key) ? patch[key] : fallback, fallback);
  return hasPatchValue(patch, key) ? snapMetric(value, options) : value;
}

export function normalizeWallSegmentPatch(wall = {}, patch = {}, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const orientation = getWallOrientation(wall);
  const [x = 0, y = 0, z = 0] = wall.position ?? [0, 0, 0];
  const [currentLength = 1, currentHeight = 1, currentThickness = normalizedOptions.minThickness] = wall.size ?? [];
  const currentCenterU = orientation === "x" ? x : z;
  const currentCross = orientation === "x" ? z : x;

  const length = roundMetric(
    clamp(
      normalizePatchedMetric(patch, "length", currentLength, normalizedOptions),
      normalizedOptions.minLength,
      Number.POSITIVE_INFINITY
    )
  );
  const height = roundMetric(
    clamp(
      normalizePatchedMetric(patch, "height", currentHeight, normalizedOptions),
      normalizedOptions.minHeight,
      Number.POSITIVE_INFINITY
    )
  );
  const thickness = roundMetric(
    clamp(
      normalizePatchedMetric(patch, "thickness", currentThickness, normalizedOptions),
      normalizedOptions.minThickness,
      normalizedOptions.maxThickness
    )
  );
  const centerU = roundMetric(normalizePatchedMetric(patch, "centerU", currentCenterU, normalizedOptions));
  const cross = roundMetric(normalizePatchedMetric(patch, "cross", currentCross, normalizedOptions));

  return {
    ...wall,
    metadata: {
      ...(wall.metadata ?? {}),
      length,
      wallOrientation: orientation
    },
    position: orientation === "x" ? [centerU, y, cross] : [cross, y, centerU],
    rotation: orientation === "x" ? [0, 0, 0] : [0, Math.PI / 2, 0],
    size: [length, height, thickness],
    wallOrientation: orientation
  };
}
