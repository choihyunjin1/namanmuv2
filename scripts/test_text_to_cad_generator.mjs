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

const columnJob = createTextToCadJob({ prompt: "현관 옆에 구조 기둥 추가" });
assert.equal(columnJob.status, "ready");
assert.equal(columnJob.asset.categoryId, "column");
assert.equal(columnJob.asset.placementMode, "floor-structural");
assert.equal(columnJob.asset.supportKind, "column");

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

const submittedJob = await submitTextToCadJob({ prompt: `${generalPrompt} submit/read/list` });
assert.equal(submittedJob.status, "ready");
assert.equal(submittedJob.asset.sourceId, "generated");

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
