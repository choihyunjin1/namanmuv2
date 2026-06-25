import {
  normalizePlacementMode,
  PLACEMENT_MODE_POLICIES
} from "./placementRules.js";

const REQUIRED_COMMON_FIELDS = ["id", "categoryId", "label"];
const FLOOR_MODES = new Set(["floor-free", "floor-stair", "floor-structural"]);
const ROOF_MODES = new Set(["roof-attached", "roof-accessory"]);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function hasPositiveNumberArray(value, length) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(hasPositiveNumber)
  );
}

function addMissingTextIssues(issues, asset, fields) {
  fields.forEach((field) => {
    if (!hasText(asset?.[field])) {
      issues.push({
        assetId: asset?.id ?? null,
        code: "missing-field",
        field,
        message: `Catalog asset is missing ${field}.`
      });
    }
  });
}

function addSizeIssue(issues, asset, field, length, code = "invalid-size") {
  if (!hasPositiveNumberArray(asset?.[field], length)) {
    issues.push({
      assetId: asset?.id ?? null,
      code,
      field,
      message: `${field} must be an array of ${length} positive numbers.`
    });
  }
}

function addPositiveNumberIssue(issues, asset, field, code = "invalid-number") {
  if (!hasPositiveNumber(asset?.[field])) {
    issues.push({
      assetId: asset?.id ?? null,
      code,
      field,
      message: `${field} must be a positive number.`
    });
  }
}

export function validateCatalogAsset(asset, options = {}) {
  const issues = [];
  const placementMode = normalizePlacementMode(asset);
  const policy = PLACEMENT_MODE_POLICIES[placementMode];
  const categories = options.categories ?? [];

  addMissingTextIssues(issues, asset, REQUIRED_COMMON_FIELDS);

  if (!policy) {
    issues.push({
      assetId: asset?.id ?? null,
      code: "unknown-placement-mode",
      field: "placementMode",
      message: `Unknown placementMode ${placementMode}.`
    });
  } else if (hasText(asset?.categoryId) && policy.categories && !policy.categories.includes(asset.categoryId)) {
    issues.push({
      assetId: asset.id,
      code: "category-policy-mismatch",
      field: "categoryId",
      message: `${asset.categoryId} is not allowed for ${placementMode}.`
    });
  }

  if (categories.length > 0 && hasText(asset?.categoryId) && !categories.some((category) => category.id === asset.categoryId)) {
    issues.push({
      assetId: asset.id,
      code: "unknown-category",
      field: "categoryId",
      message: `${asset.categoryId} is not present in catalog categories.`
    });
  }

  if (placementMode === "wall-opening") {
    addMissingTextIssues(issues, asset, ["placementMode", "openingType"]);
    addSizeIssue(issues, asset, "openingSize", 2, "invalid-opening-size");
    addPositiveNumberIssue(issues, asset, "frameDepth", "invalid-frame-depth");
    addSizeIssue(issues, asset, "size", 3);
  } else if (placementMode === "wall-attached") {
    addMissingTextIssues(issues, asset, ["placementMode"]);
    addSizeIssue(issues, asset, "attachmentSize", 2, "invalid-attachment-size");
    addPositiveNumberIssue(issues, asset, "attachDepth", "invalid-attach-depth");
    addSizeIssue(issues, asset, "size", 3);
  } else if (placementMode === "draw-wall") {
    addMissingTextIssues(issues, asset, ["placementMode"]);
    addSizeIssue(issues, asset, "size", 3);
    addPositiveNumberIssue(issues, asset, "wallHeight");
    addPositiveNumberIssue(issues, asset, "wallThickness");
  } else if (placementMode === "draw-room") {
    addMissingTextIssues(issues, asset, ["placementMode"]);
    addSizeIssue(issues, asset, "size", 3);
    addPositiveNumberIssue(issues, asset, "wallHeight");
    addPositiveNumberIssue(issues, asset, "wallThickness");
  } else if (placementMode === "floor-stair") {
    addSizeIssue(issues, asset, "size", 3);
    addPositiveNumberIssue(issues, asset, "stairRise", "invalid-stair-rise");
    addPositiveNumberIssue(issues, asset, "stairRun", "invalid-stair-run");
    addPositiveNumberIssue(issues, asset, "stepCount", "invalid-step-count");
  } else if (ROOF_MODES.has(placementMode) || FLOOR_MODES.has(placementMode)) {
    addSizeIssue(issues, asset, "size", 3);
  }

  return {
    assetId: asset?.id ?? null,
    issues,
    ok: issues.length === 0,
    placementMode
  };
}

export function validateCatalogPolicy(assets = [], options = {}) {
  const results = assets.map((asset) => validateCatalogAsset(asset, options));
  const issues = results.flatMap((result) => result.issues);

  return {
    assetCount: assets.length,
    issues,
    ok: issues.length === 0,
    results,
    summary: results.reduce((summary, result) => {
      summary.byPlacementMode[result.placementMode] = (summary.byPlacementMode[result.placementMode] ?? 0) + 1;
      return summary;
    }, { byPlacementMode: {} })
  };
}

export function assertValidCatalogPolicy(assets = [], options = {}) {
  const result = validateCatalogPolicy(assets, options);
  if (!result.ok) {
    const details = result.issues
      .map((issue) => `${issue.assetId ?? "unknown"}:${issue.field}:${issue.code}`)
      .join(", ");
    throw new Error(`Studio catalog policy failed: ${details}`);
  }
  return result;
}
