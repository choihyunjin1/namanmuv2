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

  await page.getByText(/집 초안 생성 완료/).waitFor({ state: "visible" });
  const generationAudit = page.getByLabel("AI 생성 작업 내역");
  await generationAudit.waitFor({ state: "visible" });
  await generationAudit.getByText(/Plan/).waitFor({ state: "visible" });
  await generationAudit.getByText(/actions/).waitFor({ state: "visible" });
  await generationAudit.getByText(/pascal-style-tool-command-plan/).waitFor({ state: "visible" });
  await generationAudit.getByText(/asset slots/).waitFor({ state: "visible" });
  await page.getByText("1층 생활공간").waitFor({ state: "visible" });
  await page.getByText("2침실 상부 매스").waitFor({ state: "visible" });

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
