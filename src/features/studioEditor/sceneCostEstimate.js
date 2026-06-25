const SCENE_COST_SCHEMA_VERSION = 1;
const DEFAULT_LIMITATIONS = [
  "공공 가격 후보와 자산 크기 기반의 rough-order 견적입니다.",
  "실제 견적에는 시공비, 운반비, 로스율, 지역 단가, 상세 물량 검토가 추가로 필요합니다."
];

function asFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMetric(value, digits = 2) {
  const number = asFiniteNumber(value);
  if (number === null) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function getArrayNumber(values, index, fallback) {
  if (!Array.isArray(values)) return fallback;
  const number = asFiniteNumber(values[index]);
  return number === null ? fallback : number;
}

function getCostMetadata(source) {
  return source?.metadata?.cost ?? source?.cost ?? null;
}

function getPrimaryUnitPrice(cost) {
  const unitPrice = asFiniteNumber(cost?.primary?.unitPriceKrw);
  if (unitPrice !== null && unitPrice > 0) return unitPrice;

  const roughCost = asFiniteNumber(cost?.defaultRoughCostKrw);
  return roughCost !== null && roughCost > 0 ? roughCost : null;
}

function getUnitLabel(cost) {
  return cost?.primary?.unit ?? cost?.quantityBasis?.unit ?? "EA";
}

function isAreaUnit(unit) {
  return /㎡|m2|m²/i.test(String(unit ?? ""));
}

function isLengthUnit(unit) {
  const value = String(unit ?? "").trim();
  return !isAreaUnit(value) && /^(m|M|미터|meter|metre)$/.test(value);
}

function isEachUnit(unit) {
  return /^(EA|ea|개|식|set|SET|조)$/.test(String(unit ?? "").trim());
}

function estimateAreaQuantity(source) {
  const width = getArrayNumber(source?.size, 0, asFiniteNumber(source?.width) ?? 1);
  const height = getArrayNumber(source?.size, 1, asFiniteNumber(source?.height) ?? 1);
  const depth = getArrayNumber(source?.size, 2, asFiniteNumber(source?.depth) ?? 1);
  const footprint = Math.max(0, width * depth);
  const elevation = Math.max(0, width * height);
  const sideElevation = Math.max(0, depth * height);
  const categoryId = source?.categoryId ?? source?.metadata?.categoryId ?? "";
  const placementMode = source?.placementMode ?? source?.type ?? "";
  const supportKind = source?.supportKind ?? source?.metadata?.supportKind ?? "";

  if (categoryId.includes("roof") || placementMode === "roof-attached") return roundMetric(footprint || elevation || 1);
  if (
    source?.openingKind ||
    source?.attachmentKind ||
    placementMode === "wall-opening" ||
    placementMode === "wall-attached" ||
    supportKind === "wall"
  ) {
    return roundMetric(Math.max(elevation, footprint, sideElevation, 1));
  }
  return roundMetric(Math.max(footprint, elevation, sideElevation, 1));
}

function estimateLengthQuantity(source) {
  const width = getArrayNumber(source?.size, 0, asFiniteNumber(source?.width) ?? 1);
  const height = getArrayNumber(source?.size, 1, asFiniteNumber(source?.height) ?? 1);
  const depth = getArrayNumber(source?.size, 2, asFiniteNumber(source?.depth) ?? 1);
  return roundMetric(Math.max(width, height, depth, 1));
}

function estimateQuantity(source, cost) {
  const defaultQuantity = asFiniteNumber(cost?.quantityBasis?.defaultQuantity);
  const unit = getUnitLabel(cost);

  if (isAreaUnit(unit)) return estimateAreaQuantity(source);
  if (isLengthUnit(unit)) return estimateLengthQuantity(source);
  if (isEachUnit(unit)) return 1;
  if (defaultQuantity !== null && defaultQuantity > 0) return roundMetric(defaultQuantity);
  return 1;
}

function getSourceLabel(source) {
  return source?.metadata?.sourceAssetLabel
    ?? source?.sourceAssetLabel
    ?? source?.metadata?.sourceLabel
    ?? source?.label
    ?? source?.name
    ?? source?.assetId
    ?? source?.id
    ?? "asset";
}

function getSourceAssetId(source) {
  return source?.metadata?.sourceAssetId ?? source?.sourceAssetId ?? source?.assetId ?? source?.id ?? null;
}

function getSourceCategory(source) {
  return source?.categoryId ?? source?.metadata?.categoryId ?? source?.type ?? source?.placementMode ?? "asset";
}

function createEstimateRow(source, scope, host = null) {
  const cost = getCostMetadata(source);
  if (!cost) {
    return {
      id: source?.id ?? `${scope}-unknown`,
      label: getSourceLabel(source),
      priced: false,
      scope
    };
  }

  const unitPrice = getPrimaryUnitPrice(cost);
  if (unitPrice === null) {
    return {
      assetId: getSourceAssetId(source),
      costClass: cost.costClass ?? null,
      id: source?.id ?? `${scope}-unknown`,
      label: getSourceLabel(source),
      priced: false,
      reviewStatus: cost.reviewStatus ?? null,
      scope
    };
  }

  const quantity = estimateQuantity(source, cost);
  const estimatedCostKrw = Math.round(unitPrice * quantity);

  return {
    assetId: getSourceAssetId(source),
    categoryId: getSourceCategory(source),
    costClass: cost.costClass ?? "unclassified",
    estimatedCostKrw,
    hostId: host?.id ?? null,
    id: source?.id ?? `${scope}-${getSourceAssetId(source) ?? "asset"}`,
    label: getSourceLabel(source),
    priced: true,
    quantity,
    quantityMethod: cost.quantityBasis?.method ?? "runtime-size",
    reviewStatus: cost.reviewStatus ?? null,
    scope,
    sourceLabel: cost.primary?.sourceLabel ?? cost.primary?.name ?? null,
    unit: getUnitLabel(cost),
    unitPriceKrw: Math.round(unitPrice)
  };
}

function createHostedOpeningSource(opening) {
  return {
    ...opening,
    categoryId: opening?.type === "door" ? "door" : "window",
    openingKind: opening?.type ?? "opening",
    placementMode: "wall-opening",
    size: [opening?.width ?? 1, opening?.height ?? 1, opening?.frameDepth ?? 0.18]
  };
}

function createHostedAttachmentSource(attachment) {
  return {
    ...attachment,
    attachmentKind: attachment?.type ?? "wall-attached",
    categoryId: attachment?.categoryId ?? "wall-pattern",
    placementMode: "wall-attached",
    size: [attachment?.width ?? 1, attachment?.height ?? 1, attachment?.depth ?? 0.05]
  };
}

function collectEstimateSources(objects = []) {
  const rows = [];
  objects.forEach((object) => {
    rows.push(createEstimateRow(object, "object"));

    const openings = [
      ...(Array.isArray(object?.room?.openings) ? object.room.openings : []),
      ...(Array.isArray(object?.wallOpenings) ? object.wallOpenings : [])
    ];
    openings.forEach((opening) => {
      rows.push(createEstimateRow(createHostedOpeningSource(opening), "opening", object));
    });

    const attachments = [
      ...(Array.isArray(object?.room?.attachments) ? object.room.attachments : []),
      ...(Array.isArray(object?.wallAttachments) ? object.wallAttachments : [])
    ];
    attachments.forEach((attachment) => {
      rows.push(createEstimateRow(createHostedAttachmentSource(attachment), "attachment", object));
    });
  });
  return rows;
}

function summarizeByCostClass(rows) {
  const groups = new Map();
  rows
    .filter((row) => row.priced)
    .forEach((row) => {
      const key = row.costClass ?? "unclassified";
      const current = groups.get(key) ?? {
        costClass: key,
        estimatedCostKrw: 0,
        itemCount: 0
      };
      current.estimatedCostKrw += row.estimatedCostKrw;
      current.itemCount += 1;
      groups.set(key, current);
    });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      estimatedCostKrw: Math.round(group.estimatedCostKrw)
    }))
    .sort((a, b) => b.estimatedCostKrw - a.estimatedCostKrw);
}

export function summarizeSceneCostEstimate(objects = []) {
  const rows = collectEstimateSources(Array.isArray(objects) ? objects : []);
  const pricedRows = rows.filter((row) => row.priced);
  const unpricedRows = rows.filter((row) => !row.priced);
  const estimatedTotalKrw = Math.round(
    pricedRows.reduce((total, row) => total + (asFiniteNumber(row.estimatedCostKrw) ?? 0), 0)
  );

  return {
    byCostClass: summarizeByCostClass(pricedRows),
    currency: "KRW",
    estimatedTotalKrw,
    limitations: DEFAULT_LIMITATIONS,
    method: "rough-order-from-asset-cost-candidates",
    pricedObjectCount: pricedRows.length,
    rows: pricedRows,
    schemaVersion: SCENE_COST_SCHEMA_VERSION,
    totalObjectCount: rows.length,
    unpricedObjectCount: unpricedRows.length
  };
}
