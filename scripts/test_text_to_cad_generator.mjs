import assert from "node:assert/strict";
import {
  createTextToCadJob,
  listTextToCadJobs,
  readTextToCadJob,
  submitTextToCadJob
} from "../server/textToCadGenerator.js";

function assertStatusError(error, statusCode) {
  assert.equal(error?.statusCode, statusCode);
}

function normalizeType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function assertScenePlanContract(job, { label, categoryId, primitiveTypes = [] }) {
  assert.ok(job.scenePlan && typeof job.scenePlan === "object", `${label} job should expose scenePlan`);
  assert.equal(
    Number.isFinite(Number(job.scenePlan.schemaVersion)) && Number(job.scenePlan.schemaVersion) > 0,
    true,
    `${label} scenePlan should expose a positive schemaVersion`
  );
  assert.equal(job.scenePlan.units, "m", `${label} scenePlan should use meter units`);
  assert.ok(Array.isArray(job.scenePlan.primitives), `${label} scenePlan.primitives should be an array`);
  assert.equal(job.scenePlan.primitives.length > 0, true, `${label} scenePlan should contain primitives`);

  for (const [index, primitive] of job.scenePlan.primitives.entries()) {
    assert.equal(typeof primitive, "object", `${label} scenePlan.primitives[${index}] should be an object`);
    assert.equal(typeof primitive.type, "string", `${label} scenePlan.primitives[${index}].type should be a string`);
    assert.equal(primitive.type.length > 0, true, `${label} scenePlan.primitives[${index}].type should not be empty`);
    if (categoryId && primitive.categoryId != null) {
      assert.equal(
        primitive.categoryId,
        categoryId,
        `${label} scenePlan.primitives[${index}].categoryId should match the generated asset category`
      );
    }
  }

  if (categoryId) {
    assert.equal(job.asset.categoryId, categoryId, `${label} asset category should match the prompt intent`);
  }

  if (primitiveTypes.length) {
    const expectedTypes = new Set(primitiveTypes.map(normalizeType));
    const primitiveTypeMatches = job.scenePlan.primitives.some((primitive) =>
      [
        primitive.type,
        primitive.kind,
        primitive.categoryId,
        primitive.assetCategoryId,
        primitive.openingType,
        primitive.role
      ].some((candidate) => {
        const normalizedCandidate = normalizeType(candidate);
        if (!normalizedCandidate) return false;
        return [...expectedTypes].some((expectedType) =>
          normalizedCandidate === expectedType ||
          normalizedCandidate.includes(expectedType) ||
          expectedType.includes(normalizedCandidate)
        );
      })
    );
    assert.equal(
      primitiveTypeMatches,
      true,
      `${label} scenePlan should include a primitive type matching ${[...expectedTypes].join(" or ")}`
    );
  }

  assertScenePlanSummaryMetadata(job, { label, primitiveTypes });
}

function assertScenePlanSummaryMetadata(job, { label, primitiveTypes = [] }) {
  const metadata = job.asset?.metadata ?? {};
  const summary =
    metadata.scenePlanSummary ??
    metadata.cadamScenePlanSummary ??
    metadata.cadamPlanSummary ??
    metadata.primitiveSummary ??
    metadata.scenePlan ??
    job.scenePlanSummary ??
    job.scenePlan?.summary;

  if (summary == null) return;

  assert.equal(
    typeof summary === "string" || typeof summary === "object",
    true,
    `${label} scenePlan summary metadata should be a string or object`
  );

  const summaryText = typeof summary === "string" ? summary : JSON.stringify(summary);
  assert.equal(summaryText.length > 0, true, `${label} scenePlan summary metadata should not be empty`);

  const normalizedSummary = normalizeType(summaryText);
  const mentionsPlan =
    normalizedSummary.includes(normalizeType(job.asset.categoryId)) ||
    primitiveTypes.some((primitiveType) => normalizedSummary.includes(normalizeType(primitiveType))) ||
    normalizedSummary.includes(String(job.scenePlan.primitives.length));

  assert.equal(
    mentionsPlan,
    true,
    `${label} scenePlan summary metadata should mention the category, primitive type, or primitive count`
  );
}

assert.throws(
  () => createTextToCadJob({ prompt: " \n\t " }),
  (error) => {
    assertStatusError(error, 400);
    return true;
  },
  "empty prompts should fail with a 400 status"
);

const windowJob = createTextToCadJob({ prompt: "거실 벽에 넓은 창문 생성" });
assert.equal(windowJob.status, "ready");
assert.equal(windowJob.asset.categoryId, "window");
assert.equal(windowJob.asset.placementMode, "wall-opening");
assert.equal(windowJob.asset.openingType, "window");
assert.deepEqual(windowJob.asset.openingSize, [1.4, 1.1]);
assertScenePlanContract(windowJob, {
  categoryId: "window",
  label: "window",
  primitiveTypes: ["window", "window-glass", "window-frame"]
});

const doorJob = createTextToCadJob({ prompt: "현관에 목재 문 생성" });
assert.equal(doorJob.status, "ready");
assert.equal(doorJob.asset.categoryId, "door");
assert.equal(doorJob.asset.placementMode, "wall-opening");
assert.equal(doorJob.asset.openingType, "door");
assertScenePlanContract(doorJob, {
  categoryId: "door",
  label: "door",
  primitiveTypes: ["door", "door-panel", "door-handle"]
});

const stairsJob = createTextToCadJob({ prompt: "2층으로 올라가는 직선 계단 생성" });
assert.equal(stairsJob.status, "ready");
assert.equal(stairsJob.asset.categoryId, "stairs-ladder");
assert.equal(stairsJob.asset.placementMode, "floor-stair");
assert.equal(stairsJob.asset.shape, "stairs");
assertScenePlanContract(stairsJob, {
  categoryId: "stairs-ladder",
  label: "stairs",
  primitiveTypes: ["stairs-ladder", "stair", "stairs", "stair-flight", "stair-step", "staircase"]
});

const columnJob = createTextToCadJob({ prompt: "현관 옆에 구조 기둥 추가" });
assert.equal(columnJob.status, "ready");
assert.equal(columnJob.asset.categoryId, "column");
assert.equal(columnJob.asset.placementMode, "floor-structural");
assert.equal(columnJob.asset.supportKind, "column");
assertScenePlanContract(columnJob, {
  categoryId: "column",
  label: "column",
  primitiveTypes: ["column", "column-shaft"]
});

const wallJob = createTextToCadJob({ prompt: "거실과 주방 사이에 벽 생성" });
assert.equal(wallJob.status, "ready");
assert.equal(wallJob.asset.categoryId, "wall-tool");
assert.equal(wallJob.asset.placementMode, "floor-structural");
assert.equal(wallJob.asset.supportKind, "wall");
assertScenePlanContract(wallJob, {
  categoryId: "wall-tool",
  label: "wall",
  primitiveTypes: ["wall-tool", "wall", "wall-panel", "wall-segment", "partition-wall"]
});

const generalPrompt = `테스트용 자유 배치 CAD 자산 ${Date.now()}`;
const generalJob = createTextToCadJob({ prompt: generalPrompt });
assert.equal(generalJob.status, "ready");
assert.equal(generalJob.asset.sourceId, "generated");
assert.equal(generalJob.asset.id.startsWith(`generated-${generalJob.id}`), true);
assert.equal(generalJob.asset.librarySource, "generated");
assert.equal(generalJob.asset.engine, "cadam-compatible-text-to-cad");
assert.equal(generalJob.asset.cadScriptFormat, "openscad");
assert.equal(generalJob.engine.target, "cadam-compatible");
assert.equal(generalJob.engine.adapter, "ploton-text-to-cad");
assert.equal(generalJob.scad.includes("module ploton_generated_asset()"), true);
assert.equal(generalJob.scad.includes(generalPrompt), true);
assertScenePlanContract(generalJob, {
  categoryId: generalJob.asset.categoryId,
  label: "general"
});

const submittedJob = await submitTextToCadJob({ prompt: `${generalPrompt} submit/read/list` });
assert.equal(submittedJob.status, "ready");
assert.equal(submittedJob.asset.sourceId, "generated");
assertScenePlanContract(submittedJob, {
  categoryId: submittedJob.asset.categoryId,
  label: "submitted"
});

const readJob = await readTextToCadJob(submittedJob.id);
assert.deepEqual(readJob, submittedJob);

const listedJobs = await listTextToCadJobs();
assert.equal(Array.isArray(listedJobs), true);
assert.equal(
  listedJobs.some((job) => job.id === submittedJob.id),
  true,
  "listTextToCadJobs should include the newly submitted job"
);

console.log("text-to-cad generator OK");
