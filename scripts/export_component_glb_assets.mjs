import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "public", "assets", "models");

function ensureFileReaderPolyfill() {
  if (typeof globalThis.FileReader !== "undefined") return;
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
      this.onerror = null;
    }

    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onloadend?.({ target: this });
      } catch (error) {
        this.onerror?.(error);
      }
    }

    async readAsDataURL(blob) {
      try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const mime = blob.type || "application/octet-stream";
        this.result = `data:${mime};base64,${buffer.toString("base64")}`;
        this.onloadend?.({ target: this });
      } catch (error) {
        this.onerror?.(error);
      }
    }
  };
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide
  });
}

const materials = {
  wallWarm: material(0xf0e8dc, { roughness: 0.84 }),
  wallLight: material(0xf7f3ea, { roughness: 0.8 }),
  stone: material(0xc8cac3, { roughness: 0.88 }),
  brick: material(0xb8afa0, { roughness: 0.86 }),
  roof: material(0x32393b, { roughness: 0.68, metalness: 0.04, side: THREE.DoubleSide }),
  frame: material(0x222d2f, { roughness: 0.52, metalness: 0.06 }),
  glass: material(0x8cb9c8, { roughness: 0.2, metalness: 0.04, transparent: true, opacity: 0.72 }),
  wood: material(0xa97046, { roughness: 0.82 }),
  darkWood: material(0x745038, { roughness: 0.84 }),
  concrete: material(0xb7beb8, { roughness: 0.9 }),
  metal: material(0x747d78, { roughness: 0.46, metalness: 0.18 }),
  solar: material(0x172f45, { roughness: 0.35, metalness: 0.28 }),
  leaf: material(0x6f8f64, { roughness: 0.9 }),
  line: material(0xf4f7ee, { roughness: 0.62 })
};

function meshBox(name, size, position, mat, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function meshCylinder(name, args, position, mat, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(...args), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function meshSphere(name, args, position, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(...args), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createGableRoofMesh(name, width, depth, rise) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const vertices = new Float32Array([
    -halfW, 0, -halfD,
    halfW, 0, -halfD,
    0, rise, -halfD,
    -halfW, 0, halfD,
    halfW, 0, halfD,
    0, rise, halfD
  ]);
  const indices = [
    0, 1, 2,
    3, 5, 4,
    0, 3, 5,
    0, 5, 2,
    1, 4, 5,
    1, 5, 2,
    0, 4, 1,
    0, 3, 4
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createHipRoofMesh(name, width, depth, rise) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const insetW = halfW * 0.3;
  const insetD = halfD * 0.3;
  const vertices = new Float32Array([
    -halfW, 0, -halfD,
    halfW, 0, -halfD,
    halfW, 0, halfD,
    -halfW, 0, halfD,
    -insetW, rise, -insetD,
    insetW, rise, -insetD,
    insetW, rise, insetD,
    -insetW, rise, insetD
  ]);
  const indices = [
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
    4, 5, 6, 4, 6, 7,
    0, 3, 2, 0, 2, 1
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addWindow(group, name, width = 0.92, height = 0.64, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const windowGroup = new THREE.Group();
  windowGroup.name = name;
  windowGroup.position.set(...position);
  windowGroup.rotation.set(...rotation);
  windowGroup.add(meshBox(`${name}_frame`, [width + 0.16, height + 0.16, 0.055], [0, 0, 0], materials.frame));
  windowGroup.add(meshBox(`${name}_glass`, [width, height, 0.066], [0, 0, 0.012], materials.glass));
  windowGroup.add(meshBox(`${name}_mullion_v`, [0.035, height + 0.1, 0.075], [0, 0, 0.026], materials.frame));
  windowGroup.add(meshBox(`${name}_mullion_h`, [width + 0.1, 0.032, 0.075], [0, 0, 0.028], materials.frame));
  group.add(windowGroup);
  return windowGroup;
}

function addDoor(group, name, width = 0.56, height = 1.08, position = [0, 0, 0]) {
  const door = new THREE.Group();
  door.name = name;
  door.position.set(...position);
  door.add(meshBox(`${name}_frame`, [width + 0.12, height + 0.1, 0.065], [0, 0, 0], materials.frame));
  door.add(meshBox(`${name}_panel`, [width, height, 0.075], [0, -0.01, 0.022], materials.wood));
  door.add(meshBox(`${name}_handle`, [0.045, 0.055, 0.035], [width * 0.32, 0.02, 0.075], materials.metal));
  group.add(door);
  return door;
}

function slatWall(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("base_wall", [1.2, 1.0, 0.12], [0, 0.5, 0], materials.wallWarm));
  group.add(meshBox("trim_top", [1.28, 0.06, 0.16], [0, 1.03, 0.02], materials.concrete));
  group.add(meshBox("trim_bottom", [1.28, 0.05, 0.16], [0, 0.04, 0.02], materials.concrete));
  for (let index = 0; index < 7; index += 1) {
    group.add(meshBox(`wood_slat_${index + 1}`, [0.045, 0.92, 0.045], [-0.45 + index * 0.15, 0.52, 0.085], materials.wood));
  }
  return group;
}

function wallWithWindow(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("base_wall", [1.4, 1.05, 0.12], [0, 0.525, 0], materials.brick));
  addWindow(group, "window", 0.7, 0.42, [0, 0.62, 0.085]);
  group.add(meshBox("sill", [0.86, 0.05, 0.18], [0, 0.36, 0.105], materials.concrete));
  return group;
}

function deckModule(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("deck_base", [1.92, 0.13, 1.12], [0, 0.065, 0], materials.wood));
  for (let index = 0; index < 7; index += 1) {
    group.add(meshBox(`plank_gap_${index + 1}`, [1.78, 0.018, 0.016], [0, 0.145, -0.44 + index * 0.145], materials.darkWood));
  }
  group.add(meshBox("front_step", [1.7, 0.1, 0.22], [0, 0.045, 0.72], materials.darkWood));
  return group;
}

function pergolaModule(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(deckModule("deck_insert"));
  for (const x of [-0.68, 0.68]) {
    for (const z of [-0.52, 0.52]) {
      group.add(meshBox(`post_${x}_${z}`, [0.08, 1.32, 0.08], [x, 0.76, z], materials.darkWood));
    }
  }
  group.add(meshBox("main_beam_front", [1.62, 0.08, 0.08], [0, 1.44, 0.58], materials.darkWood));
  group.add(meshBox("main_beam_back", [1.62, 0.08, 0.08], [0, 1.44, -0.58], materials.darkWood));
  for (let index = 0; index < 6; index += 1) {
    group.add(meshBox(`roof_louver_${index + 1}`, [1.72, 0.05, 0.06], [0, 1.54, -0.5 + index * 0.2], materials.metal));
  }
  return group;
}

function solarPanel(id) {
  const group = new THREE.Group();
  group.name = id;
  const panel = meshBox("solar_panel", [1.22, 0.07, 0.86], [0, 0.46, 0], materials.solar, [-0.34, 0, 0]);
  const glass = meshBox("solar_glass", [1.05, 0.035, 0.68], [0, 0.5, -0.025], materials.glass, [-0.34, 0, 0]);
  group.add(panel, glass);
  group.add(meshBox("left_leg", [0.07, 0.5, 0.07], [-0.46, 0.23, 0.31], materials.metal));
  group.add(meshBox("right_leg", [0.07, 0.5, 0.07], [0.46, 0.23, 0.31], materials.metal));
  return group;
}

function parkingPad(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("parking_slab", [1.22, 0.055, 2.08], [0, 0.03, 0], materials.concrete));
  group.add(meshBox("left_line", [0.035, 0.018, 1.74], [-0.42, 0.07, 0], materials.line));
  group.add(meshBox("right_line", [0.035, 0.018, 1.74], [0.42, 0.07, 0], materials.line));
  return group;
}

function fencePanel(id) {
  const group = new THREE.Group();
  group.name = id;
  for (let index = 0; index < 7; index += 1) {
    group.add(meshBox(`vertical_slat_${index + 1}`, [0.055, 0.82, 0.055], [-0.54 + index * 0.18, 0.41, 0], materials.darkWood));
  }
  group.add(meshBox("rail_top", [1.22, 0.055, 0.055], [0, 0.67, 0.01], materials.darkWood));
  group.add(meshBox("rail_mid", [1.22, 0.045, 0.045], [0, 0.38, 0.01], materials.darkWood));
  return group;
}

function planterModule(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("planter_box", [0.72, 0.24, 0.34], [0, 0.12, 0], materials.concrete));
  group.add(meshSphere("plant_left", [0.17, 16, 10], [-0.18, 0.34, 0.03], materials.leaf));
  group.add(meshSphere("plant_mid", [0.2, 16, 10], [0.02, 0.39, -0.03], materials.leaf));
  group.add(meshSphere("plant_right", [0.15, 16, 10], [0.24, 0.34, 0.04], materials.leaf));
  return group;
}

function treeModule(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshCylinder("trunk", [0.055, 0.075, 0.72, 12], [0, 0.36, 0], materials.darkWood));
  group.add(meshSphere("crown_main", [0.36, 20, 12], [0, 0.88, 0], materials.leaf));
  group.add(meshSphere("crown_side", [0.24, 18, 10], [0.2, 0.78, 0.04], materials.leaf));
  return group;
}

function roofGable(id) {
  const group = new THREE.Group();
  group.name = id;
  const roof = createGableRoofMesh("gable_roof", 1.62, 1.12, 0.38);
  roof.position.y = 0.05;
  group.add(roof);
  group.add(meshBox("ridge_cap", [0.08, 0.08, 1.18], [0, 0.43, 0], materials.metal));
  return group;
}

function roofHip(id) {
  const group = new THREE.Group();
  group.name = id;
  const roof = createHipRoofMesh("hip_roof", 1.62, 1.12, 0.34);
  roof.position.y = 0.05;
  group.add(roof);
  return group;
}

function flatRoof(id) {
  const group = new THREE.Group();
  group.name = id;
  group.add(meshBox("flat_roof_slab", [1.62, 0.12, 1.12], [0, 0.06, 0], materials.roof));
  group.add(meshBox("parapet_front", [1.74, 0.18, 0.08], [0, 0.2, 0.58], materials.concrete));
  group.add(meshBox("parapet_back", [1.74, 0.18, 0.08], [0, 0.2, -0.58], materials.concrete));
  group.add(meshBox("parapet_left", [0.08, 0.18, 1.12], [-0.86, 0.2, 0], materials.concrete));
  group.add(meshBox("parapet_right", [0.08, 0.18, 1.12], [0.86, 0.2, 0], materials.concrete));
  return group;
}

function entryDoor(id) {
  const group = new THREE.Group();
  group.name = id;
  addDoor(group, "entry_door", 0.6, 1.12, [0, 0.58, 0]);
  group.add(meshBox("threshold", [0.82, 0.06, 0.2], [0, 0.03, 0.08], materials.concrete));
  return group;
}

function wideWindow(id) {
  const group = new THREE.Group();
  group.name = id;
  addWindow(group, "wide_window", 1.08, 0.64, [0, 0.42, 0]);
  return group;
}

function slimWindow(id) {
  const group = new THREE.Group();
  group.name = id;
  addWindow(group, "slim_window", 0.38, 0.92, [0, 0.54, 0]);
  return group;
}

const components = [
  {
    id: "component-wall-slat-panel",
    label: "Slat Wall Panel",
    kind: "wall-panel",
    bimType: "IfcWall",
    builder: slatWall,
    tags: ["component", "wall-panel", "facade", "wood-accent", "surface-snap"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "wall" },
    entityCounts: { IfcWall: 1, IfcCovering: 7 }
  },
  {
    id: "component-wall-window-panel",
    label: "Window Wall Panel",
    kind: "wall-panel",
    bimType: "IfcWall",
    builder: wallWithWindow,
    tags: ["component", "wall-panel", "window", "facade", "openings"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "wall" },
    entityCounts: { IfcWall: 1, IfcWindow: 1, IfcCovering: 1 }
  },
  {
    id: "component-window-wide",
    label: "Wide Window",
    kind: "window",
    bimType: "IfcWindow",
    builder: wideWindow,
    tags: ["component", "window", "openings", "surface-snap"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "wall" },
    entityCounts: { IfcWindow: 1 }
  },
  {
    id: "component-window-slim",
    label: "Slim Window",
    kind: "window",
    bimType: "IfcWindow",
    builder: slimWindow,
    tags: ["component", "window", "openings", "surface-snap"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "wall" },
    entityCounts: { IfcWindow: 1 }
  },
  {
    id: "component-entry-door",
    label: "Entry Door",
    kind: "door",
    bimType: "IfcDoor",
    builder: entryDoor,
    tags: ["component", "door", "entry", "openings", "surface-snap"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "wall" },
    entityCounts: { IfcDoor: 1 }
  },
  {
    id: "component-roof-gable",
    label: "Gable Roof Module",
    kind: "roof",
    bimType: "IfcRoof",
    builder: roofGable,
    tags: ["component", "roof", "gable-roof", "building-shell"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "block-top" },
    entityCounts: { IfcRoof: 1 }
  },
  {
    id: "component-roof-hip",
    label: "Hip Roof Module",
    kind: "roof",
    bimType: "IfcRoof",
    builder: roofHip,
    tags: ["component", "roof", "hip-roof", "building-shell"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "block-top" },
    entityCounts: { IfcRoof: 1 }
  },
  {
    id: "component-roof-flat",
    label: "Flat Roof Module",
    kind: "roof",
    bimType: "IfcRoof",
    builder: flatRoof,
    tags: ["component", "roof", "flat-roof", "roof-terrace", "building-shell"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, attachToSurface: "block-top" },
    entityCounts: { IfcRoof: 1, IfcSlab: 1 }
  },
  {
    id: "component-deck-module",
    label: "Deck Module",
    kind: "deck",
    bimType: "IfcSlab",
    builder: deckModule,
    tags: ["component", "deck", "yard", "porch", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "front-yard" },
    entityCounts: { IfcSlab: 1, IfcCovering: 7 }
  },
  {
    id: "component-pergola-module",
    label: "Pergola Module",
    kind: "pergola",
    bimType: "IfcBuildingElementProxy",
    builder: pergolaModule,
    tags: ["component", "pergola", "yard", "shade", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "yard" },
    entityCounts: { IfcBuildingElementProxy: 1, IfcColumn: 4, IfcBeam: 8, IfcSlab: 1 }
  },
  {
    id: "component-solar-panel",
    label: "Solar Panel",
    kind: "equipment",
    bimType: "IfcEnergyConversionDevice",
    builder: solarPanel,
    tags: ["component", "solar", "equipment", "roof-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: false, requiresSupportTypes: ["IfcRoof", "IfcSlab"] },
    entityCounts: { IfcEnergyConversionDevice: 1 }
  },
  {
    id: "component-parking-pad",
    label: "Parking Pad",
    kind: "site",
    bimType: "IfcSpace",
    builder: parkingPad,
    tags: ["component", "parking", "site", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "driveway" },
    entityCounts: { IfcSpace: 1, IfcSlab: 1 }
  },
  {
    id: "component-fence-panel",
    label: "Fence Panel",
    kind: "fence",
    bimType: "IfcRailing",
    builder: fencePanel,
    tags: ["component", "fence", "site", "yard", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "parcel-edge" },
    entityCounts: { IfcRailing: 1 }
  },
  {
    id: "component-planter",
    label: "Planter",
    kind: "landscape",
    bimType: "IfcGeographicElement",
    builder: planterModule,
    tags: ["component", "landscape", "planter", "yard", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "landscape" },
    entityCounts: { IfcGeographicElement: 1 }
  },
  {
    id: "component-garden-tree",
    label: "Garden Tree",
    kind: "landscape",
    bimType: "IfcGeographicElement",
    builder: treeModule,
    tags: ["component", "landscape", "tree", "yard", "ground-placeable"],
    placementRules: { rotatable: true, snappable: true, requiresGround: true, preferredZone: "landscape" },
    entityCounts: { IfcGeographicElement: 1 }
  }
];

function buildScene(component) {
  const scene = new THREE.Scene();
  scene.name = `PLOT_ON_${component.id}`;
  const group = component.builder(component.id);
  group.userData = {
    plotonComponent: true,
    componentKind: component.kind,
    bimType: component.bimType
  };
  scene.add(group);
  scene.userData = {
    assetId: component.id,
    assetType: "component",
    componentKind: component.kind,
    bimType: component.bimType
  };
  return scene;
}

function countMeshes(scene) {
  let count = 0;
  scene.traverse((object) => {
    if (object.isMesh) count += 1;
  });
  return count;
}

function exportGlb(scene) {
  ensureFileReaderPolyfill();
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(Buffer.from(result)),
      (error) => reject(error),
      {
        binary: true,
        trs: false,
        onlyVisible: true,
        includeCustomExtensions: false
      }
    );
  });
}

function metadata(component, glbFileName, meshCount, glbSizeBytes) {
  return {
    assetSchemaVersion: 1,
    id: component.id,
    label: component.label,
    type: "component",
    componentKind: component.kind,
    bimType: component.bimType,
    format: "glb",
    sourceType: "ploton-generated",
    source: "scripts/export_component_glb_assets.mjs",
    generatedAssetFile: glbFileName,
    scaleUnit: "meter",
    unitScaleMetersPerSceneUnit: 1,
    anchor: component.placementRules.requiresGround ? "ground-center" : "surface-center",
    tags: [...new Set(["component-ready", "editable-component", "local-asset", "glb", ...component.tags])],
    compatibleZones: [],
    placementRules: component.placementRules,
    reviewStatus: "approved",
    license: "internal prototype generated asset",
    generationSchema: "PLOT_ON_COMPONENT_ASSET_V1",
    meshCount,
    entityCounts: component.entityCounts,
    quality: {
      interactionReadiness: "component-ready",
      manualReviewRequired: false,
      limitation: "Procedural component asset for PLOT:ON exterior customization. Not a permit or construction document."
    },
    component: {
      kind: component.kind,
      bimType: component.bimType,
      reusable: true,
      intendedUse: "drag-drop exterior customization"
    },
    intake: {
      status: "generated",
      createdAt: new Date().toISOString(),
      sourceSizeBytes: glbSizeBytes
    }
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const results = [];

  for (const component of components) {
    const scene = buildScene(component);
    const glb = await exportGlb(scene);
    const glbFileName = `${component.id}.glb`;
    const metadataFileName = `${component.id}.json`;
    const glbPath = path.join(outputDir, glbFileName);
    const metadataPath = path.join(outputDir, metadataFileName);
    const meshCount = countMeshes(scene);

    await writeFile(glbPath, glb);
    await writeFile(metadataPath, JSON.stringify(metadata(component, glbFileName, meshCount, glb.length), null, 2), "utf8");

    results.push({
      id: component.id,
      glb: path.relative(rootDir, glbPath).replaceAll("\\", "/"),
      metadata: path.relative(rootDir, metadataPath).replaceAll("\\", "/"),
      meshCount,
      sizeBytes: glb.length
    });
  }

  console.log(JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    outputDir: path.relative(rootDir, outputDir).replaceAll("\\", "/"),
    total: results.length,
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
