import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.setDefaultTimeout(30_000);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`${baseUrl}/studio-editor`, { waitUntil: "domcontentloaded" });

  const naturalLanguageInput = page.getByLabel("자연어 3D 자산 생성");
  const recommendationPanel = page.locator('[aria-label="프롬프트와 토지조건 기반 추천 자산"]');
  await recommendationPanel.waitFor({ state: "visible" });

  const initialRecommendButton = recommendationPanel.getByRole("button", { name: "추천" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "idle");
  assert.equal(await initialRecommendButton.isDisabled(), true, "recommend button should be disabled without prompt");

  let releaseEmptyResponse;
  await page.route("**/api/assets/recommend", async (route) => {
    await new Promise((resolve) => {
      releaseEmptyResponse = resolve;
    });
    await route.fulfill({
      body: JSON.stringify({
        data: {
          rationale: { summary: "" },
          recommendations: []
        },
        ok: true
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await naturalLanguageInput.fill("empty 추천 상태");
  await recommendationPanel.getByRole("button", { name: "추천" }).click();
  await recommendationPanel.getByText("프롬프트/토지조건 기반 추천 중").waitFor({ state: "visible" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "loading");
  assert.equal(await recommendationPanel.getByRole("button", { name: "추천중" }).isDisabled(), true);

  releaseEmptyResponse();
  await recommendationPanel.getByText("추천 결과 없음 · 기존 카탈로그 사용 가능").waitFor({ state: "visible" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "empty");
  assert.equal(await recommendationPanel.locator(".studio-catalog-recommendation-result").count(), 0);

  await page.unroute("**/api/assets/recommend");
  await page.route("**/api/assets/recommend", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          rationale: { summary: "mock recommendation" },
          recommendations: [
            {
              asset: {
                id: "mock-priced-wall",
                label: "Mock 견적 외벽",
                categoryId: "wall-pattern",
                cost: {
                  catalogStatus: "priced-candidate",
                  primary: {
                    classificationName: "경량기포콘크리트패널",
                    sourceLabel: "조달청_나라장터 가격정보현황서비스 / 시설공통자재(건축)",
                    unit: "㎡",
                    unitPriceKrw: 49326
                  }
                },
                placementMode: "wall-attached",
                previewMaterialLabel: "wall-panel",
                previewQuality: "component",
                sourceType: "ifc"
              },
              reasons: ["가격 후보와 외벽 자산 메타데이터가 일치"],
              score: 93.734
            }
          ]
        },
        ok: true
      }),
      contentType: "application/json",
      status: 200
    });
  });

  await naturalLanguageInput.fill("priced 추천 상태");
  await recommendationPanel.getByRole("button", { name: "추천" }).click();
  await recommendationPanel.getByText("1개 추천 · 프롬프트/토지조건 기반").waitFor({ state: "visible" });
  const pricedResult = recommendationPanel.locator(".studio-catalog-recommendation-result").first();
  await pricedResult.waitFor({ state: "visible" });
  assert.match(await pricedResult.textContent(), /Mock 견적 외벽/);
  assert.match(await pricedResult.textContent(), /score 93\.73/);
  assert.match(await pricedResult.textContent(), /₩49,326\/㎡/);
  assert.match(await pricedResult.textContent(), /조달청/);
  assert.match(await pricedResult.textContent(), /경량기포콘크리트패널/);
  assert.match(await pricedResult.getAttribute("title"), /가격 후보와 외벽 자산 메타데이터가 일치/);
  const pricedCatalogCard = page
    .getByLabel("카테고리 자산")
    .locator('.studio-catalog-asset-card[data-recommendation="true"]')
    .filter({ hasText: "Mock 견적 외벽" })
    .first();
  await pricedCatalogCard.waitFor({ state: "visible" });
  assert.equal(await pricedCatalogCard.getAttribute("data-action"), "drag-asset");
  assert.equal(await pricedCatalogCard.getAttribute("draggable"), "true");
  assert.match(await pricedCatalogCard.textContent(), /RAG 추천/);
  assert.match(await pricedCatalogCard.getAttribute("title"), /prompt: priced 추천 상태/);

  await page.unroute("**/api/assets/recommend");
  await page.route("**/api/assets/recommend", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ message: "mock failure", ok: false }),
      contentType: "application/json",
      status: 200
    });
  });

  await naturalLanguageInput.fill("offline 추천 상태");
  await recommendationPanel.getByRole("button", { name: "추천" }).click();
  await recommendationPanel.getByText("추천 API offline · 기존 카탈로그 사용 가능").waitFor({ state: "visible" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "offline");
  assert.equal(await recommendationPanel.locator(".studio-catalog-recommendation-result").count(), 0);

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during recommendation strip state smoke"
  );

  console.log("studio asset recommendation strip states UI OK");
} finally {
  await browser.close();
  await server.close();
}
