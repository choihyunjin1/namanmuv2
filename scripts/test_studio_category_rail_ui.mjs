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

  const catalog = page.getByLabel("자산 카탈로그");
  const rail = page.getByLabel("자산 카테고리");
  await rail.waitFor({ state: "visible" });

  const wallButton = rail.locator('[data-category-id="wall-tool"]');
  const roofButton = rail.locator('[data-category-id="roof"]');
  const windowButton = rail.locator('[data-category-id="window"]');
  const doorButton = rail.locator('[data-category-id="door"]');

  await wallButton.waitFor({ state: "visible" });
  assert.equal(await wallButton.getAttribute("aria-pressed"), "true");
  assert.equal(Number(await wallButton.getAttribute("data-count")) > 0, true, "active category should expose count");
  assert.equal(Boolean(await wallButton.getAttribute("data-policy-badge")), true, "active category should expose policy badge");
  await page.locator(".studio-catalog-category-readout").getByText("벽 도구").waitFor({ state: "visible" });

  await roofButton.hover();
  await page.locator(".studio-catalog-category-readout").getByText("지붕").waitFor({ state: "visible" });
  assert.equal(Number(await roofButton.getAttribute("data-count")) > 0, true, "hovered category should expose count");
  assert.equal(Boolean(await roofButton.getAttribute("data-policy")), true, "hovered category should expose policy summary");

  await windowButton.click();
  assert.equal(await windowButton.getAttribute("aria-pressed"), "true");
  await page.locator(".studio-catalog-crumb").getByText("창문").waitFor({ state: "visible" });
  await page.locator(".studio-catalog-asset-card").filter({ hasText: "와이드 창" }).first().waitFor({ state: "visible" });

  await page.getByRole("button", { name: "카탈로그 접기" }).click();
  assert.equal(await catalog.getAttribute("data-collapsed"), "true");
  assert.equal(await windowButton.getAttribute("aria-pressed"), "true");
  assert.equal((await windowButton.getAttribute("class")).includes("is-rail-active"), true);
  assert.equal(await page.locator(".studio-catalog-browser").count(), 0, "collapsed rail should hide browser panel");

  await doorButton.click();
  assert.equal(await catalog.getAttribute("data-collapsed"), "false");
  assert.equal(await doorButton.getAttribute("aria-pressed"), "true");
  await page.locator(".studio-catalog-crumb").getByText("문").waitFor({ state: "visible" });

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during category rail smoke"
  );

  console.log("studio category rail UI OK");
} finally {
  await browser.close();
  await server.close();
}
