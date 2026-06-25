import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeStudioGlbCatalog } from "../src/features/studioEditor/studioGlbCatalog.js";
import { STUDIO_CATALOG_CATEGORIES } from "../src/features/studioEditor/studioCatalog.js";

const rawCatalog = JSON.parse(
  await readFile(new URL("../public/assets/models/catalog.json", import.meta.url), "utf8")
);
const normalizedAssets = normalizeStudioGlbCatalog(rawCatalog);
const assetsBySourceId = new Map(normalizedAssets.map((asset) => [asset.assetSourceId, asset]));
const categoryIds = new Set(STUDIO_CATALOG_CATEGORIES.map((category) => category.id));

assert.equal(
  normalizedAssets.length >= 40,
  true,
  `GLB catalog should normalize at least 40 assets, saw ${normalizedAssets.length}`
);

for (const asset of normalizedAssets) {
  const sourceAsset = rawCatalog.assets.find((candidate) => candidate.id === asset.assetSourceId);
  assert.equal(typeof asset.modelUrl, "string", `${asset.id} should include modelUrl`);
  assert.equal(asset.modelUrl.length > 0, true, `${asset.id} modelUrl should not be empty`);
  if (sourceAsset?.optimizedUrl) {
    assert.equal(asset.modelUrl, sourceAsset.optimizedUrl, `${asset.id} should prefer optimized GLB runtime URL`);
  }
  assert.equal(typeof asset.thumbnailSrc, "string", `${asset.id} should include thumbnailSrc`);
  assert.equal(asset.thumbnailSrc.length > 0, true, `${asset.id} thumbnailSrc should not be empty`);
  assert.equal(typeof asset.categoryId, "string", `${asset.id} should include categoryId`);
  assert.equal(categoryIds.has(asset.categoryId), true, `${asset.id} categoryId should be a studio category`);
  assert.equal(typeof asset.placementMode, "string", `${asset.id} should include placementMode`);
  assert.equal(asset.placementMode.length > 0, true, `${asset.id} placementMode should not be empty`);
  assert.equal(Array.isArray(asset.size), true, `${asset.id} should include size`);
  assert.equal(asset.size.length, 3, `${asset.id} size should have 3 dimensions`);
  for (const [index, dimension] of asset.size.entries()) {
    assert.equal(
      Number.isFinite(dimension) && dimension > 0,
      true,
      `${asset.id} size[${index}] should be a positive finite number`
    );
  }
}

const houseShellSources = rawCatalog.assets.filter((asset) => asset.type === "house-shell");
assert.equal(houseShellSources.length > 0, true, "catalog should include house-shell source assets");
for (const sourceAsset of houseShellSources) {
  const normalized = assetsBySourceId.get(sourceAsset.id);
  assert.ok(normalized, `${sourceAsset.id} should normalize to a studio GLB asset`);
  assert.equal(normalized.categoryId, "wall-tool", `${sourceAsset.id} should map to wall-tool`);
  assert.equal(normalized.placementMode, "floor-free", `${sourceAsset.id} should map to floor-free`);
}

const openingPreviewSources = rawCatalog.assets.filter(
  (asset) => asset.type === "component" && (asset.componentKind === "window" || asset.componentKind === "door")
);
assert.equal(openingPreviewSources.length > 0, true, "catalog should include window/door component source assets");
for (const sourceAsset of openingPreviewSources) {
  const normalized = assetsBySourceId.get(sourceAsset.id);
  assert.ok(normalized, `${sourceAsset.id} should normalize to a studio GLB asset`);
  assert.equal(
    normalized.categoryId,
    sourceAsset.componentKind,
    `${sourceAsset.id} should keep its component category`
  );
  assert.equal(normalized.placementMode, "floor-free", `${sourceAsset.id} should stay a floor-free preview asset`);
  assert.equal(normalized.format, "glb", `${sourceAsset.id} should remain a GLB asset`);
  assert.equal(normalized.modelUrl.endsWith(".glb"), true, `${sourceAsset.id} should use a GLB model URL`);
  assert.equal(
    Object.hasOwn(normalized, "openingType"),
    false,
    `${sourceAsset.id} should not be promoted to a wall opening asset yet`
  );
}

console.log(`studio GLB catalog normalization OK (${normalizedAssets.length} assets)`);
