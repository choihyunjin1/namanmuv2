import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const JOB_DIR = path.resolve(process.cwd(), "output", "text-to-cad-jobs");
const DEFAULT_MODEL_URL = "/assets/models/component-pergola-module.glb";
const DEFAULT_THUMBNAIL_URL = "/assets/models/thumbnails/component-pergola-module.png";

function sanitizePrompt(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function createPromptHash(prompt) {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

function normalizeJobId(value) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 90);
}

function jobPath(jobId) {
  const normalizedJobId = normalizeJobId(jobId);
  if (!normalizedJobId) {
    throw Object.assign(new Error("작업 ID가 필요합니다."), { statusCode: 400 });
  }
  return path.join(JOB_DIR, `${normalizedJobId}.json`);
}

function inferAssetPlan(prompt, options = {}) {
  const text = prompt.toLowerCase();
  const requestedCategory = options.categoryId;

  if (requestedCategory === "window" || /창|window/.test(text)) {
    return {
      categoryId: "window",
      color: "#9fd6df",
      frameDepth: 0.16,
      openingSize: [1.4, 1.1],
      openingType: "window",
      placementMode: "wall-opening",
      previewMaterialLabel: "glass",
      shape: "window-wide",
      size: [1.4, 1.1, 0.16]
    };
  }

  if (requestedCategory === "door" || /문|door|entry/.test(text)) {
    return {
      categoryId: "door",
      color: "#9b7252",
      frameDepth: 0.2,
      openingSize: [0.95, 2.1],
      openingType: "door",
      placementMode: "wall-opening",
      previewMaterialLabel: "entry",
      shape: "door",
      size: [0.95, 2.1, 0.2]
    };
  }

  if (requestedCategory === "column" || /기둥|column|pillar/.test(text)) {
    return {
      categoryId: "column",
      color: "#d6c9ad",
      placementMode: "floor-structural",
      previewMaterialLabel: "support",
      shape: "column",
      size: [0.45, 2.7, 0.45],
      supportKind: "column"
    };
  }

  if (requestedCategory === "stairs-ladder" || /계단|사다리|stair|ladder/.test(text)) {
    return {
      categoryId: "stairs-ladder",
      color: "#b8b5aa",
      landingDepth: 0,
      placementMode: "floor-stair",
      previewMaterialLabel: "stair",
      shape: "stairs",
      size: [1.1, 2.7, 3.2],
      stairRun: 0.28,
      stairRise: 0.18,
      stairType: "straight",
      stepCount: 15
    };
  }

  if (requestedCategory === "wall-tool" || /벽|wall|partition/.test(text)) {
    return {
      categoryId: "wall-tool",
      color: "#a9bbb1",
      placementMode: "floor-structural",
      previewMaterialLabel: "wall",
      shape: "wall",
      size: [2.2, 2.7, 0.18],
      supportKind: "wall",
      wallOrientation: "x"
    };
  }

  return {
    categoryId: "gate",
    color: "#bca987",
    placementMode: "floor-free",
    previewMaterialLabel: "generated",
    shape: "box",
    size: [1.8, 1.2, 1.2]
  };
}

function createOpenScadDraft(prompt, plan) {
  const [width = 1, height = 1, depth = 1] = plan.size ?? [1, 1, 1];
  return [
    `// PLOT:ON Text-to-CAD draft`,
    `// prompt: ${prompt.replaceAll("\n", " ")}`,
    `module ploton_generated_asset() {`,
    `  color("${plan.color}") cube([${width}, ${depth}, ${height}], center=true);`,
    `}`,
    `ploton_generated_asset();`
  ].join("\n");
}

export function createTextToCadJob(payload = {}, env = {}) {
  const prompt = sanitizePrompt(payload.prompt);
  if (!prompt) {
    throw Object.assign(new Error("생성 프롬프트가 필요합니다."), { statusCode: 400 });
  }

  const createdAt = new Date().toISOString();
  const promptHash = createPromptHash(prompt);
  const jobId = `cadam-${promptHash}-${randomUUID().slice(0, 8)}`;
  const plan = inferAssetPlan(prompt, payload);
  const label = String(payload.label ?? `AI ${plan.previewMaterialLabel ?? "자산"} 초안`).slice(0, 36);
  const mode = env.PLOTON_TEXT_TO_CAD_MODE || "mock-cadam-adapter";
  const asset = {
    ...plan,
    id: `generated-${jobId}`,
    cadScriptFormat: "openscad",
    engine: "cadam-compatible-text-to-cad",
    label,
    librarySource: "generated",
    modelUrl: payload.modelUrl || DEFAULT_MODEL_URL,
    placementHint: "자연어 생성 초안을 카탈로그 자산처럼 배치한다. 실제 CADAM/로컬 워커 연결 시 GLB가 교체된다.",
    previewQuality: "generated",
    sourceId: "generated",
    thumbnailSrc: payload.thumbnailSrc || DEFAULT_THUMBNAIL_URL
  };

  return {
    id: jobId,
    asset,
    createdAt,
    engine: {
      adapter: "ploton-text-to-cad",
      mode,
      target: "cadam-compatible",
      workerUrlConfigured: Boolean(env.CADAM_WORKER_URL)
    },
    prompt,
    promptHash,
    scad: createOpenScadDraft(prompt, plan),
    status: "ready"
  };
}

export async function submitTextToCadJob(payload = {}, env = {}) {
  const job = createTextToCadJob(payload, env);
  await mkdir(JOB_DIR, { recursive: true });
  await writeFile(jobPath(job.id), JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function readTextToCadJob(jobId) {
  try {
    return JSON.parse(await readFile(jobPath(jobId), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("생성 작업을 찾지 못했습니다."), { statusCode: 404 });
    }
    throw error;
  }
}

export async function listTextToCadJobs() {
  try {
    const entries = await readdir(JOB_DIR);
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => readFile(path.join(JOB_DIR, entry), "utf8").then(JSON.parse))
    );
    return jobs.sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
