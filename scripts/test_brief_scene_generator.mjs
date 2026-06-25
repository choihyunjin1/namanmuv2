import assert from "node:assert/strict";
import { createServer } from "vite";
import { createBriefScene } from "../server/briefSceneGenerator.js";

function assertBriefScene(scene, { floorCount, minRoomCount, minOpeningCount }) {
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
}

assert.throws(
  () => createBriefScene({ brief: "   " }),
  (error) => error?.statusCode === 400
);

assertBriefScene(createBriefScene({ brief: "모던 2층 단독주택 정원" }), {
  floorCount: 2,
  minOpeningCount: 6,
  minRoomCount: 2
});

assertBriefScene(createBriefScene({ brief: "작은 목재 스튜디오 주택" }), {
  floorCount: 1,
  minOpeningCount: 4,
  minRoomCount: 1
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
} finally {
  await server.close();
}

console.log("brief scene generator OK");
