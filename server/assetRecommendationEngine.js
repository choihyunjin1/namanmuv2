import { searchAssetCatalog } from "./assetCatalogSearch.js";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRatio(value) {
  const number = finiteNumber(value);
  if (number == null || number <= 0) return null;
  return number > 5 ? number / 100 : number;
}

function normalizeLimit(value) {
  const number = Math.round(finiteNumber(value) ?? DEFAULT_LIMIT);
  return Math.min(MAX_LIMIT, Math.max(1, number));
}

function normalizeParcel(input = {}) {
  const areaM2 = finiteNumber(input.areaM2 ?? input.landAreaM2 ?? input.area);
  const maxBuildingCoverageRatio = normalizeRatio(
    input.maxBuildingCoverageRatio ?? input.buildingCoverageRatio ?? input.bcr ?? input.coverageRatio
  );
  const maxFloorAreaRatio = normalizeRatio(
    input.maxFloorAreaRatio ?? input.floorAreaRatio ?? input.far
  );
  const footprintLimitM2 = areaM2 && maxBuildingCoverageRatio
    ? Number((areaM2 * maxBuildingCoverageRatio).toFixed(2))
    : null;
  const floorAreaLimitM2 = areaM2 && maxFloorAreaRatio
    ? Number((areaM2 * maxFloorAreaRatio).toFixed(2))
    : null;

  return {
    areaM2,
    footprintLimitM2,
    floorAreaLimitM2,
    maxBuildingCoverageRatio,
    maxFloorAreaRatio,
    zone: String(input.zone ?? input.landUseZone ?? "").trim()
  };
}

function getPromptIntent(prompt) {
  const text = normalizeText(prompt);
  return {
    detachedHouse: /단독|주택|house|home|residential|외관|전원|2층|이층/.test(text),
    exterior: /외관|파사드|facade|exterior|입면|시안|컨셉/.test(text),
    materialWarm: /목재|우드|따뜻|warm|wood|timber|내추럴|natural/.test(text),
    modern: /모던|modern|심플|simple|minimal|미니멀/.test(text),
    roof: /지붕|roof|박공|경사|hip|gable/.test(text),
    window: /창|창문|window|glass|유리/.test(text)
  };
}

function uniqueSearchQueries(queries) {
  const seen = new Set();
  return queries
    .map((query) => String(query ?? "").trim())
    .filter(Boolean)
    .filter((query) => {
      const key = normalizeText(query);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildRecommendationSearchQueries(prompt, intent, parcel) {
  const queries = [prompt];

  if (intent.detachedHouse || intent.exterior) {
    queries.push("house", "detached house", "house shell", "residential exterior");
  }
  if (intent.modern) {
    queries.push("modern house", "simple house", "minimal house");
  }
  if (intent.materialWarm) {
    queries.push("wood house", "timber exterior", "natural house");
  }
  if (intent.roof) {
    queries.push("roof", "gable roof");
  }
  if (intent.window) {
    queries.push("window", "glass");
  }
  if (parcel.zone && (intent.detachedHouse || intent.exterior)) {
    queries.push(`${parcel.zone} house`);
  }

  queries.push("house");
  return uniqueSearchQueries(queries);
}

async function searchRecommendationCandidates(prompt, intent, parcel, options) {
  const attemptedQueries = buildRecommendationSearchQueries(prompt, intent, parcel);
  let lastResponse = null;

  for (const query of attemptedQueries) {
    const response = await searchAssetCatalog(query, options);
    lastResponse = response;
    if (!response.ok) return { attemptedQueries, response, usedQuery: query };
    if (response.data.results.length > 0) {
      return { attemptedQueries, response, usedQuery: query };
    }
  }

  return {
    attemptedQueries,
    response: lastResponse ?? await searchAssetCatalog("", options),
    usedQuery: attemptedQueries.at(-1) ?? ""
  };
}

function estimateFootprintM2(asset) {
  const [width = 0, , depth = 0] = asset?.size ?? [];
  const footprint = finiteNumber(width) * finiteNumber(depth);
  return Number.isFinite(footprint) && footprint > 0 ? Number(footprint.toFixed(2)) : null;
}

function estimateFloorAreaM2(asset) {
  const footprint = estimateFootprintM2(asset);
  if (!footprint) return null;
  const tags = new Set(Array.isArray(asset?.tags) ? asset.tags : []);
  const floors = tags.has("two-story") || /2층|two/i.test(String(asset?.label ?? "")) ? 2 : 1;
  return Number((footprint * floors).toFixed(2));
}

function getZoneFit(asset, parcel) {
  if (!parcel.zone) return { state: "unknown", score: 0, reason: "용도지역 입력 없음" };
  const zones = Array.isArray(asset.compatibleZones) ? asset.compatibleZones : [];
  if (!zones.length) return { state: "unknown", score: 2, reason: "자산 용도지역 메타데이터 없음" };
  if (zones.includes(parcel.zone)) return { state: "match", score: 12, reason: `${parcel.zone} 호환` };
  return { state: "review", score: -8, reason: `${parcel.zone} 직접 호환 정보 없음` };
}

function getCoverageFit(asset, parcel) {
  const footprintM2 = estimateFootprintM2(asset);
  const floorAreaM2 = estimateFloorAreaM2(asset);
  const footprintOk = parcel.footprintLimitM2 && footprintM2
    ? footprintM2 <= parcel.footprintLimitM2
    : null;
  const floorAreaOk = parcel.floorAreaLimitM2 && floorAreaM2
    ? floorAreaM2 <= parcel.floorAreaLimitM2
    : null;
  const score =
    (footprintOk === true ? 5 : footprintOk === false ? -10 : 0) +
    (floorAreaOk === true ? 5 : floorAreaOk === false ? -10 : 0);

  return {
    estimatedFloorAreaM2: floorAreaM2,
    estimatedFootprintM2: footprintM2,
    floorAreaLimitM2: parcel.floorAreaLimitM2,
    floorAreaOk,
    footprintLimitM2: parcel.footprintLimitM2,
    footprintOk,
    score
  };
}

function scoreRecommendation(asset, searchScore, intent, parcel) {
  const reasons = [];
  let score = Math.min(80, Math.max(0, Number(searchScore) || 0));

  if (intent.detachedHouse && asset.type === "house-shell") {
    score += 28;
    reasons.push("주택 외관 프롬프트와 house-shell 자산이 일치");
  }
  if (intent.exterior && (asset.type === "house-shell" || asset.cost?.costClass === "exterior-shell-assembly")) {
    score += 12;
    reasons.push("외관 시안 목적에 맞는 쉘/외장 자산");
  }
  if (intent.materialWarm && /wood|timber|목재|timber/i.test([asset.label, ...(asset.tags ?? [])].join(" "))) {
    score += 10;
    reasons.push("목재/따뜻한 재료 키워드와 태그가 일치");
  }
  if (intent.modern && /modern|minimal|simple|모던|미니멀/i.test([asset.label, ...(asset.tags ?? [])].join(" "))) {
    score += 8;
    reasons.push("모던/미니멀 스타일 키워드와 태그가 일치");
  }
  if (intent.roof && asset.categoryId === "roof") {
    score += 8;
    reasons.push("지붕 관련 프롬프트와 지붕 자산이 일치");
  }
  if (intent.window && asset.categoryId === "window") {
    score += 8;
    reasons.push("창호 관련 프롬프트와 창문 자산이 일치");
  }
  if (asset.cost?.primary?.unitPriceKrw || asset.cost?.defaultRoughCostKrw) {
    score += 4;
    reasons.push("조달/가격 후보가 매핑된 자산");
  }
  if (asset.modelUrl && asset.thumbnailSrc) {
    score += 3;
    reasons.push("웹 미리보기용 GLB와 썸네일 준비 완료");
  }

  const zoneFit = getZoneFit(asset, parcel);
  const coverageFit = getCoverageFit(asset, parcel);
  score += zoneFit.score + coverageFit.score;
  if (zoneFit.state !== "unknown") reasons.push(zoneFit.reason);
  if (coverageFit.footprintOk === true) reasons.push("건폐율 기반 추정 footprint 통과");
  if (coverageFit.floorAreaOk === true) reasons.push("용적률 기반 추정 연면적 통과");
  if (coverageFit.footprintOk === false) reasons.push("건폐율 추정 초과 검토 필요");
  if (coverageFit.floorAreaOk === false) reasons.push("용적률 추정 초과 검토 필요");

  return {
    fit: {
      coverage: coverageFit,
      zone: zoneFit
    },
    reasons: reasons.length ? reasons : ["검색어와 자산 메타데이터 기반 후보"],
    score: Number(score.toFixed(2))
  };
}

function buildRecommendationRationale(recommendations) {
  const top = recommendations[0];
  return {
    method: "keyword-metadata-cost-constraint-ranker",
    topReason: top?.reasons?.[0] ?? "추천 후보 없음",
    usedSignals: [
      "prompt keywords",
      "asset tags and BIM metadata",
      "GLB readiness",
      "procurement cost mapping",
      "parcel zone/BCR/FAR constraints"
    ]
  };
}

export async function recommendAssets(input = {}, options = {}) {
  const prompt = String(input.prompt ?? input.query ?? "").trim();
  const limit = normalizeLimit(input.limit);
  const parcel = normalizeParcel(input.parcel ?? input);
  const intent = getPromptIntent(prompt);
  const searchPrompt = prompt || [parcel.zone, "house"].filter(Boolean).join(" ");
  const searchOutcome = await searchRecommendationCandidates(searchPrompt, intent, parcel, options);
  const searchResult = searchOutcome.response;

  if (!searchResult.ok) {
    return {
      ok: false,
      code: searchResult.code,
      message: searchResult.message,
      data: {
        constraints: parcel,
        recommendations: [],
        rationale: buildRecommendationRationale([])
      }
    };
  }

  const recommendations = searchResult.data.results
    .map((asset) => {
      const scored = scoreRecommendation(asset, asset.score, intent, parcel);
      return {
        asset,
        fit: scored.fit,
        reasons: scored.reasons,
        score: scored.score
      };
    })
    .sort((first, second) => second.score - first.score || first.asset.label.localeCompare(second.asset.label, "ko-KR"))
    .slice(0, limit);

  return {
    ok: true,
    data: {
      constraints: parcel,
      input: {
        limit,
        prompt
      },
      recommendations,
      rationale: buildRecommendationRationale(recommendations),
      search: {
        attemptedQueries: searchOutcome.attemptedQueries,
        facets: searchResult.data.facets,
        query: searchResult.data.query,
        total: searchResult.data.total,
        usedQuery: searchOutcome.usedQuery
      }
    }
  };
}
