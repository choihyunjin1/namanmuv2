import assert from "node:assert/strict";
import { createServer } from "vite";

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

  const getResponse = await fetch(
    `${baseUrl}/api/assets/recommend?prompt=${encodeURIComponent("목재 느낌 2층 단독주택")}&zone=${encodeURIComponent("제1종일반주거지역")}&bcr=60&far=100&limit=3`
  );
  assert.equal(getResponse.status, 200, "GET /api/assets/recommend should return 200");
  const getPayload = await getResponse.json();
  assert.equal(getPayload.ok, true, "GET recommendation payload should be ok");
  assert.equal(getPayload.data.recommendations.length > 0, true, "GET should return recommendations");
  assert.equal(getPayload.data.recommendations.length <= 3, true, "GET should respect limit");
  assert.equal(getPayload.data.constraints.zone, "제1종일반주거지역", "GET should reflect zone");
  assert.equal(getPayload.data.constraints.maxBuildingCoverageRatio, 0.6, "GET should normalize BCR percent");
  assert.equal(getPayload.data.constraints.maxFloorAreaRatio, 1, "GET should normalize FAR percent");

  const postResponse = await fetch(`${baseUrl}/api/assets/recommend`, {
    body: JSON.stringify({
      limit: 2,
      parcel: {
        areaM2: 330,
        maxBuildingCoverageRatio: 0.5,
        maxFloorAreaRatio: 1.0,
        zone: "계획관리지역"
      },
      prompt: "모던한 주택 외관"
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  assert.equal(postResponse.status, 200, "POST /api/assets/recommend should return 200");
  const postPayload = await postResponse.json();
  assert.equal(postPayload.ok, true, "POST recommendation payload should be ok");
  assert.equal(postPayload.data.recommendations.length > 0, true, "POST should return recommendations");
  assert.equal(postPayload.data.recommendations.length <= 2, true, "POST should respect limit");
  assert.equal(postPayload.data.constraints.footprintLimitM2, 165, "POST should compute footprint limit");
  assert.equal(postPayload.data.constraints.floorAreaLimitM2, 330, "POST should compute floor area limit");
} finally {
  await server.close();
}

console.log("asset recommendation API OK");
