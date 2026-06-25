import { createBriefScene } from "./briefSceneGenerator.js";
import { enrichBriefSceneWithAssetRecommendations } from "./briefSceneRecommendationEnricher.js";
import { recommendAssets } from "./assetRecommendationEngine.js";
import { searchAssetCatalog } from "./assetCatalogSearch.js";
import { readProject, writeProject } from "./projectStore.js";
import { listTextToCadJobs, readTextToCadJob, submitTextToCadJob } from "./textToCadGenerator.js";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 120_000) {
        reject(Object.assign(new Error("요청 본문이 너무 큽니다."), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("JSON 요청 본문을 해석하지 못했습니다."), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function installStudioApi(server, env = {}) {
  server.middlewares.use("/api/scenes/from-brief", async (req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    const brief = url.searchParams.get("brief") ?? url.searchParams.get("prompt") ?? "";

    try {
      if (req.method === "GET") {
        const scene = createBriefScene({ brief });
        sendJson(res, 200, { ok: true, data: await enrichBriefSceneWithAssetRecommendations(scene, { brief }) });
        return;
      }

      if (req.method === "POST") {
        const payload = await readJsonBody(req);
        const scene = createBriefScene(payload);
        sendJson(res, 200, { ok: true, data: await enrichBriefSceneWithAssetRecommendations(scene, payload) });
        return;
      }

      sendJson(res, 405, { ok: false, message: "GET 또는 POST만 지원합니다." });
    } catch (error) {
      sendJson(res, error.statusCode ?? 500, {
        ok: false,
        code: "BRIEF_SCENE_ERROR",
        message: error.message
      });
    }
  });

  server.middlewares.use("/api/assets/recommend", async (req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    const prompt = url.searchParams.get("prompt") ?? url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";

    try {
      if (req.method === "GET") {
        sendJson(res, 200, await recommendAssets({
          limit: url.searchParams.get("limit"),
          parcel: {
            areaM2: url.searchParams.get("areaM2"),
            maxBuildingCoverageRatio: url.searchParams.get("bcr"),
            maxFloorAreaRatio: url.searchParams.get("far"),
            zone: url.searchParams.get("zone")
          },
          prompt
        }));
        return;
      }

      if (req.method === "POST") {
        const payload = await readJsonBody(req);
        sendJson(res, 200, await recommendAssets(payload));
        return;
      }

      sendJson(res, 405, { ok: false, message: "GET 또는 POST만 지원합니다." });
    } catch (error) {
      sendJson(res, error.statusCode ?? 200, {
        ok: false,
        code: "ASSET_RECOMMENDATION_ERROR",
        message: error.message,
        data: { recommendations: [] }
      });
    }
  });

  server.middlewares.use("/api/assets/search", async (req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    const query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";

    try {
      if (req.method === "GET") {
        sendJson(res, 200, await searchAssetCatalog(query));
        return;
      }

      sendJson(res, 405, { ok: false, message: "GET만 지원합니다." });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        code: "ASSET_SEARCH_ERROR",
        message: error.message,
        data: { query, total: 0, results: [] }
      });
    }
  });

  server.middlewares.use("/api/projects", async (req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    const projectId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    if (!projectId) {
      sendJson(res, 400, { ok: false, message: "프로젝트 ID가 필요합니다." });
      return;
    }

    try {
      if (req.method === "GET") {
        const result = await readProject(projectId);
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      if (req.method === "POST") {
        const payload = await readJsonBody(req);
        const result = await writeProject(projectId, payload);
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      sendJson(res, 405, { ok: false, message: "GET 또는 POST만 지원합니다." });
    } catch (error) {
      sendJson(res, error.statusCode ?? 500, {
        ok: false,
        code: "PROJECT_STORE_ERROR",
        message: error.message
      });
    }
  });

  server.middlewares.use("/api/text-to-cad/jobs", async (req, res) => {
    const url = new URL(req.url ?? "", "http://127.0.0.1");
    const jobId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    try {
      if (req.method === "GET" && !jobId) {
        const result = await listTextToCadJobs();
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      if (req.method === "GET" && jobId) {
        const result = await readTextToCadJob(jobId);
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      if (req.method === "POST") {
        const payload = await readJsonBody(req);
        const result = await submitTextToCadJob(payload, env);
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      sendJson(res, 405, { ok: false, message: "GET 또는 POST만 지원합니다." });
    } catch (error) {
      sendJson(res, error.statusCode ?? 500, {
        ok: false,
        code: "TEXT_TO_CAD_ERROR",
        message: error.message
      });
    }
  });
}
