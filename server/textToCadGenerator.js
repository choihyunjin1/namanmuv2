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

function roundedNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(3)) : fallback;
}

function primitive(id, kind, values = {}) {
  return {
    id,
    categoryId: values.categoryId ?? null,
    color: values.color ?? null,
    kind,
    material: values.material ?? null,
    position: (values.position ?? [0, 0, 0]).map((value) => roundedNumber(value)),
    role: values.role ?? kind,
    rotation: (values.rotation ?? [0, 0, 0]).map((value) => roundedNumber(value)),
    size: (values.size ?? [1, 1, 1]).map((value) => roundedNumber(value, 1)),
    type: values.type ?? "box"
  };
}

function createWindowPrimitives(plan) {
  const [width = 1.4, height = 1.1, depth = 0.16] = plan.size ?? [];
  const rail = Math.max(0.055, width * 0.055);
  return [
    primitive("window-glass", "window-glass", {
      categoryId: "window",
      color: "#9fd6df",
      material: "transparent-glass",
      role: "glazing",
      size: [width - rail * 2, height - rail * 2, Math.max(0.025, depth * 0.18)]
    }),
    primitive("window-frame-left", "window-frame", {
      categoryId: "window",
      color: "#263f42",
      material: "powder-coated-metal",
      position: [-(width / 2 - rail / 2), 0, 0],
      role: "frame",
      size: [rail, height, depth]
    }),
    primitive("window-frame-right", "window-frame", {
      categoryId: "window",
      color: "#263f42",
      material: "powder-coated-metal",
      position: [width / 2 - rail / 2, 0, 0],
      role: "frame",
      size: [rail, height, depth]
    }),
    primitive("window-frame-top", "window-frame", {
      categoryId: "window",
      color: "#263f42",
      material: "powder-coated-metal",
      position: [0, height / 2 - rail / 2, 0],
      role: "frame",
      size: [width, rail, depth]
    }),
    primitive("window-frame-bottom", "window-frame", {
      categoryId: "window",
      color: "#263f42",
      material: "powder-coated-metal",
      position: [0, -(height / 2 - rail / 2), 0],
      role: "frame",
      size: [width, rail, depth]
    })
  ];
}

function createDoorPrimitives(plan) {
  const [width = 0.95, height = 2.1, depth = 0.2] = plan.size ?? [];
  return [
    primitive("door-panel", "door-panel", {
      categoryId: "door",
      color: plan.color,
      material: "wood-door-panel",
      role: "swing-panel",
      size: [width, height, Math.max(0.08, depth * 0.45)]
    }),
    primitive("door-handle", "door-handle", {
      categoryId: "door",
      color: "#d7bd72",
      material: "brass",
      position: [width * 0.32, 0.05, depth * 0.42],
      role: "hardware",
      size: [0.09, 0.09, 0.05]
    })
  ];
}

function createColumnPrimitives(plan) {
  const [width = 0.45, height = 2.7, depth = 0.45] = plan.size ?? [];
  return [
    primitive("column-shaft", "column-shaft", {
      categoryId: "column",
      color: plan.color,
      material: "reinforced-concrete",
      role: "structural-support",
      size: [width, height, depth],
      type: "cylinder"
    })
  ];
}

function createStairPrimitives(plan) {
  const [width = 1.1, height = 2.7, depth = 3.2] = plan.size ?? [];
  const stepCount = Math.max(2, Math.min(24, Math.round(plan.stepCount ?? 15)));
  const stepHeight = height / stepCount;
  const stepDepth = depth / stepCount;
  return Array.from({ length: stepCount }, (_, index) => primitive(`stair-step-${index + 1}`, "stair-step", {
    categoryId: "stairs-ladder",
    color: plan.color,
    material: "precast-concrete",
    position: [0, stepHeight * (index + 0.5) - height / 2, -depth / 2 + stepDepth * (index + 0.5)],
    role: "tread-riser",
    size: [width, stepHeight, stepDepth]
  }));
}

function createWallPrimitives(plan) {
  return [
    primitive("wall-panel", "wall-panel", {
      categoryId: "wall-tool",
      color: plan.color,
      material: "structural-wall",
      role: "wall-segment",
      size: plan.size
    })
  ];
}

function createDefaultPrimitives(plan) {
  return [
    primitive("generated-block", "generated-block", {
      categoryId: plan.categoryId,
      color: plan.color,
      material: "concept-mass",
      role: "concept-placeholder",
      size: plan.size
    })
  ];
}

function createScenePlan(prompt, plan) {
  const primitivesByCategory = {
    column: createColumnPrimitives,
    door: createDoorPrimitives,
    "stairs-ladder": createStairPrimitives,
    "wall-tool": createWallPrimitives,
    window: createWindowPrimitives
  };
  const createPrimitives = primitivesByCategory[plan.categoryId] ?? createDefaultPrimitives;
  const primitives = createPrimitives(plan);

  return {
    schemaVersion: 1,
    units: "m",
    source: "ploton-text-to-cad",
    prompt,
    asset: {
      categoryId: plan.categoryId,
      placementMode: plan.placementMode,
      shape: plan.shape,
      size: plan.size
    },
    bounds: {
      center: [0, 0, 0],
      size: plan.size
    },
    anchors: {
      origin: "center",
      placementPlane: plan.placementMode?.startsWith("wall") ? "wall" : "floor"
    },
    primitives
  };
}

function summarizeScenePlan(scenePlan) {
  const primitiveKinds = [...new Set((scenePlan.primitives ?? []).map((item) => item.kind).filter(Boolean))];
  return {
    categoryId: scenePlan.asset?.categoryId ?? null,
    placementMode: scenePlan.asset?.placementMode ?? null,
    primitiveCount: scenePlan.primitives?.length ?? 0,
    primitiveKinds,
    primaryKind: primitiveKinds[0] ?? null,
    schemaVersion: scenePlan.schemaVersion,
    units: scenePlan.units
  };
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
  const scenePlan = createScenePlan(prompt, plan);
  const label = String(payload.label ?? `AI ${plan.previewMaterialLabel ?? "자산"} 초안`).slice(0, 36);
  const mode = env.PLOTON_TEXT_TO_CAD_MODE || "mock-cadam-adapter";
  const asset = {
    ...plan,
    id: `generated-${jobId}`,
    cadScriptFormat: "openscad",
    engine: "cadam-compatible-text-to-cad",
    label,
    librarySource: "generated",
    metadata: {
      scenePlanSummary: summarizeScenePlan(scenePlan)
    },
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
    scenePlan,
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
