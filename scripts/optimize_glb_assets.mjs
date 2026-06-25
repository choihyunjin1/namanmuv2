import { spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const defaultModelDir = path.join(rootDir, "public", "assets", "models");
const defaultOutputDir = path.join(defaultModelDir, "optimized");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const gltfTransformCli = path.join(rootDir, "node_modules", "@gltf-transform", "cli", "bin", "cli.js");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`${command} ${args.join(" ")} failed with code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function findGlbFiles(modelDir) {
  const entries = await readdir(modelDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".glb"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function formatRatio(value) {
  return Number(value.toFixed(4));
}

async function optimizeAsset({ fileName, level, modelDir, outputDir }) {
  const assetId = fileName.replace(/\.glb$/i, "");
  const inputPath = path.join(modelDir, fileName);
  const outputFileName = `${assetId}.meshopt.glb`;
  const outputPath = path.join(outputDir, outputFileName);
  const original = await stat(inputPath);

  await run(process.execPath, [
    gltfTransformCli,
    "meshopt",
    inputPath,
    outputPath,
    "--level",
    level
  ]);

  const optimized = await stat(outputPath);
  const ratio = optimized.size / original.size;
  const savedBytes = original.size - optimized.size;

  return {
    id: assetId,
    method: "meshopt",
    level,
    status: optimized.size < original.size ? "ready" : "not-smaller",
    original: {
      url: `/assets/models/${fileName}`,
      relativePath: path.relative(rootDir, inputPath).replaceAll("\\", "/"),
      sizeBytes: original.size
    },
    optimized: {
      url: `/assets/models/optimized/${outputFileName}`,
      relativePath: path.relative(rootDir, outputPath).replaceAll("\\", "/"),
      sizeBytes: optimized.size
    },
    savedBytes,
    ratio: formatRatio(ratio),
    reductionPercent: Number(((1 - ratio) * 100).toFixed(1))
  };
}

async function main() {
  const modelDir = path.resolve(argValue("--model-dir", defaultModelDir));
  const outputDir = path.resolve(argValue("--output-dir", defaultOutputDir));
  const only = argValue("--only", "");
  const level = argValue("--level", "high");

  await mkdir(outputDir, { recursive: true });
  const glbFiles = (await findGlbFiles(modelDir))
    .filter((name) => !only || name.includes(only));

  const results = [];
  for (const fileName of glbFiles) {
    try {
      results.push(await optimizeAsset({ fileName, level, modelDir, outputDir }));
    } catch (error) {
      results.push({
        id: fileName.replace(/\.glb$/i, ""),
        method: "meshopt",
        level,
        status: "failed",
        error: error.stderr?.trim() || error.message
      });
    }
  }

  const readyResults = results.filter((result) => result.status === "ready");
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    tool: "@gltf-transform/cli meshopt",
    level,
    outputDir: path.relative(rootDir, outputDir).replaceAll("\\", "/"),
    total: results.length,
    ready: readyResults.length,
    failed: results.filter((result) => result.status === "failed").length,
    notSmaller: results.filter((result) => result.status === "not-smaller").length,
    originalBytes: results.reduce((sum, result) => sum + (result.original?.sizeBytes ?? 0), 0),
    optimizedBytes: readyResults.reduce((sum, result) => sum + result.optimized.sizeBytes, 0),
    results
  };

  await writeFile(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(manifest, null, 2));

  if (manifest.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
