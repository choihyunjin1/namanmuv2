import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false
  }
});

await server.listen();
const address = server.httpServer.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(30_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`${baseUrl}/studio-editor`, { waitUntil: "domcontentloaded" });

  const summary = page.getByLabel("자산 결과 요약");
  await summary.waitFor({ state: "visible" });
  await summary.getByText(/라이브러리|검색 결과/).waitFor({ state: "visible" });
  await summary.getByText(/자산/).waitFor({ state: "visible" });
  await summary.getByText("All", { exact: true }).waitFor({ state: "visible" });

  const assetGrid = page.getByLabel("카테고리 자산");
  await assetGrid.waitFor({ state: "visible" });
  assert.equal(await assetGrid.getAttribute("data-source"), "all");
  const gridColumnCount = await assetGrid.evaluate((node) =>
    window.getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length
  );
  assert.equal(gridColumnCount >= 2, true, "catalog assets should render as a multi-column items panel");

  await page.getByRole("button", { name: /Pascal/ }).click();
  assert.equal(await assetGrid.getAttribute("data-source"), "pascal");
  await summary.getByText("Pascal", { exact: true }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: /All/ }).click();
  assert.equal(await assetGrid.getAttribute("data-source"), "all");

  await page.getByLabel("자산 검색").fill("창문");
  await summary.getByText(/검색 결과/).waitFor({ state: "visible" });
  const aiTile = page.locator(".studio-catalog-ai-leading-tile");
  await aiTile.waitFor({ state: "visible" });
  const aiTileWidth = await aiTile.evaluate((node) => node.getBoundingClientRect().width);
  const normalCardWidth = await page.locator(".studio-catalog-asset-card:not(.studio-catalog-ai-leading-tile)").first()
    .evaluate((node) => node.getBoundingClientRect().width);
  assert.equal(aiTileWidth > normalCardWidth, true, "AI leading tile should read as a wider catalog action card");

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during catalog layout smoke"
  );
} finally {
  await browser.close();
  await server.close();
}

console.log("studio catalog layout UI OK");
