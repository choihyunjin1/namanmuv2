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

const prompt = "테스트용 자유 배치 CAD 자산";
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

  const generator = page.locator(".studio-catalog-generator");
  const naturalLanguageInput = page.getByLabel("자연어 3D 자산 생성");
  await naturalLanguageInput.waitFor({ state: "visible" });
  await naturalLanguageInput.fill(prompt);

  const textToCadResponsePromise = page.waitForResponse(
    (response) => getPathname(response.url()) === "/api/text-to-cad/jobs" && response.status() === 200,
    { timeout: 30_000 }
  );

  await generator.getByRole("button", { name: "Generate" }).click();
  const textToCadResponse = await textToCadResponsePromise;
  const payload = await textToCadResponse.json();
  assert.equal(payload?.ok, true, "Text-to-CAD API response should be ok");
  assert.ok(payload?.data?.asset?.id, "Text-to-CAD API response should include a generated asset");

  await generator.getByText(/생성 완료/).waitFor({ state: "visible" });

  const generatedTab = page.locator(".studio-catalog-source-tabs").getByRole("button", { name: /Generated/ });
  await generatedTab.waitFor({ state: "visible" });
  assert.equal(
    await generatedTab.getAttribute("aria-pressed"),
    "true",
    "Generated source tab should be selected after Text-to-CAD generation"
  );

  const generatedCard = page
    .locator(".studio-catalog-asset-card")
    .filter({ hasText: payload.data.asset.label ?? "AI generated 초안" })
    .first();
  await generatedCard.waitFor({ state: "visible" });
  assert.equal(
    await generatedCard.getAttribute("draggable"),
    "true",
    "Generated catalog card should support drag-and-drop placement"
  );

  assert.deepEqual(
    pageErrors.map((error) => error.message),
    [],
    "Studio Editor should not raise page errors during the Text-to-CAD UI smoke flow"
  );

  console.log(`studio Text-to-CAD UI OK (${payload.data.asset.label})`);
} finally {
  await browser.close();
  await server.close();
}
