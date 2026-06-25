import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const ASSET_DIR = path.resolve("dist", "assets");
const BUDGETS = {
  editorViewportBytes: 130_000,
  studioEditorPageBytes: 260_000,
  threeCoreBytes: 900_000
};

async function findAsset(prefix) {
  const files = await readdir(ASSET_DIR);
  const file = files.find((item) => item.startsWith(prefix) && item.endsWith(".js"));
  assert.ok(file, `Expected ${prefix} chunk to exist in dist/assets. Run npm run build first.`);
  const filePath = path.join(ASSET_DIR, file);
  const fileStat = await stat(filePath);
  return {
    file,
    sizeBytes: fileStat.size
  };
}

const studioEditorPage = await findAsset("StudioEditorPage-");
const editorViewport = await findAsset("EditorViewport-");
const threeCore = await findAsset("vendor-three-core-");

assert.ok(
  studioEditorPage.sizeBytes <= BUDGETS.studioEditorPageBytes,
  `StudioEditorPage chunk ${studioEditorPage.sizeBytes}B exceeds ${BUDGETS.studioEditorPageBytes}B`
);
assert.ok(
  editorViewport.sizeBytes <= BUDGETS.editorViewportBytes,
  `EditorViewport chunk ${editorViewport.sizeBytes}B exceeds ${BUDGETS.editorViewportBytes}B`
);
assert.ok(
  threeCore.sizeBytes <= BUDGETS.threeCoreBytes,
  `Three core chunk ${threeCore.sizeBytes}B exceeds ${BUDGETS.threeCoreBytes}B`
);

console.log(JSON.stringify({
  chunks: {
    editorViewport,
    studioEditorPage,
    threeCore
  },
  status: "editor bundle budget OK"
}, null, 2));
