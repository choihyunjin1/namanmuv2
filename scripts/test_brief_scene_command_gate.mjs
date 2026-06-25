import assert from "node:assert/strict";
import {
  applyBriefSceneCommandPlan,
  createBriefScene
} from "../server/briefSceneGenerator.js";
import {
  assertValidBriefSceneCommandPlan,
  validateBriefSceneCommandPlan
} from "../server/briefSceneCommandValidation.js";
import { createBriefSceneCommandPlan } from "../server/briefSceneSemanticCommands.js";

const intent = {
  bedroomCount: 2,
  compact: false,
  floors: 2,
  garden: true,
  modern: true,
  style: "modern",
  warm: false
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const plan = createBriefSceneCommandPlan({
  brief: "모던 2층 주택",
  floorHeight: 2.7,
  intent,
  seed: "command-gate-test"
});

const validation = validateBriefSceneCommandPlan(plan);
assert.equal(validation.ok, true);
assert.equal(validation.commandCount, plan.commands.length);
assert.equal(validation.knownCommandCount, plan.commands.length);
assert.equal(validation.errorCount, 0);
assert.equal(assertValidBriefSceneCommandPlan(plan).ok, true);

const applied = applyBriefSceneCommandPlan(plan);
assert.equal(applied.validation.ok, true);
assert.equal(applied.objects.length > 0, true);
assert.equal(applied.objects.every((object) => object.metadata?.semanticCommandId), true);

const scene = createBriefScene({ brief: "모던 2층 주택" });
assert.equal(scene.decisionAudit.semanticCommandValidation.ok, true);
assert.equal(scene.decisionAudit.semanticCommandValidation.errorCount, 0);
assert.equal(scene.decisionAudit.semanticCommandValidation.commandCount, scene.decisionAudit.plannedActions.length);

const unknownType = clone(plan);
unknownType.commands[0].type = "spawn_castle";
assert.equal(validateBriefSceneCommandPlan(unknownType).ok, false);
assert.throws(
  () => assertValidBriefSceneCommandPlan(unknownType),
  (error) => error?.statusCode === 422 && error?.code === "BRIEF_COMMAND_PLAN_INVALID"
);

const duplicateId = clone(plan);
duplicateId.commands[1].id = duplicateId.commands[0].id;
assert.equal(validateBriefSceneCommandPlan(duplicateId).errors.some((error) => error.code === "duplicate-command-id"), true);

const missingRoofHost = clone(plan);
const roofCommand = missingRoofHost.commands.find((command) => command.type === "attach_roof");
roofCommand.hostRoomId = "missing-room";
assert.equal(validateBriefSceneCommandPlan(missingRoofHost).errors.some((error) => error.code === "invalid-roof-host"), true);

const invalidRoomSize = clone(plan);
invalidRoomSize.commands[0].size = [0, 2.7, 6];
assert.equal(validateBriefSceneCommandPlan(invalidRoomSize).errors.some((error) => error.code === "invalid-room-size"), true);

const invalidOpeningWall = clone(plan);
invalidOpeningWall.commands[0].openings[0].wall = "diagonal";
assert.equal(validateBriefSceneCommandPlan(invalidOpeningWall).errors.some((error) => error.code === "invalid-opening-wall"), true);

const summaryMismatch = clone(plan);
summaryMismatch.summary.commandCount += 1;
assert.equal(validateBriefSceneCommandPlan(summaryMismatch).errors.some((error) => error.code === "summary-command-count-mismatch"), true);

console.log("brief scene command gate OK");
