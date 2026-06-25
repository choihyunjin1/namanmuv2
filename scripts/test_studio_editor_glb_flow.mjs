import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";
import { normalizeStudioGlbCatalog } from "../src/features/studioEditor/studioGlbCatalog.js";

const STUDIO_EDITOR_STORAGE_KEY = "ploton:studio-editor:default";
const TARGET_SOURCE_ASSET_ID = "ac20-fzk-haus";

function createSmokeScenePayload(asset) {
  const size = asset.size ?? [8, 4.8, 7];
  const object = {
    id: "smoke-fzk-haus",
    type: "catalog-asset",
    assetId: asset.id,
    categoryId: asset.categoryId,
    color: asset.color,
    floor: 1,
    format: asset.format,
    metadata: {
      floorNumber: 1,
      modelUrl: asset.modelUrl,
      placementSource: "studio-glb-flow-smoke",
      previewQuality: asset.previewQuality,
      runtime: asset.runtime,
      source: "studio-glb-catalog",
      sourceAssetId: asset.assetSourceId ?? asset.id,
      sourceAssetLabel: asset.label,
      sourceAssetMetadata: asset.metadata,
      sourceLabel: asset.sourceLabel,
      sourceType: asset.sourceType
    },
    modelUrl: asset.modelUrl,
    name: "FZK Haus Smoke GLB",
    optimizedModelUrl: asset.optimizedModelUrl,
    originalModelUrl: asset.originalModelUrl,
    placementMode: asset.placementMode ?? "floor-free",
    position: [0, Number(((size[1] ?? 1) / 2).toFixed(3)), 0],
    rotation: [0, 0, 0],
    shape: asset.shape,
    size
  };

  return {
    activeCategoryId: asset.categoryId,
    activeFloor: 1,
    activeWorkflowMode: "build",
    cameraView: "orbit",
    catalogCollapsed: false,
    catalogWidth: 360,
    gridVisible: true,
    objects: [object],
    recentAssetIds: [asset.id],
    savedAt: "2026-06-25T00:00:00.000Z",
    schemaVersion: 2,
    snapEnabled: true,
    source: "ploton-studio-editor",
    wallViewMode: "cutaway"
  };
}

async function loadTargetAsset() {
  const rawCatalog = JSON.parse(
    await readFile(new URL("../public/assets/models/catalog.json", import.meta.url), "utf8")
  );
  const normalizedAssets = normalizeStudioGlbCatalog(rawCatalog);
  const asset = normalizedAssets.find((candidate) => candidate.assetSourceId === TARGET_SOURCE_ASSET_ID);

  assert.ok(asset, `Expected GLB catalog asset ${TARGET_SOURCE_ASSET_ID}`);
  assert.equal(asset.label, "FZK Haus");
  assert.match(asset.modelUrl, /\.glb$/);
  assert.ok(asset.thumbnailSrc, "FZK Haus should expose a thumbnail");

  return asset;
}

async function startViteServer() {
  const server = await createServer({
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false
    }
  });

  await server.listen();
  const address = server.httpServer?.address();
  assert.equal(typeof address, "object", "Vite server should expose a bound address");
  assert.ok(address?.port, "Vite server should bind an ephemeral port");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server
  };
}

function getPathname(url) {
  return new URL(url).pathname;
}

const asset = await loadTargetAsset();
const scenePayload = createSmokeScenePayload(asset);
const { baseUrl, server } = await startViteServer();
const browser = await chromium.launch({ headless: true });
const glbResponses = [];

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });

  await context.addInitScript(
    ({ key, payload }) => {
      window.localStorage.setItem(key, JSON.stringify(payload));
    },
    { key: STUDIO_EDITOR_STORAGE_KEY, payload: scenePayload }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  page.on("response", (response) => {
    if (getPathname(response.url()).endsWith(".glb")) {
      glbResponses.push({ status: response.status(), url: response.url() });
    }
  });

  const glbResponsePromise = page.waitForResponse(
    (response) => getPathname(response.url()) === asset.modelUrl && response.status() === 200,
    { timeout: 30_000 }
  );

  await page.goto(`${baseUrl}/studio-editor`, { waitUntil: "domcontentloaded" });

  const searchInput = page.getByLabel("자산 검색");
  await searchInput.fill("house");

  const houseCard = page
    .locator(".studio-catalog-asset-card")
    .filter({ hasText: /FZK Haus|TRELLIS\.2 House 01|BasicHouse/ })
    .first();
  await houseCard.waitFor({ state: "visible" });
  await houseCard.locator("img.studio-catalog-preview-thumb").first().waitFor({ state: "visible" });

  await page.locator(".studio-scene-outliner-row").filter({ hasText: "FZK Haus Smoke GLB" }).click();

  const selectionPanel = page.locator(".studio-editor-selection-panel");
  await selectionPanel.waitFor({ state: "visible" });
  const inspectorText = await selectionPanel.textContent();
  assert.ok(inspectorText?.includes("자산 출처"), "Inspector should show asset source");
  assert.ok(inspectorText?.includes("모델 파일"), "Inspector should show model file");
  assert.ok(inspectorText?.includes("파일 크기"), "Inspector should show file size");
  assert.ok(inspectorText?.includes("자산 품질"), "Inspector should show asset quality");
  const expectedModelFileName = asset.modelUrl.split("/").at(-1);
  assert.ok(expectedModelFileName?.endsWith(".glb"), "Expected model file should be a GLB");
  assert.ok(
    inspectorText?.includes(expectedModelFileName),
    `Inspector should show model file ${expectedModelFileName}`
  );

  const glbResponse = await glbResponsePromise;
  assert.equal(glbResponse.status(), 200);

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during the GLB smoke flow"
  );

  console.log(
    `studio editor GLB flow OK (${asset.label}, ${asset.modelUrl}, GLB ${glbResponse.status()})`
  );
} catch (error) {
  error.message = `${error.message}\nObserved GLB responses: ${JSON.stringify(glbResponses, null, 2)}`;
  throw error;
} finally {
  await browser.close();
  await server.close();
}
