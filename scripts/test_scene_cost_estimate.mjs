import assert from "node:assert/strict";
import { summarizeSceneCostEstimate } from "../src/features/studioEditor/sceneCostEstimate.js";

const wallPanel = {
  categoryId: "wall-tool",
  id: "wall-panel-1",
  metadata: {
    cost: {
      costClass: "wall-panel",
      primary: {
        name: "경량기포콘크리트블록",
        sourceLabel: "조달청 건축자재",
        unit: "㎡",
        unitPriceKrw: 49326
      },
      quantityBasis: {
        method: "areaFromRuntimeBoundsXY",
        unit: "m2"
      },
      reviewStatus: "needs-quantity-review"
    },
    sourceAssetId: "component-wall-panel",
    sourceAssetLabel: "BIM Wall Panel"
  },
  name: "BIM Wall Panel 1",
  placementMode: "floor-free",
  size: [2, 3, 0.2]
};

const roomWithOpening = {
  id: "room-1",
  name: "Room 1",
  room: {
    openings: [
      {
        assetId: "window-wide",
        cost: {
          costClass: "glazing",
          primary: {
            name: "강화유리",
            unit: "㎡",
            unitPriceKrw: 39826
          },
          quantityBasis: {
            method: "openingArea",
            unit: "m2"
          },
          reviewStatus: "needs-quantity-review"
        },
        height: 1,
        id: "opening-1",
        label: "와이드 창",
        sourceAssetId: "component-window-wide",
        type: "window",
        width: 2
      }
    ]
  },
  size: [5, 2.7, 4],
  type: "room"
};

const unpricedObject = {
  id: "test-box",
  name: "Unpriced test box",
  size: [1, 1, 1]
};

const estimate = summarizeSceneCostEstimate([wallPanel, roomWithOpening, unpricedObject]);

assert.equal(estimate.schemaVersion, 1);
assert.equal(estimate.method, "rough-order-from-asset-cost-candidates");
assert.equal(estimate.currency, "KRW");
assert.equal(estimate.totalObjectCount, 4);
assert.equal(estimate.pricedObjectCount, 2);
assert.equal(estimate.unpricedObjectCount, 2);
assert.equal(estimate.estimatedTotalKrw, 375608);
assert.equal(estimate.rows.length, 2);
assert.equal(estimate.rows[0].quantity, 6);
assert.equal(estimate.rows[0].estimatedCostKrw, 295956);
assert.equal(estimate.rows[1].scope, "opening");
assert.equal(estimate.rows[1].hostId, "room-1");
assert.equal(estimate.rows[1].quantity, 2);
assert.equal(estimate.rows[1].estimatedCostKrw, 79652);
assert.deepEqual(
  estimate.byCostClass.map((item) => [item.costClass, item.estimatedCostKrw, item.itemCount]),
  [
    ["wall-panel", 295956, 1],
    ["glazing", 79652, 1]
  ]
);
assert.equal(estimate.limitations.some((line) => line.includes("rough-order")), true);

const emptyEstimate = summarizeSceneCostEstimate([]);
assert.equal(emptyEstimate.estimatedTotalKrw, 0);
assert.equal(emptyEstimate.totalObjectCount, 0);

console.log("scene cost estimate OK");
