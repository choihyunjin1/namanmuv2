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

  const header = page.locator(".studio-catalog-context-header");
  const policyRow = page.locator(".studio-catalog-policy-row");
  const searchInput = page.getByLabel("자산 검색");
  await header.waitFor({ state: "visible" });

  await header.getByText("지붕").waitFor({ state: "visible" });
  assert.match(await header.locator(".studio-catalog-context-title span").innerText(), /\d+ items/);
  assert.match(await policyRow.getAttribute("aria-label"), /배치 정책/);
  assert.match(await policyRow.locator(".studio-catalog-policy-count").innerText(), /\d+ assets/);
  assert.equal(Boolean(await policyRow.locator(".studio-catalog-policy-badge").innerText()), true);
  assert.equal(Boolean(await policyRow.locator(".studio-catalog-policy-summary").innerText()), true);

  await searchInput.fill("와이드 창");
  await header.getByText("전체 검색").waitFor({ state: "visible" });
  await page.locator(".studio-catalog-asset-card").filter({ hasText: "와이드 창" }).first().waitFor({ state: "visible" });
  assert.equal(await searchInput.inputValue(), "와이드 창");

  await page.route("**/api/assets/search?**", (route) => route.abort("failed"));
  await searchInput.fill("offline-probe");
  await page.getByText("asset API offline").waitFor({ state: "visible" });
  await header.getByText("전체 검색").waitFor({ state: "visible" });

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during catalog search header smoke"
  );

  console.log("studio catalog search header UI OK");
} finally {
  await browser.close();
  await server.close();
}
