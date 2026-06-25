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
      activeCategoryId: "roof",
      activeFloor: 1,
      activeWorkflowMode: "build",
      cameraView: "orbit",
      gridVisible: true,
      objects: [],
      recentAssetIds: ["test-roof-gable", "test-wall-room"],
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

  const sourceTabs = page.locator(".studio-catalog-source-tabs");
  await sourceTabs.waitFor({ state: "visible" });
  const allTab = sourceTabs.getByRole("button", { name: /All/ });
  const generatedTab = sourceTabs.getByRole("button", { name: /Generated/ });
  await allTab.waitFor({ state: "visible" });
  assert.equal(await allTab.getAttribute("aria-pressed"), "true", "All source tab should be active initially");

  const allCountLabel = await allTab.locator("em").innerText();
  assert.equal(Number(allCountLabel) > 0, true, "All source tab should expose a positive asset count");

  const recentStrip = page.getByLabel("최근 사용 자산");
  await recentStrip.waitFor({ state: "visible" });
  await recentStrip.getByRole("button", { name: "박공지붕" }).click();

  const activeCard = page.locator(".studio-catalog-asset-card.is-active").first();
  await activeCard.waitFor({ state: "visible" });
  await activeCard.filter({ hasText: "박공지붕" }).waitFor({ state: "visible" });

  await generatedTab.click();
  assert.equal(await generatedTab.getAttribute("aria-pressed"), "true", "Generated tab should become active after click");
  assert.equal(
    await page.getByLabel("최근 사용 자산").count(),
    0,
    "Recent strip should respect source filtering and disappear when no recent generated assets exist"
  );

  await allTab.click();
  await recentStrip.waitFor({ state: "visible" });

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during source/recent catalog smoke"
  );

  console.log("studio catalog source/recent UI OK");
} finally {
  await browser.close();
  await server.close();
}
