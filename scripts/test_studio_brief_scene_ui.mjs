import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

function getPathname(url) {
  return new URL(url).pathname;
}

const server = await createServer({
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false
  }
});

const prompt = "모던 2층 단독주택 정원";
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
  await page.getByLabel("자연어 3D 자산 생성").fill(prompt);

  const responsePromise = page.waitForResponse(
    (response) => getPathname(response.url()) === "/api/scenes/from-brief" && response.status() === 200
  );
  await page.locator(".studio-catalog-generator").getByRole("button", { name: "집 초안" }).click();
  const response = await responsePromise;
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.summary.floorCount, 2);
  assert.equal(payload.data.summary.roomCount, 2);
  assert.equal(payload.data.decisionAudit.semanticCommandValidation.ok, true);

  await page.getByText(/집 초안 생성 완료/).waitFor({ state: "visible" });
  const generationAudit = page.getByLabel("AI 생성 작업 내역");
  await generationAudit.waitFor({ state: "visible" });
  assert.equal(await page.locator(".studio-generation-audit").count(), 1);
  const generationAuditChips = generationAudit.locator(".studio-generation-audit-chips");
  assert.equal(await generationAuditChips.count(), 1);
  await generationAudit.getByText(/Plan/).waitFor({ state: "visible" });
  await generationAudit.getByText(/actions/).waitFor({ state: "visible" });
  await generationAudit.getByText(/pascal-style-tool-command-plan/).waitFor({ state: "visible" });
  await generationAudit.getByText("validated", { exact: true }).waitFor({ state: "visible" });
  await generationAudit.getByText(/count verified/).waitFor({ state: "visible" });
  await generationAudit.getByText(/command gate/).waitFor({ state: "visible" });
  await generationAudit.getByText(/scene validated/).waitFor({ state: "visible" });
  await generationAuditChips.getByText("2F", { exact: true }).waitFor({ state: "visible" });
  await generationAuditChips.getByText("2 rooms", { exact: true }).waitFor({ state: "visible" });
  await generationAudit.getByRole("listitem").filter({ hasText: "방" }).first().waitFor({ state: "visible" });
  await generationAudit.getByRole("listitem").filter({ hasText: "지붕" }).first().waitFor({ state: "visible" });
  await generationAudit.getByText(/asset slots/).waitFor({ state: "visible" });
  await page.getByText("1층 생활공간").waitFor({ state: "visible" });
  await page.getByText("2침실 상부 매스").waitFor({ state: "visible" });

  await page.getByLabel("씬 아웃라이너").getByRole("button", { name: /1층 생활공간/ }).first().click();
  const selectionRecommendationPanel = page.getByLabel("선택 항목 추천 자산");
  await selectionRecommendationPanel.waitFor({ state: "visible" });
  await selectionRecommendationPanel.getByText(/RAG 추천 자산/).waitFor({ state: "visible" });
  const firstRecommendedAssetButton = selectionRecommendationPanel.getByRole("button").first();
  const firstRecommendedAssetLabel = await firstRecommendedAssetButton.locator("span").innerText();
  await firstRecommendedAssetButton.click();
  await page.locator(".studio-editor-statusbar").getByText(firstRecommendedAssetLabel).waitFor({ state: "visible" });

  const catalogBrief = "카탈로그 검색형 모던 단층 주택";
  await page.getByLabel("자산 검색").fill(catalogBrief);
  const catalogAiTile = page.locator(".studio-catalog-ai-leading-tile");
  await catalogAiTile.waitFor({ state: "visible" });
  assert.match(await catalogAiTile.getAttribute("aria-label"), new RegExp(catalogBrief));
  assert.match(await catalogAiTile.getAttribute("title"), /semantic command plan/);
  const catalogAiTileBadges = catalogAiTile.getByLabel("최근 AI 생성 검증 상태");
  await catalogAiTileBadges.getByText(/actions/).waitFor({ state: "visible" });
  await catalogAiTileBadges.getByText(/scene ok/).waitFor({ state: "visible" });
  await catalogAiTileBadges.getByText(/slots/).waitFor({ state: "visible" });

  const catalogTileResponsePromise = page.waitForResponse(
    (response) => getPathname(response.url()) === "/api/scenes/from-brief" && response.status() === 200
  );
  await catalogAiTile.click();
  const catalogTileResponse = await catalogTileResponsePromise;
  const catalogTilePayload = await catalogTileResponse.json();
  assert.equal(catalogTilePayload.ok, true);
  assert.equal(catalogTilePayload.data.summary.floorCount, 1);
  assert.equal(
    catalogTilePayload.data.decisionAudit.semanticCommandPlan.strategy,
    "pascal-style-tool-command-plan"
  );
  assert.equal(catalogTilePayload.data.decisionAudit.semanticCommandValidation.ok, true);
  await page.getByText(/집 초안 생성 완료/).waitFor({ state: "visible" });

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during the brief scene flow"
  );
} finally {
  await browser.close();
  await server.close();
}

console.log("studio brief scene UI OK");
