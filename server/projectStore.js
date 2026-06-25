import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_DIR = path.resolve(process.cwd(), "output", "projects");

function normalizeProjectId(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80);
}

function projectPath(projectId) {
  const normalized = normalizeProjectId(projectId);
  if (!normalized) {
    throw Object.assign(new Error("프로젝트 ID가 필요합니다."), { statusCode: 400 });
  }
  return path.join(PROJECT_DIR, `${normalized}.json`);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(",")}}`;
  }

  return JSON.stringify(value);
}

function createPayloadHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function readProject(projectId) {
  try {
    const content = await readFile(projectPath(projectId), "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("저장된 프로젝트가 없습니다."), { statusCode: 404 });
    }
    throw error;
  }
}

export async function writeProject(projectId, payload) {
  await mkdir(PROJECT_DIR, { recursive: true });
  const savedAt = new Date().toISOString();
  const baseDocument = {
    ...payload,
    projectId: normalizeProjectId(projectId),
    serverSavedAt: savedAt
  };
  const document = {
    ...baseDocument,
    integrity: {
      schemaVersion: 1,
      algorithm: "sha256",
      payloadHash: createPayloadHash(baseDocument),
      hashedAt: savedAt,
      scope: "project-json-without-integrity"
    }
  };
  await writeFile(projectPath(projectId), JSON.stringify(document, null, 2), "utf8");
  return document;
}
