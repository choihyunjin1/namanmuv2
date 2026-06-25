import assert from "node:assert/strict";
import {
  assertValidCatalogPolicy,
  validateCatalogAsset,
  validateCatalogPolicy
} from "../src/features/studioEditor/catalogPolicyRules.js";
import {
  STUDIO_CATALOG_ASSETS,
  STUDIO_CATALOG_CATEGORIES
} from "../src/features/studioEditor/studioCatalog.js";

const catalogPolicy = validateCatalogPolicy(STUDIO_CATALOG_ASSETS, {
  categories: STUDIO_CATALOG_CATEGORIES
});
assert.deepEqual(catalogPolicy.issues, [], "studioCatalog assets should satisfy placement policy fields");
assert.equal(catalogPolicy.assetCount, STUDIO_CATALOG_ASSETS.length);
assert.equal(STUDIO_CATALOG_CATEGORIES.length, 14, "catalog should keep the Pascal-style build category rail");

const categoryCounts = STUDIO_CATALOG_CATEGORIES.reduce((counts, category) => {
  counts[category.id] = STUDIO_CATALOG_ASSETS.filter((asset) => asset.categoryId === category.id).length;
  return counts;
}, {});
const minimumCategoryCounts = {
  column: 3,
  door: 4,
  "exterior-trim": 3,
  gate: 3,
  railing: 4,
  roof: 4,
  "roof-decor": 3,
  "roof-pattern": 3,
  "roof-trim": 3,
  spandrel: 3,
  "stairs-ladder": 7,
  "wall-pattern": 5,
  "wall-tool": 23,
  window: 5
};
for (const [categoryId, minimumCount] of Object.entries(minimumCategoryCounts)) {
  assert.equal(
    categoryCounts[categoryId] >= minimumCount,
    true,
    `${categoryId} should expose at least ${minimumCount} selectable assets, saw ${categoryCounts[categoryId]}`
  );
}

assert.equal(catalogPolicy.summary.byPlacementMode["wall-opening"] >= 9, true);
assert.equal(catalogPolicy.summary.byPlacementMode["wall-attached"] >= 11, true);
assert.equal(catalogPolicy.summary.byPlacementMode["draw-wall"] >= 20, true);
assert.equal(catalogPolicy.summary.byPlacementMode["draw-room"], 1);
assert.equal(catalogPolicy.summary.byPlacementMode["floor-structural"] >= 5, true);
assert.equal(catalogPolicy.summary.byPlacementMode["floor-free"] >= 7, true);
assert.equal(catalogPolicy.summary.byPlacementMode["floor-stair"] >= 7, true);
assert.equal(catalogPolicy.summary.byPlacementMode["roof-attached"], 4);
assert.equal(catalogPolicy.summary.byPlacementMode["roof-accessory"] >= 9, true);
assert.equal(assertValidCatalogPolicy(STUDIO_CATALOG_ASSETS, { categories: STUDIO_CATALOG_CATEGORIES }).ok, true);

const validWallOpening = {
  id: "test-window",
  categoryId: "window",
  label: "Test Window",
  placementMode: "wall-opening",
  openingType: "window",
  openingSize: [1, 1],
  frameDepth: 0.18,
  size: [1, 1, 0.2]
};
assert.equal(validateCatalogAsset(validWallOpening).ok, true);

const invalidWallOpening = validateCatalogAsset({
  ...validWallOpening,
  frameDepth: 0,
  openingSize: undefined,
  openingType: ""
});
assert.equal(invalidWallOpening.ok, false);
assert.deepEqual(
  invalidWallOpening.issues.map((issue) => issue.code).sort(),
  ["invalid-frame-depth", "invalid-opening-size", "missing-field"].sort()
);

const invalidWallAttached = validateCatalogAsset({
  id: "bad-wall-tile",
  categoryId: "wall-pattern",
  label: "Bad Wall Tile",
  placementMode: "wall-attached",
  size: [1, 0.1, 1]
});
assert.equal(invalidWallAttached.ok, false);
assert.deepEqual(
  invalidWallAttached.issues.map((issue) => issue.code).sort(),
  ["invalid-attach-depth", "invalid-attachment-size"].sort()
);

const invalidDrawWall = validateCatalogAsset({
  id: "bad-wall",
  categoryId: "wall-tool",
  label: "Bad Wall",
  placementMode: "draw-wall",
  size: [1, 2.7, 0.16],
  wallHeight: 2.7
});
assert.equal(invalidDrawWall.ok, false);
assert.deepEqual(invalidDrawWall.issues.map((issue) => issue.field), ["wallThickness"]);

const invalidDrawRoom = validateCatalogAsset({
  id: "bad-room",
  categoryId: "wall-tool",
  label: "Bad Room",
  placementMode: "draw-room",
  size: [2, 2.7, 2],
  wallThickness: 0.16
});
assert.equal(invalidDrawRoom.ok, false);
assert.deepEqual(invalidDrawRoom.issues.map((issue) => issue.field), ["wallHeight"]);

const invalidRoof = validateCatalogAsset({
  id: "bad-roof",
  categoryId: "roof",
  label: "Bad Roof",
  placementMode: "roof-attached"
});
assert.equal(invalidRoof.ok, false);
assert.deepEqual(invalidRoof.issues.map((issue) => issue.field), ["size"]);

const invalidFloorAsset = validateCatalogAsset({
  id: "bad-floor",
  categoryId: "gate",
  label: "Bad Floor"
});
assert.equal(invalidFloorAsset.ok, false);
assert.deepEqual(invalidFloorAsset.issues.map((issue) => issue.field), ["size"]);

const invalidStairAsset = validateCatalogAsset({
  id: "bad-stair",
  categoryId: "stairs-ladder",
  label: "Bad Stair",
  placementMode: "floor-stair",
  size: [1, 1, 1],
  stairRise: 0.18,
  stepCount: 8
});
assert.equal(invalidStairAsset.ok, false);
assert.deepEqual(invalidStairAsset.issues.map((issue) => issue.field), ["stairRun"]);

const invalidCategory = validateCatalogAsset({
  id: "bad-category",
  categoryId: "window",
  label: "Bad Category",
  placementMode: "wall-attached",
  attachmentSize: [1, 1],
  attachDepth: 0.1,
  size: [1, 1, 0.1]
});
assert.equal(invalidCategory.ok, false);
assert.equal(invalidCategory.issues[0].code, "category-policy-mismatch");

assert.throws(
  () => assertValidCatalogPolicy([invalidWallAttached]),
  /Studio catalog policy failed/
);

console.log("studio editor catalog policy rules OK");
