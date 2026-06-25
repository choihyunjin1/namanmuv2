import { normalizePlacementMode } from "./placementRules.js";

const DEFAULT_TAXONOMY = {
  editKind: "item",
  phase: "furnish",
  system: "fixture",
  taxonomyId: "furnish.fixture.item"
};

export const CATEGORY_TAXONOMY = {
  column: {
    editKind: "structure",
    phase: "structure",
    system: "structure",
    taxonomyId: "structure.structure.column"
  },
  door: {
    editKind: "opening",
    phase: "structure",
    system: "opening",
    taxonomyId: "structure.opening.door"
  },
  "exterior-trim": {
    editKind: "attachment",
    phase: "finish",
    system: "finish",
    taxonomyId: "finish.finish.exterior-trim"
  },
  gate: {
    editKind: "site",
    phase: "site",
    system: "site",
    taxonomyId: "site.site.gate"
  },
  railing: {
    editKind: "circulation",
    phase: "structure",
    system: "circulation",
    taxonomyId: "structure.circulation.railing"
  },
  roof: {
    editKind: "roof",
    phase: "structure",
    system: "envelope",
    taxonomyId: "structure.envelope.roof"
  },
  "roof-decor": {
    editKind: "roof-attachment",
    phase: "finish",
    system: "envelope",
    taxonomyId: "finish.envelope.roof-decor"
  },
  "roof-pattern": {
    editKind: "roof-attachment",
    phase: "finish",
    system: "finish",
    taxonomyId: "finish.finish.roof-pattern"
  },
  "roof-trim": {
    editKind: "roof-attachment",
    phase: "finish",
    system: "envelope",
    taxonomyId: "finish.envelope.roof-trim"
  },
  spandrel: {
    editKind: "attachment",
    phase: "finish",
    system: "envelope",
    taxonomyId: "finish.envelope.spandrel"
  },
  "stairs-ladder": {
    editKind: "circulation",
    phase: "structure",
    system: "circulation",
    taxonomyId: "structure.circulation.stairs-ladder"
  },
  "wall-pattern": {
    editKind: "attachment",
    phase: "finish",
    system: "finish",
    taxonomyId: "finish.finish.wall-pattern"
  },
  "wall-tool": {
    editKind: "wall",
    phase: "structure",
    system: "structure",
    taxonomyId: "structure.structure.wall"
  },
  window: {
    editKind: "opening",
    phase: "structure",
    system: "opening",
    taxonomyId: "structure.opening.window"
  }
};

const PLACEMENT_MODE_TAXONOMY = {
  "draw-room": {
    editKind: "floor",
    phase: "structure",
    system: "floor",
    taxonomyId: "structure.floor.room"
  },
  "draw-wall": {
    editKind: "wall",
    phase: "structure",
    system: "structure",
    taxonomyId: "structure.structure.wall"
  },
  "floor-free": {
    editKind: "site",
    phase: "site",
    system: "site",
    taxonomyId: "site.site.item"
  },
  "floor-stair": {
    editKind: "circulation",
    phase: "structure",
    system: "circulation",
    taxonomyId: "structure.circulation.stair"
  },
  "floor-structural": {
    editKind: "structure",
    phase: "structure",
    system: "structure",
    taxonomyId: "structure.structure.support"
  },
  "roof-accessory": {
    editKind: "roof-attachment",
    phase: "finish",
    system: "envelope",
    taxonomyId: "finish.envelope.roof-attachment"
  },
  "roof-attached": {
    editKind: "roof",
    phase: "structure",
    system: "envelope",
    taxonomyId: "structure.envelope.roof"
  },
  "wall-attached": {
    editKind: "attachment",
    phase: "finish",
    system: "finish",
    taxonomyId: "finish.finish.wall-attachment"
  },
  "wall-opening": {
    editKind: "opening",
    phase: "structure",
    system: "opening",
    taxonomyId: "structure.opening.wall-opening"
  }
};

function getWallToolTaxonomy(asset) {
  if (asset?.shape === "room" || normalizePlacementMode(asset) === "draw-room") {
    return PLACEMENT_MODE_TAXONOMY["draw-room"];
  }
  if (asset?.drawMode === "chain-wall" || normalizePlacementMode(asset) === "draw-wall") {
    return PLACEMENT_MODE_TAXONOMY["draw-wall"];
  }
  if (asset?.supportKind === "wall") {
    return {
      editKind: "wall",
      phase: "structure",
      system: "structure",
      taxonomyId: "structure.structure.wall"
    };
  }
  return CATEGORY_TAXONOMY["wall-tool"];
}

function getAssetCategoryTaxonomy(asset) {
  if (asset?.categoryId === "wall-tool") return getWallToolTaxonomy(asset);
  return CATEGORY_TAXONOMY[asset?.categoryId] ?? null;
}

export function getAssetTaxonomy(asset = {}) {
  const placementMode = normalizePlacementMode(asset);
  const taxonomy = getAssetCategoryTaxonomy(asset) ?? PLACEMENT_MODE_TAXONOMY[placementMode] ?? DEFAULT_TAXONOMY;

  return {
    assetId: asset.id ?? null,
    categoryId: asset.categoryId ?? null,
    editKind: taxonomy.editKind,
    phase: taxonomy.phase,
    placementMode,
    system: taxonomy.system,
    taxonomyId: taxonomy.taxonomyId
  };
}

export function getCategoryTaxonomy(category = {}) {
  const categoryId = typeof category === "string" ? category : category?.id ?? category?.categoryId;
  const taxonomy = CATEGORY_TAXONOMY[categoryId] ?? DEFAULT_TAXONOMY;

  return {
    categoryId: categoryId ?? null,
    editKind: taxonomy.editKind,
    phase: taxonomy.phase,
    system: taxonomy.system,
    taxonomyId: taxonomy.taxonomyId
  };
}

export function normalizeAssetCatalogTaxonomy(assets = []) {
  return (Array.isArray(assets) ? assets : []).map(getAssetTaxonomy);
}

export function summarizeAssetTaxonomy(taxonomies = []) {
  const summary = {
    byEditKind: {},
    byPhase: {},
    bySystem: {},
    total: 0
  };

  (Array.isArray(taxonomies) ? taxonomies : []).forEach((taxonomy) => {
    if (!taxonomy) return;
    summary.total += 1;
    summary.byEditKind[taxonomy.editKind] = (summary.byEditKind[taxonomy.editKind] ?? 0) + 1;
    summary.byPhase[taxonomy.phase] = (summary.byPhase[taxonomy.phase] ?? 0) + 1;
    summary.bySystem[taxonomy.system] = (summary.bySystem[taxonomy.system] ?? 0) + 1;
  });

  return summary;
}
