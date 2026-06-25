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
  createProjectExportEnvelope,
  unwrapImportedScenePayload
} = await loadStudioProjectIoHelpers();

assert.equal(typeof createProjectExportEnvelope, "function");
assert.equal(typeof unwrapImportedScenePayload, "function");

const scenePayload = {
  activeCategoryId: "roof",
  activeFloor: 2,
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
