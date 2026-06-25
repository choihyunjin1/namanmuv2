import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const STORAGE_KEY = "ploton:studio-editor:default";

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

const { baseUrl, server } = await startViteServer();
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  await context.addInitScript(({ storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({
      activeCategoryId: "wall-tool",
      activeFloor: 1,
      activeWorkflowMode: "build",
      cameraView: "orbit",
      gridVisible: true,
      objects: [],
      recentAssetIds: [],
      savedAt: "2026-06-25T00:00:00.000Z",
      schemaVersion: 2,
      snapEnabled: true,
      source: "ploton-studio-editor",
      wallViewMode: "cutaway"
    }));
  }, { storageKey: STORAGE_KEY });

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`${baseUrl}/studio-editor`, { waitUntil: "domcontentloaded" });

  const straightWallCard = page.locator(".studio-catalog-asset-card").filter({ hasText: "직선 벽" }).first();
  await straightWallCard.waitFor({ state: "visible" });
  assert.equal(await straightWallCard.getAttribute("data-action"), "click-tool");
  assert.equal(await straightWallCard.getAttribute("data-badge"), "draw");
  assert.equal(await straightWallCard.getAttribute("data-status"), "ready");
  assert.equal(await straightWallCard.getAttribute("draggable"), "false");
  await straightWallCard.click();
  assert.equal(await straightWallCard.getAttribute("aria-pressed"), "true", "draw wall card should become active after click");

  const curvedWallCard = page.locator(".studio-catalog-asset-card").filter({ hasText: "곡면 벽" }).first();
  await curvedWallCard.waitFor({ state: "visible" });
  assert.equal(await curvedWallCard.getAttribute("data-status"), "coming-soon");
  assert.equal(await curvedWallCard.getAttribute("aria-disabled"), "true");
  assert.equal(await curvedWallCard.isDisabled(), true, "coming-soon cards should be disabled");
  assert.match(await curvedWallCard.getAttribute("data-disabled-reason"), /곡면 벽/);

  const searchInput = page.getByLabel("자산 검색");
  await searchInput.fill("와이드 창");
  const wideWindowCard = page.locator(".studio-catalog-asset-card").filter({ hasText: "와이드 창" }).first();
  await wideWindowCard.waitFor({ state: "visible" });
  assert.equal(await wideWindowCard.getAttribute("data-action"), "drag-asset");
  assert.equal(await wideWindowCard.getAttribute("data-badge"), "opening");
  assert.equal(await wideWindowCard.getAttribute("draggable"), "true");
  assert.match(await wideWindowCard.getAttribute("data-policy"), /wall/);
  await wideWindowCard.locator(".studio-catalog-asset-meta-row small").first().waitFor({ state: "visible" });
  assert.equal(
    await wideWindowCard.locator(".studio-catalog-asset-meta-row small").first().innerText(),
    "창문",
    "search cards should show the category label as their primary meta"
  );

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during catalog card smoke"
  );

  console.log("studio catalog card UI OK");
} finally {
  await browser.close();
  await server.close();
}
