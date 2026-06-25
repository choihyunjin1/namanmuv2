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

function getPathname(url) {
  return new URL(url).pathname;
}

const prompt = "모던 단독주택";
const { baseUrl, server } = await startViteServer();
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(`${baseUrl}/studio-editor`, { waitUntil: "domcontentloaded" });

  const naturalLanguageInput = page.getByLabel("자연어 3D 자산 생성");
  await naturalLanguageInput.waitFor({ state: "visible" });
  await naturalLanguageInput.fill(prompt);

  const recommendationPanel = page.locator('[aria-label="프롬프트와 토지조건 기반 추천 자산"]');
  await recommendationPanel.waitFor({ state: "visible" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "idle");
  assert.match(await recommendationPanel.getAttribute("title"), /토지조건:/);

  const recommendationResponsePromise = page.waitForResponse(
    (response) => getPathname(response.url()) === "/api/assets/recommend" && response.status() === 200,
    { timeout: 30_000 }
  );

  await recommendationPanel.getByRole("button", { name: "추천" }).click();
  const recommendationResponse = await recommendationResponsePromise;
  const payload = await recommendationResponse.json();
  assert.equal(payload?.ok, true, "asset recommendation API response should be ok");
  assert.equal(
    Array.isArray(payload?.data?.recommendations) && payload.data.recommendations.length > 0,
    true,
    "asset recommendation API should return at least one recommendation for the UI smoke prompt"
  );

  await recommendationPanel.getByText(/개 추천/).waitFor({ state: "visible" });
  assert.equal(await recommendationPanel.getAttribute("data-state"), "ready");
  const resultButtons = recommendationPanel.locator(`button[title*="prompt: ${prompt}"]`);
  await resultButtons.first().waitFor({ state: "visible" });

  const resultButtonCount = await resultButtons.count();
  assert.equal(
    resultButtonCount > 0,
    true,
    "studio recommendation UI should render at least one recommendation result button"
  );
  assert.equal(
    await resultButtons.first().getAttribute("draggable"),
    "true",
    "recommendation result buttons should support catalog drag-and-drop placement"
  );
  const firstResultTitle = await resultButtons.first().getAttribute("title");
  assert.match(firstResultTitle, /score \d/);
  assert.match(firstResultTitle, /parcel:/);
  assert.match(firstResultTitle, /prompt: 모던 단독주택/);
  assert.equal(
    await resultButtons.first().locator(".studio-catalog-recommendation-meta").count(),
    1,
    "recommendation result should expose score, cost, source, and material metadata"
  );
  const firstResultText = await resultButtons.first().textContent();
  assert.match(firstResultText, /score \d/);
  assert.match(firstResultText, /₩|가격/);
  assert.match(firstResultTitle, /조달청|IFC|PLOT:ON|catalog/);

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during the recommendation UI smoke flow"
  );

  console.log(`studio asset recommendation UI OK (${resultButtonCount} result buttons)`);
} finally {
  await browser.close();
  await server.close();
}
