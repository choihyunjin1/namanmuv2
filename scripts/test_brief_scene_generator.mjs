import assert from "node:assert/strict";
import { createServer } from "vite";
import { createBriefScene } from "../server/briefSceneGenerator.js";

function assertBriefScene(scene, { floorCount, minRoomCount, minOpeningCount, originalBrief, sanitizedBrief, selectedTemplate }) {
  assert.equal(scene.source, "ploton-brief-scene");
  assert.equal(scene.activeWorkflowMode, "build");
  assert.equal(scene.cameraView, "orbit");
  assert.equal(Array.isArray(scene.objects), true);
  assert.equal(scene.summary.floorCount, floorCount);
  assert.equal(scene.summary.roomCount >= minRoomCount, true);
  assert.equal(scene.objects.some((object) => object.categoryId === "roof"), true);

  const rooms = scene.objects.filter((object) => object.type === "room");
  const openings = rooms.flatMap((room) => room.room?.openings ?? []);
  assert.equal(openings.length >= minOpeningCount, true);
  assert.equal(openings.some((opening) => opening.type === "door"), true);
  assert.equal(openings.some((opening) => opening.type === "window"), true);

  assert.equal(typeof scene.decisionAudit, "object");
  assert.equal(scene.decisionAudit.generatorVersion, "brief-scene-generator-v1");
  assert.equal(scene.decisionAudit.sanitizedBrief, sanitizedBrief ?? scene.summary.brief);
  assert.deepEqual(scene.decisionAudit.parsedIntent, scene.summary.intent);
  assert.deepEqual(scene.decisionAudit.generatedObjectIds, scene.objects.map((object) => object.id));
  assert.equal(Array.isArray(scene.decisionAudit.limitations), true);
  assert.equal(scene.decisionAudit.limitations.length > 0, true);
  assert.equal(typeof scene.decisionAudit.nextStep, "string");
  assert.equal(scene.decisionAudit.nextStep.length > 0, true);
  assert.equal(typeof scene.decisionAudit.selectedTemplate, "string");
  assert.equal(Array.isArray(scene.decisionAudit.plannedActions), true);
  assert.equal(scene.decisionAudit.plannedActions.length > 0, true);
  assert.equal(scene.decisionAudit.plannedActions.some((action) => action.type === "create_room_shell"), true);
  assert.equal(scene.decisionAudit.plannedActions.some((action) => action.type === "attach_roof"), true);
  assert.equal(typeof scene.decisionAudit.semanticCommandPlan, "object");
  assert.equal(scene.decisionAudit.semanticCommandPlan.source, "ploton-brief-semantic-command-plan");
  assert.equal(scene.decisionAudit.semanticCommandPlan.strategy, "pascal-style-tool-command-plan");
  assert.equal(typeof scene.decisionAudit.semanticCommandValidation, "object");
  assert.equal(scene.decisionAudit.semanticCommandValidation.ok, true);
  assert.equal(scene.decisionAudit.semanticCommandValidation.errorCount, 0);
  assert.equal(
    scene.decisionAudit.semanticCommandPlan.summary.commandCount,
    scene.decisionAudit.plannedActions.length
  );
  assert.equal(
    scene.decisionAudit.semanticCommandValidation.commandCount,
    scene.decisionAudit.plannedActions.length
  );
  assert.equal(
    scene.objects.some((object) => object.metadata?.semanticCommandId),
    true,
    "generated objects should keep semantic command trace metadata"
  );

  if (originalBrief) {
    assert.equal(scene.decisionAudit.originalBrief, originalBrief);
  }
  if (selectedTemplate) {
    assert.equal(scene.decisionAudit.selectedTemplate, selectedTemplate);
  }
}

assert.throws(
  () => createBriefScene({ brief: "   " }),
  (error) => error?.statusCode === 400
);

assertBriefScene(createBriefScene({ brief: "  모던   2층 단독주택 정원  " }), {
  floorCount: 2,
  minOpeningCount: 6,
  minRoomCount: 2,
  originalBrief: "  모던   2층 단독주택 정원  ",
  sanitizedBrief: "모던 2층 단독주택 정원",
  selectedTemplate: "two-story-house-with-garden"
});

assertBriefScene(createBriefScene({ brief: "작은 목재 스튜디오 주택" }), {
  floorCount: 1,
  minOpeningCount: 4,
  minRoomCount: 1,
  selectedTemplate: "compact-studio-house"
});

const server = await createServer({
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false
  }
});

try {
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${baseUrl}/api/scenes/from-brief`, {
    body: JSON.stringify({ brief: "정원이 있는 2층 가족 주택" }),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assertBriefScene(payload.data, {
    floorCount: 2,
    minOpeningCount: 6,
    minRoomCount: 2
  });

  assert.equal(typeof payload.data.assetRecommendations, "object");
  assert.equal(payload.data.assetRecommendations.method, "brief-slot-keyword-rag");
  assert.equal(Array.isArray(payload.data.assetRecommendations.attachedSlots), true);
  assert.equal(payload.data.assetRecommendations.attachedSlots.includes("house-shell"), true);
  assert.equal(payload.data.assetRecommendations.attachedSlots.includes("roof"), true);
  assert.equal(typeof payload.data.assetRecommendations.slots["house-shell"].recommendations[0].asset.id, "string");
  assert.equal(typeof payload.data.assetRecommendations.slots.roof.recommendations[0].asset.modelUrl, "string");
  assert.equal(typeof payload.data.decisionAudit.assetRecommendation, "object");
  assert.equal(payload.data.decisionAudit.assetRecommendation.method, "brief-slot-keyword-rag");

  const room = payload.data.objects.find((object) => object.type === "room");
  assert.equal(room.metadata.assetRecommendationSlots.includes("house-shell"), true);
  assert.equal(typeof room.metadata.recommendedAssets["house-shell"].asset.id, "string");
  assert.equal(typeof room.metadata.recommendedAssets["house-shell"].asset.modelUrl, "string");

  const openings = payload.data.objects.flatMap((object) => object.room?.openings ?? []);
  const recommendedDoor = openings.find((opening) => opening.type === "door" && opening.assetRecommendation);
  const recommendedWindow = openings.find((opening) => opening.type === "window" && opening.assetRecommendation);
  assert.equal(recommendedDoor.assetRecommendation.slot, "door");
  assert.equal(recommendedWindow.assetRecommendation.slot, "window");
  assert.equal(typeof recommendedDoor.assetRecommendation.asset.id, "string");
  assert.equal(typeof recommendedWindow.assetRecommendation.asset.thumbnailSrc, "string");
} finally {
  await server.close();
}

console.log("brief scene generator OK");
