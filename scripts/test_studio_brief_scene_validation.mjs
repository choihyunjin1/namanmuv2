import assert from "node:assert/strict";
import { createBriefScene } from "../server/briefSceneGenerator.js";
import { validateBriefScenePayload } from "../src/features/studioEditor/studioBriefSceneValidation.js";

const validScene = createBriefScene({ brief: "모던 2층 단독주택 정원" });
const validation = validateBriefScenePayload(validScene);

assert.equal(validation.schemaVersion, 1);
assert.equal(validation.ok, true);
assert.equal(validation.issueCount, 0);
assert.equal(validation.checks.objectCount, validScene.objects.length);
assert.equal(validation.checks.uniqueObjectIdCount, validScene.objects.length);
assert.equal(validation.checks.commandCountMatches, true);
assert.equal(validation.checks.strategy, "pascal-style-tool-command-plan");

const duplicateScene = {
  ...validScene,
  objects: [
    validScene.objects[0],
    {
      ...validScene.objects[1],
      id: validScene.objects[0].id
    }
  ]
};
const duplicateValidation = validateBriefScenePayload(duplicateScene);
assert.equal(duplicateValidation.ok, false);
assert.equal(duplicateValidation.issues.some((issue) => issue.code === "duplicate-object-id"), true);

const invalidMetricScene = {
  ...validScene,
  objects: [
    {
      ...validScene.objects[0],
      position: [0, "bad", 0]
    }
  ]
};
const invalidMetricValidation = validateBriefScenePayload(invalidMetricScene);
assert.equal(invalidMetricValidation.ok, false);
assert.equal(invalidMetricValidation.issues.some((issue) => issue.code === "invalid-object-position"), true);

const invalidOpeningScene = {
  ...validScene,
  objects: [
    {
      ...validScene.objects[0],
      room: {
        ...validScene.objects[0].room,
        openings: [
          {
            ...validScene.objects[0].room.openings[0],
            wall: "diagonal"
          }
        ]
      }
    }
  ]
};
const invalidOpeningValidation = validateBriefScenePayload(invalidOpeningScene);
assert.equal(invalidOpeningValidation.ok, false);
assert.equal(invalidOpeningValidation.issues.some((issue) => issue.code === "invalid-opening-wall"), true);

const commandMismatchScene = {
  ...validScene,
  decisionAudit: {
    ...validScene.decisionAudit,
    semanticCommandPlan: {
      ...validScene.decisionAudit.semanticCommandPlan,
      summary: {
        ...validScene.decisionAudit.semanticCommandPlan.summary,
        commandCount: validScene.decisionAudit.plannedActions.length + 1
      }
    }
  }
};
const commandMismatchValidation = validateBriefScenePayload(commandMismatchScene);
assert.equal(commandMismatchValidation.ok, false);
assert.equal(commandMismatchValidation.issues.some((issue) => issue.code === "command-count-mismatch"), true);

const missingAuditScene = {
  objects: validScene.objects,
  source: "external-test"
};
const missingAuditValidation = validateBriefScenePayload(missingAuditScene);
assert.equal(missingAuditValidation.ok, true);
assert.equal(missingAuditValidation.warningCount, 0);

const invalidPayloadValidation = validateBriefScenePayload({ objects: null });
assert.equal(invalidPayloadValidation.ok, false);
assert.equal(invalidPayloadValidation.issues[0].code, "missing-objects");

console.log("studio brief scene validation OK");
