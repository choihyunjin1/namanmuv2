import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recommendAssets } from "../server/assetRecommendationEngine.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const housePromptInput = {
  prompt: "따뜻한 목재 느낌의 2층 단독주택",
  parcel: {
    maxBuildingCoverageRatio: 0.6,
    maxFloorAreaRatio: 1.0,
    zone: "제1종일반주거지역"
  },
  limit: 5
};

function assertSuccessfulRecommendationResponse(response) {
  assert.equal(response?.ok, true, "recommendAssets should return ok:true");
  assert.equal(typeof response.data, "object", "recommendAssets should return data");
  assert.ok(Array.isArray(response.data.recommendations), "data.recommendations should be an array");
  assert.equal(typeof response.data.constraints, "object", "data.constraints should describe applied constraints");
  assert.equal(typeof response.data.rationale, "object", "data.rationale should describe recommendation rationale");
}

function findNestedValueByKey(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.hasOwn(value, key)) return value[key];

  for (const nestedValue of Object.values(value)) {
    const match = findNestedValueByKey(nestedValue, key);
    if (match !== undefined) return match;
  }

  return undefined;
}

function assertNumericConstraint(constraints, key, expectedValue) {
  const actualValue = findNestedValueByKey(constraints, key);
  assert.equal(
    Number(actualValue),
    expectedValue,
    `constraints should reflect parcel.${key}`
  );
}

function recommendationFamilyText(recommendation) {
  const asset = recommendation.asset ?? {};
  const cost = asset.cost ?? {};
  const fit = recommendation.fit ?? {};

  return [
    asset.id,
    asset.assetSourceId,
    asset.type,
    asset.assetType,
    asset.category,
    asset.categoryId,
    asset.family,
    asset.role,
    cost.family,
    cost.role,
    fit.family,
    fit.assetFamily,
    fit.category,
    fit.type
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");
}

function isHouseShellRecommendation(recommendation) {
  const text = recommendationFamilyText(recommendation);
  return text.includes("house-shell") ||
    text.includes("detached-house") ||
    text.includes("whole-house");
}

function assertRecommendationShape(recommendation, index) {
  assert.equal(typeof recommendation, "object", `recommendations[${index}] should be an object`);
  assert.equal(typeof recommendation.asset, "object", `recommendations[${index}].asset should be an object`);
  assert.equal(typeof recommendation.score, "number", `recommendations[${index}].score should be numeric`);
  assert.equal(Number.isFinite(recommendation.score), true, `recommendations[${index}].score should be finite`);
  assert.ok(Array.isArray(recommendation.reasons), `recommendations[${index}].reasons should be an array`);
  assert.equal(recommendation.reasons.length > 0, true, `recommendations[${index}].reasons should not be empty`);
  assert.equal(Object.hasOwn(recommendation, "fit"), true, `recommendations[${index}] should expose fit`);

  const { asset } = recommendation;
  assert.equal(typeof asset.modelUrl, "string", `recommendations[${index}].asset.modelUrl should be a string`);
  assert.equal(asset.modelUrl.length > 0, true, `recommendations[${index}].asset.modelUrl should not be empty`);
  assert.equal(typeof asset.thumbnailSrc, "string", `recommendations[${index}].asset.thumbnailSrc should be a string`);
  assert.equal(asset.thumbnailSrc.length > 0, true, `recommendations[${index}].asset.thumbnailSrc should not be empty`);
  assert.equal(Object.hasOwn(asset, "cost"), true, `recommendations[${index}].asset should expose cost`);
  assert.ok(asset.cost && typeof asset.cost === "object", `recommendations[${index}].asset.cost should be an object`);
}

const response = await recommendAssets(housePromptInput, { rootDir: repoRoot });
assertSuccessfulRecommendationResponse(response);

const { recommendations, constraints } = response.data;
assert.equal(recommendations.length > 0, true, "house prompt should return recommendations");
assert.equal(
  recommendations.length <= housePromptInput.limit,
  true,
  "recommendations should respect input.limit"
);
assert.equal(
  recommendations.some(isHouseShellRecommendation),
  true,
  "house prompt should return at least one house-shell family candidate"
);

recommendations.forEach(assertRecommendationShape);

assertNumericConstraint(constraints, "maxBuildingCoverageRatio", housePromptInput.parcel.maxBuildingCoverageRatio);
assertNumericConstraint(constraints, "maxFloorAreaRatio", housePromptInput.parcel.maxFloorAreaRatio);
assert.equal(
  findNestedValueByKey(constraints, "zone"),
  housePromptInput.parcel.zone,
  "constraints should reflect parcel.zone"
);

const limitedResponse = await recommendAssets({ ...housePromptInput, limit: 2 }, { rootDir: repoRoot });
assertSuccessfulRecommendationResponse(limitedResponse);
assert.equal(limitedResponse.data.recommendations.length > 0, true, "limited request should return recommendations");
assert.equal(
  limitedResponse.data.recommendations.length <= 2,
  true,
  "recommendAssets should cap recommendations at the requested limit"
);

const koreanIntentFallbackResponse = await recommendAssets({
  limit: 3,
  parcel: housePromptInput.parcel,
  prompt: "모던 단독주택"
}, { rootDir: repoRoot });
assertSuccessfulRecommendationResponse(koreanIntentFallbackResponse);
assert.equal(
  koreanIntentFallbackResponse.data.recommendations.length > 0,
  true,
  "Korean intent prompts should fall back to catalog search terms and return recommendations"
);
assert.equal(
  koreanIntentFallbackResponse.data.search.usedQuery !== "모던 단독주택",
  true,
  "Korean intent fallback should expose the used catalog query"
);

console.log("asset recommendation OK");
