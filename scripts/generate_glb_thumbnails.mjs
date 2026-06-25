import { createServer } from "node:http";
import { readFile, readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const nodeModulesDir = path.join(rootDir, "node_modules");
const defaultModelDir = path.join(publicDir, "assets", "models");
const defaultOutputDir = path.join(defaultModelDir, "thumbnails");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".wasm", "application/wasm"]
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

function isInside(base, target) {
  const relative = path.relative(base, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeJoin(base, requestPath) {
  const decoded = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const target = path.resolve(base, decoded);
  if (target === base || isInside(base, target)) return target;
  return null;
}

function thumbnailHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>PLOT:ON GLB Thumbnail Renderer</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #eef4f1;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #thumb {
      width: 960px;
      height: 600px;
      display: block;
    }
    #status {
      display: none;
      position: fixed;
      left: 16px;
      bottom: 14px;
      padding: 8px 10px;
      border: 1px solid rgba(30, 48, 42, 0.14);
      border-radius: 8px;
      color: #1e302c;
      background: rgba(255, 255, 255, 0.88);
      font-size: 12px;
      font-weight: 800;
    }
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "/node_modules/three/build/three.module.js",
        "three/addons/": "/node_modules/three/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <canvas id="thumb" width="960" height="600"></canvas>
  <div id="status">loading</div>
  <script type="module">
    import * as THREE from "three";
    import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

    const canvas = document.getElementById("thumb");
    const status = document.getElementById("status");
    const modelUrl = new URLSearchParams(window.location.search).get("model");
    window.__PLOTON_THUMBNAIL_STATUS = { status: "loading" };

    function setStatus(next, detail = "", debug = null) {
      window.__PLOTON_THUMBNAIL_STATUS = { status: next, detail, debug };
      status.textContent = detail || next;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef4f1);

    const camera = new THREE.PerspectiveCamera(36, 960 / 600, 0.05, 5000);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(1);
    renderer.setSize(960, 600, false);
    renderer.setClearColor(0xeef4f1, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c7be, 2.2);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(8, 14, 10);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdcefff, 1.1);
    fill.position.set(-8, 5, -7);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(80, 96),
      new THREE.MeshStandardMaterial({ color: 0xdce8e1, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    function chooseVisualBounds(root) {
      const globalBox = new THREE.Box3().setFromObject(root);
      if (globalBox.isEmpty()) throw new Error("Loaded GLB has empty bounds");
      const globalSize = globalBox.getSize(new THREE.Vector3());
      const globalHorizontal = Math.max(globalSize.x, globalSize.z, 1);
      const visualBox = new THREE.Box3();
      let accepted = 0;

      root.traverse((object) => {
        if (!object.isMesh) return;
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const horizontal = Math.max(size.x, size.z);
        const name = \`\${object.name || ""} \${object.parent?.name || ""}\`.toLowerCase();
        const veryFlat = size.y <= Math.max(globalSize.y * 0.015, 0.08);
        const hugeHorizontal = horizontal > globalHorizontal * 0.42;
        const siteLikeName = /(ifcsite|site|terrain|geographic|topography)/i.test(name);
        const likelyGroundReference = veryFlat && (hugeHorizontal || siteLikeName);

        if (likelyGroundReference && accepted > 0) {
          object.visible = false;
          return;
        }

        if (!likelyGroundReference) {
          visualBox.union(box);
          accepted += 1;
        }
      });

      if (accepted === 0 || visualBox.isEmpty()) return globalBox;
      return visualBox;
    }

    function frameObject(root) {
      const initialBox = chooseVisualBounds(root);

      const center = initialBox.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.z -= center.z;
      root.position.y -= initialBox.min.y;

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const target = new THREE.Vector3(0, Math.max(0.6, size.y * 0.42), 0);
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * 1.45;

      camera.position.set(distance * 0.72, Math.max(distance * 0.42, size.y * 0.72), distance * 0.96);
      camera.near = Math.max(0.01, distance / 150);
      camera.far = distance * 8 + maxDim * 4;
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      floor.scale.setScalar(Math.max(maxDim * 0.045, 1));
      window.__PLOTON_THUMBNAIL_DEBUG = {
        initialSize: initialBox.getSize(new THREE.Vector3()).toArray(),
        finalSize: size.toArray(),
        finalMin: box.min.toArray(),
        finalMax: box.max.toArray(),
        maxDim,
        distance,
        camera: camera.position.toArray(),
        target: target.toArray()
      };
    }

    function countVisiblePixels() {
      const gl = renderer.getContext();
      const width = canvas.width;
      const height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];
        if (a > 0 && (r < 224 || g < 238 || b < 235)) visible += 1;
      }
      return visible;
    }

    function countMaskPixels() {
      const gl = renderer.getContext();
      const width = canvas.width;
      const height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      const previousBackground = scene.background;
      const previousOverride = scene.overrideMaterial;
      const previousFloorVisible = floor.visible;
      const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

      scene.background = new THREE.Color(0x000000);
      scene.overrideMaterial = maskMaterial;
      floor.visible = false;
      renderer.setClearColor(0x000000, 1);
      renderer.render(scene, camera);
      gl.finish();
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      let visible = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];
        if (a > 0 && (r > 16 || g > 16 || b > 16)) visible += 1;
      }

      scene.background = previousBackground;
      scene.overrideMaterial = previousOverride;
      floor.visible = previousFloorVisible;
      renderer.setClearColor(0xeef4f1, 1);
      maskMaterial.dispose();
      renderer.render(scene, camera);
      return visible;
    }

    async function waitForVisibleRender(minVisiblePixels = 1400) {
      let visiblePixels = 0;
      for (let index = 0; index < 30; index += 1) {
        renderer.render(scene, camera);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        visiblePixels = countVisiblePixels();
        if (visiblePixels >= minVisiblePixels) return visiblePixels;
      }
      return visiblePixels;
    }

    function normalizeMaterials(root) {
      root.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          material.side = THREE.DoubleSide;
          material.transparent = false;
          material.opacity = 1;
          material.roughness = Math.max(material.roughness ?? 0.72, 0.62);
          material.needsUpdate = true;
        });
      });
    }

    async function renderThumbnail() {
      if (!modelUrl) throw new Error("Missing model query parameter");
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(modelUrl);
      const root = gltf.scene;
      normalizeMaterials(root);
      scene.add(root);
      frameObject(root);
      for (let index = 0; index < 8; index += 1) {
        renderer.render(scene, camera);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      renderer.render(scene, camera);
      const visiblePixels = await waitForVisibleRender();
      const maskPixels = visiblePixels >= 1400 ? visiblePixels : countMaskPixels();
      window.__PLOTON_THUMBNAIL_DEBUG = {
        ...window.__PLOTON_THUMBNAIL_DEBUG,
        visiblePixels,
        maskPixels
      };
      if (visiblePixels < 1400 && maskPixels < 1400) {
        throw new Error(\`thumbnail render appears blank: \${visiblePixels} visible pixels, \${maskPixels} mask pixels\`);
      }
      setStatus("ready", "ready", window.__PLOTON_THUMBNAIL_DEBUG);
    }

    renderThumbnail().catch((error) => {
      console.error(error);
      setStatus("error", error?.message || "thumbnail failed", window.__PLOTON_THUMBNAIL_DEBUG ?? null);
    });
  </script>
</body>
</html>`;
}

async function serveFile(response, filePath) {
  try {
    const body = await readFile(filePath);
    const type = mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function createStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/thumbnail") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(thumbnailHtml());
      return;
    }

    if (url.pathname.startsWith("/assets/")) {
      const target = safeJoin(publicDir, url.pathname);
      if (!target) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      serveFile(response, target);
      return;
    }

    if (url.pathname.startsWith("/node_modules/")) {
      const target = safeJoin(nodeModulesDir, url.pathname.replace(/^\/node_modules\//, ""));
      if (!target) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      serveFile(response, target);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
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

async function main() {
  const modelDir = path.resolve(argValue("--model-dir", defaultModelDir));
  const outputDir = path.resolve(argValue("--output-dir", defaultOutputDir));
  const only = argValue("--only", "");
  const timeoutMs = Number(argValue("--timeout-ms", "120000"));
  const includeDebug = process.argv.includes("--debug");

  await mkdir(outputDir, { recursive: true });
  const glbFiles = (await findGlbFiles(modelDir))
    .filter((name) => !only || name.includes(only));

  const { server, baseUrl } = await createStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--use-angle=swiftshader",
      "--use-gl=angle"
    ]
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const results = [];

  try {
    for (const fileName of glbFiles) {
      const assetId = fileName.replace(/\.glb$/i, "");
      const modelUrl = `/assets/models/${fileName}`;
      const outputPath = path.join(outputDir, `${assetId}.png`);

      await page.goto(`${baseUrl}/thumbnail?model=${encodeURIComponent(modelUrl)}`, {
        waitUntil: "networkidle",
        timeout: timeoutMs
      });
      await page.waitForFunction(() => {
        const status = window.__PLOTON_THUMBNAIL_STATUS?.status;
        return status === "ready" || status === "error";
      }, { timeout: timeoutMs });

      const status = await page.evaluate(() => window.__PLOTON_THUMBNAIL_STATUS);
      if (status.status !== "ready") {
        const debugOutputPath = path.join(outputDir, `${assetId}.failed.png`);
        if (includeDebug) {
          await page.locator("#thumb").screenshot({ path: debugOutputPath });
        }
        results.push({
          id: assetId,
          status: "failed",
          error: status.detail,
          ...(includeDebug ? { debugOutput: path.relative(rootDir, debugOutputPath).replaceAll("\\", "/") } : {}),
          ...(includeDebug ? { debug: status.debug ?? null } : {})
        });
        continue;
      }

      await page.locator("#thumb").screenshot({ path: outputPath });
      const outputStat = await stat(outputPath);
      results.push({
        id: assetId,
        status: "ready",
        output: path.relative(rootDir, outputPath).replaceAll("\\", "/"),
        sizeBytes: outputStat.size,
        ...(includeDebug ? { debug: status.debug ?? null } : {})
      });
    }
  } finally {
    await browser.close();
    server.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: path.relative(rootDir, outputDir).replaceAll("\\", "/"),
    total: results.length,
    ready: results.filter((result) => result.status === "ready").length,
    failed: results.filter((result) => result.status !== "ready").length,
    results
  };

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
