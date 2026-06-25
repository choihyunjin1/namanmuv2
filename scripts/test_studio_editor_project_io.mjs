import assert from "node:assert/strict";
import { createServer } from "vite";

const STUDIO_EDITOR_PAGE_MODULE = "/src/features/studioEditor/StudioEditorPage.jsx";
const IMPORT_ERROR_MESSAGE = "PLOT:ON Studio 씬 JSON이 아닙니다.";

async function loadStudioProjectIoHelpers() {
  const exposeProjectIoHelpers = {
    name: "studio-project-io-test-exports",
    enforce: "post",
    transform(code, id) {
      const moduleId = id.replaceAll("\\", "/").split("?")[0];
      if (!moduleId.endsWith(STUDIO_EDITOR_PAGE_MODULE)) return null;

      return {
        code: `${code}
export {
  buildProjectAiPipelineTrace as __testBuildProjectAiPipelineTrace,
  buildProjectAssetBundle as __testBuildProjectAssetBundle,
  createProjectExportEnvelope as __testCreateProjectExportEnvelope,
  unwrapImportedScenePayload as __testUnwrapImportedScenePayload
};`,
        map: null
      };
    }
  };

  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    plugins: [exposeProjectIoHelpers],
    server: { middlewareMode: true }
  });

  try {
    const studioEditorModule = await server.ssrLoadModule(STUDIO_EDITOR_PAGE_MODULE);
    return {
      buildProjectAiPipelineTrace: studioEditorModule.__testBuildProjectAiPipelineTrace,
      buildProjectAssetBundle: studioEditorModule.__testBuildProjectAssetBundle,
      createProjectExportEnvelope: studioEditorModule.__testCreateProjectExportEnvelope,
      unwrapImportedScenePayload: studioEditorModule.__testUnwrapImportedScenePayload
    };
  } finally {
    await server.close();
  }
}

function assertIsoTimestamp(value) {
  assert.equal(typeof value, "string");
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isNaN(Date.parse(value)), false);
}

function assertProjectExportEnvelope(envelope, { kind, data }) {
  assert.deepEqual(
    Object.keys(envelope).sort(),
    ["data", "exportedAt", "exporter", "kind", "projectId", "schemaVersion"].sort()
  );
  assert.equal(envelope.kind, kind);
  assert.equal(envelope.exporter, "ploton-studio-editor");
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.projectId, "studio-editor-default");
  assert.deepEqual(envelope.data, data);
  assertIsoTimestamp(envelope.exportedAt);
}

function validateImportedScenePayload(candidate, unwrapImportedScenePayload) {
  const payload = unwrapImportedScenePayload(candidate);
  if (!Array.isArray(payload?.objects)) {
    throw new Error(IMPORT_ERROR_MESSAGE);
  }
  return payload;
}

const {
  buildProjectAiPipelineTrace,
  buildProjectAssetBundle,
  createProjectExportEnvelope,
  unwrapImportedScenePayload
} = await loadStudioProjectIoHelpers();

assert.equal(typeof buildProjectAiPipelineTrace, "function");
assert.equal(typeof buildProjectAssetBundle, "function");
assert.equal(typeof createProjectExportEnvelope, "function");
assert.equal(typeof unwrapImportedScenePayload, "function");

const generatedAsset = {
  categoryId: "wall-tool",
  id: "generated-cadam-wall",
  label: "Generated CADAM Wall",
  metadata: {
    engine: "cadam-compatible-text-to-cad",
    scenePlan: { primitives: [{ id: "block", kind: "box" }] },
    sourceJobId: "cadam-job-1"
  },
  placementMode: "floor-free",
  previewQuality: "generated",
  sourceId: "generated"
};
const libraryAsset = {
  categoryId: "gate",
  id: "mine-front-gate",
  label: "Mine Front Gate",
  placementMode: "floor-free",
  previewQuality: "component",
  sourceSnapshot: { id: "gate-1", metadata: { editor: {} } }
};
const glbCatalogAsset = {
  assetSourceId: "component-window-wide",
  bimType: "IfcWindow",
  categoryId: "window",
  componentKind: "window",
  cost: { costClass: "glazing" },
  id: "component-window-wide",
  label: "Wide Window",
  modelUrl: "/assets/models/optimized/component-window-wide.meshopt.glb",
  placementMode: "wall-opening",
  previewQuality: "component",
  sourceType: "ploton-generated",
  thumbnailSrc: "/assets/models/thumbnails/component-window-wide.png"
};
const assetBundle = buildProjectAssetBundle({
  generatedAssets: [generatedAsset],
  glbCatalogAssets: [glbCatalogAsset],
  libraryAssets: [libraryAsset]
});
assert.equal(assetBundle.schemaVersion, 1);
assert.equal(assetBundle.summary.generatedAssetCount, 1);
assert.equal(assetBundle.summary.glbAssetCount, 1);
assert.equal(assetBundle.summary.libraryAssetCount, 1);
assert.equal(assetBundle.summary.totalProjectAssetCount, 3);
assert.deepEqual(assetBundle.generatedAssets, [generatedAsset]);
assert.deepEqual(assetBundle.libraryAssets, [libraryAsset]);
assert.deepEqual(assetBundle.glbCatalog.assets[0], {
  bimType: "IfcWindow",
  categoryId: "window",
  componentKind: "window",
  costClass: "glazing",
  id: "component-window-wide",
  label: "Wide Window",
  librarySource: "ploton-generated",
  modelUrl: "/assets/models/optimized/component-window-wide.meshopt.glb",
  placementMode: "wall-opening",
  previewQuality: "component",
  sourceAssetId: "component-window-wide",
  sourceType: "ploton-generated",
  thumbnailSrc: "/assets/models/thumbnails/component-window-wide.png"
});

const aiPipeline = buildProjectAiPipelineTrace({
  audit: {
    attachedAssetSlots: ["house-shell", "roof"],
    semanticCommandPlan: { strategy: "pascal-style-tool-command-plan" }
  },
  message: "집 초안 생성 완료 · 2 rooms",
  state: "ready"
});
assert.equal(aiPipeline.schemaVersion, 1);
assert.equal(aiPipeline.lastGeneration.state, "ready");
assert.equal(aiPipeline.lastGeneration.audit.attachedAssetSlots.includes("roof"), true);

const scenePayload = {
  activeCategoryId: "roof",
  activeFloor: 2,
  aiPipeline,
  assetBundle,
  cameraView: "top",
  gridVisible: true,
  objects: [
    {
      assetId: "component-entry-door",
      id: "door-1",
      label: "Entry Door",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }
  ],
  recentAssetIds: ["component-entry-door"],
  savedAt: "2026-06-25T00:00:00.000Z",
  schemaVersion: 2,
  snapEnabled: true,
  source: "ploton-studio-editor",
  wallViewMode: "cutaway"
};

const sceneEnvelope = createProjectExportEnvelope("ploton-studio-scene", scenePayload);
assertProjectExportEnvelope(sceneEnvelope, {
  kind: "ploton-studio-scene",
  data: scenePayload
});

const pascalGraphPayload = {
  nodes: [{ id: "wall-1", kind: "wall" }],
  schemaVersion: 1,
  summary: { nodeCount: 1 }
};
assertProjectExportEnvelope(
  createProjectExportEnvelope("ploton-pascal-scene-graph", pascalGraphPayload),
  {
    kind: "ploton-pascal-scene-graph",
    data: pascalGraphPayload
  }
);

const serializedSceneEnvelope = JSON.parse(JSON.stringify(sceneEnvelope));
assert.deepEqual(unwrapImportedScenePayload(serializedSceneEnvelope), scenePayload);
assert.deepEqual(validateImportedScenePayload(serializedSceneEnvelope, unwrapImportedScenePayload), scenePayload);

const rawScenePayload = {
  ...scenePayload,
  activeFloor: 1,
  objects: []
};
assert.equal(unwrapImportedScenePayload(rawScenePayload), rawScenePayload);
assert.equal(validateImportedScenePayload(rawScenePayload, unwrapImportedScenePayload), rawScenePayload);

const legacySceneEnvelope = {
  data: rawScenePayload,
  kind: "ploton-studio-scene"
};
assert.equal(unwrapImportedScenePayload(legacySceneEnvelope), rawScenePayload);
assert.equal(validateImportedScenePayload(legacySceneEnvelope, unwrapImportedScenePayload), rawScenePayload);

assert.throws(
  () => validateImportedScenePayload({ ...scenePayload, objects: "not-an-array" }, unwrapImportedScenePayload),
  new RegExp(IMPORT_ERROR_MESSAGE)
);

assert.throws(
  () => validateImportedScenePayload({
    data: { ...scenePayload, objects: null },
    exporter: "ploton-studio-editor",
    kind: "ploton-studio-scene",
    schemaVersion: 1
  }, unwrapImportedScenePayload),
  new RegExp(IMPORT_ERROR_MESSAGE)
);

assert.throws(
  () => validateImportedScenePayload(
    createProjectExportEnvelope("ploton-pascal-scene-graph", pascalGraphPayload),
    unwrapImportedScenePayload
  ),
  new RegExp(IMPORT_ERROR_MESSAGE)
);

console.log("studio editor project I/O OK");
