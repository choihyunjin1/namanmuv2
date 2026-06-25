import assert from "node:assert/strict";
import { createTextToCadJob } from "../server/textToCadGenerator.js";
import { createGeneratedCatalogAssetFromJob } from "../src/features/studioEditor/studioGeneratedAssetLibrary.js";

const job = createTextToCadJob({ prompt: "창문" });
const generatedAsset = createGeneratedCatalogAssetFromJob(job);

assert.ok(job.scenePlan && typeof job.scenePlan === "object", "Text-to-CAD job should expose scenePlan");
assert.ok(
  job.asset?.metadata?.scenePlanSummary && typeof job.asset.metadata.scenePlanSummary === "object",
  "Text-to-CAD job asset should expose scenePlanSummary metadata"
);
assert.ok(generatedAsset && typeof generatedAsset === "object", "Studio generated asset should be created from job");
assert.ok(generatedAsset.metadata && typeof generatedAsset.metadata === "object", "Generated asset should expose metadata");

assert.deepEqual(
  generatedAsset.metadata.scenePlan,
  job.scenePlan,
  "Generated asset metadata should preserve the full Text-to-CAD scenePlan"
);
assert.deepEqual(
  generatedAsset.metadata.scenePlanSummary,
  job.asset.metadata.scenePlanSummary,
  "Generated asset metadata should preserve the Text-to-CAD scenePlanSummary"
);

assert.equal(generatedAsset.categoryId, "window", "Window prompt should produce a window generated asset");
assert.equal(generatedAsset.placementMode, "wall-opening", "Window generated asset should remain wall-opening");
assert.equal(
  generatedAsset.metadata.scenePlan.asset.categoryId,
  generatedAsset.categoryId,
  "Preserved scenePlan should describe the generated asset category"
);
assert.equal(
  generatedAsset.metadata.scenePlanSummary.categoryId,
  generatedAsset.categoryId,
  "Preserved scenePlanSummary should describe the generated asset category"
);

console.log("studio generated scenePlan preservation OK");
