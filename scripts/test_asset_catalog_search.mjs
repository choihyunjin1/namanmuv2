import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchAssetCatalog } from "../server/assetCatalogSearch.js";
import { STUDIO_CATALOG_CATEGORIES } from "../src/features/studioEditor/studioCatalog.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const costCatalogPath = path.join(repoRoot, "public", "assets", "models", "cost-catalog.json");
const costCatalog = JSON.parse(await readFile(costCatalogPath, "utf8"));
const costAssetIds = new Set((costCatalog.items ?? []).map((item) => item.assetId).filter(Boolean));
const studioCategoryIds = new Set(STUDIO_CATALOG_CATEGORIES.map((category) => category.id));
const disallowedCategoryIds = new Set(["house-shell", "local-asset", "site"]);

function assertSearchResult(query, response) {
  assert.equal(response.ok, true, `${query} search should succeed`);
  assert.equal(response.data.query, query);
  assert.equal(response.data.total > 0, true, `${query} search should return results`);
  assert.equal(response.data.results.length, response.data.total);

  let costBackedResultCount = 0;
  for (const result of response.data.results) {
    assert.equal(studioCategoryIds.has(result.categoryId), true, `${result.id} should use a Studio UI category`);
    assert.equal(disallowedCategoryIds.has(result.categoryId), false, `${result.id} should not expose ${result.categoryId}`);
    assert.equal(typeof result.modelUrl, "string", `${result.id} should expose modelUrl`);
    assert.equal(result.modelUrl.length > 0, true, `${result.id} should expose a non-empty modelUrl`);
    assert.equal(Object.hasOwn(result, "optimizedModelUrl"), true, `${result.id} should expose optimizedModelUrl`);
    assert.equal(Object.hasOwn(result, "originalModelUrl"), true, `${result.id} should expose originalModelUrl`);
    assert.equal(Object.hasOwn(result.runtime ?? {}, "sizeBytes"), true, `${result.id} should expose runtime.sizeBytes`);

    if (result.originalModelUrl) {
      assert.equal(result.modelUrl, result.originalModelUrl, `${result.id} should prefer originalModelUrl for modelUrl`);
    }

    if (costAssetIds.has(result.id)) {
      costBackedResultCount += 1;
      assert.ok(result.cost, `${result.id} has a cost catalog row and should expose cost`);
      assert.equal(result.cost.assetId, result.id, `${result.id} cost should match the asset id`);
    }
  }

  assert.equal(costBackedResultCount > 0, true, `${query} search should include cost-backed results`);
}

for (const query of ["door", "window", "house"]) {
  assertSearchResult(query, await searchAssetCatalog(query, { rootDir: repoRoot }));
}

const houseSearch = await searchAssetCatalog("house", { rootDir: repoRoot });
assert.equal(
  houseSearch.data.results.some((result) => result.type === "house-shell" && result.placementMode === "floor-free"),
  true,
  "house-shell assets should remain floor-free exterior preview assets"
);

console.log("asset catalog search OK");
