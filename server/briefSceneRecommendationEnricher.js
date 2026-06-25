import { recommendAssets } from "./assetRecommendationEngine.js";

const BRIEF_SCENE_RECOMMENDATION_LIMIT = 3;

function compactCost(cost) {
  if (!cost || typeof cost !== "object") return null;
  return {
    catalogStatus: cost.catalogStatus ?? null,
    costClass: cost.costClass ?? null,
    defaultRoughCostKrw: cost.defaultRoughCostKrw ?? null,
    limitations: Array.isArray(cost.limitations) ? cost.limitations.slice(0, 3) : [],
    primary: cost.primary
      ? {
        confidence: cost.primary.confidence ?? null,
        name: cost.primary.name ?? null,
        sourceLabel: cost.primary.sourceLabel ?? null,
        unit: cost.primary.unit ?? null,
        unitPriceKrw: cost.primary.unitPriceKrw ?? null
      }
      : null,
    reviewStatus: cost.reviewStatus ?? null
  };
}

function compactAssetRecommendation(recommendation, slot) {
  const asset = recommendation?.asset;
  if (!asset?.id) return null;
  return {
    asset: {
      categoryId: asset.categoryId ?? null,
      componentKind: asset.componentKind ?? null,
      cost: compactCost(asset.cost),
      id: asset.id,
      label: asset.label ?? asset.id,
      modelUrl: asset.modelUrl ?? null,
      placementMode: asset.placementMode ?? null,
      previewQuality: asset.previewQuality ?? null,
      runtime: asset.runtime
        ? {
          estimatedDownloadMb: asset.runtime.estimatedDownloadMb ?? null,
          loadStrategy: asset.runtime.loadStrategy ?? null,
          optimizedSizeBytes: asset.runtime.optimizedSizeBytes ?? null,
          sizeBytes: asset.runtime.sizeBytes ?? null
        }
        : null,
      size: asset.size ?? null,
      sourceType: asset.sourceType ?? null,
      thumbnailSrc: asset.thumbnailSrc ?? null
    },
    fit: recommendation.fit ?? null,
    reasons: Array.isArray(recommendation.reasons) ? recommendation.reasons.slice(0, 3) : [],
    score: Number.isFinite(Number(recommendation.score)) ? Number(recommendation.score) : null,
    slot
  };
}

function slotMatchesRecommendation(slot, recommendation) {
  const asset = recommendation?.asset ?? {};
  if (slot.categoryId && asset.categoryId === slot.categoryId) return true;
  if (slot.componentKind && asset.componentKind === slot.componentKind) return true;
  if (slot.assetType && String(asset.type ?? "").includes(slot.assetType)) return true;
  return false;
}

function createBriefSceneRecommendationSlots(scene) {
  const brief = scene.summary?.brief ?? "";
  const hasGarden = scene.objects.some((object) => object.categoryId === "railing");
  const slots = [
    {
      assetType: "house-shell",
      categoryId: "wall-tool",
      id: "house-shell",
      prompt: `${brief} 단독주택 외관 house shell`
    },
    {
      categoryId: "roof",
      componentKind: "roof",
      id: "roof",
      prompt: `${brief} 지붕 roof`
    },
    {
      categoryId: "door",
      componentKind: "door",
      id: "door",
      prompt: `${brief} 현관문 door`
    },
    {
      categoryId: "window",
      componentKind: "window",
      id: "window",
      prompt: `${brief} 창문 window glass`
    }
  ];

  if (hasGarden) {
    slots.push({
      categoryId: "railing",
      componentKind: "fence",
      id: "railing",
      prompt: `${brief} 정원 울타리 fence railing`
    });
  }

  return slots;
}

function attachRecommendationToObjects(objects, selectedBySlot) {
  return objects.map((object) => {
    const next = { ...object };
    const slots = [];

    if (object.type === "room" && selectedBySlot["house-shell"]) {
      slots.push("house-shell");
    }
    if (object.categoryId === "roof" && selectedBySlot.roof) {
      slots.push("roof");
    }
    if (object.categoryId === "railing" && selectedBySlot.railing) {
      slots.push("railing");
    }

    if (slots.length) {
      next.metadata = {
        ...(object.metadata ?? {}),
        assetRecommendationSlots: slots,
        primaryRecommendedAsset: selectedBySlot[slots[0]]?.asset?.id ?? null,
        recommendedAssets: Object.fromEntries(
          slots.map((slot) => [slot, selectedBySlot[slot]]).filter(([, recommendation]) => recommendation)
        )
      };
    }

    if (object.room?.openings?.length) {
      next.room = {
        ...object.room,
        openings: object.room.openings.map((opening) => {
          const slot = opening.type === "door" ? "door" : opening.type === "window" ? "window" : null;
          const recommendation = slot ? selectedBySlot[slot] : null;
          if (!recommendation) return opening;
          return {
            ...opening,
            assetRecommendation: {
              asset: recommendation.asset,
              fit: recommendation.fit,
              reasons: recommendation.reasons,
              score: recommendation.score,
              slot
            }
          };
        })
      };
    }

    return next;
  });
}

export async function enrichBriefSceneWithAssetRecommendations(scene, payload = {}) {
  const slots = createBriefSceneRecommendationSlots(scene);
  const parcel = payload.parcel ?? payload.land ?? {};
  const slotResults = {};
  const selectedBySlot = {};
  const errors = [];

  for (const slot of slots) {
    try {
      const response = await recommendAssets({
        limit: BRIEF_SCENE_RECOMMENDATION_LIMIT,
        parcel,
        prompt: slot.prompt
      });
      const recommendations = response.ok && Array.isArray(response.data?.recommendations)
        ? response.data.recommendations
        : [];
      const matchedRecommendations = recommendations.filter((recommendation) =>
        slotMatchesRecommendation(slot, recommendation)
      );
      const compactRecommendations = (matchedRecommendations.length ? matchedRecommendations : recommendations.slice(0, 1))
        .map((recommendation) => compactAssetRecommendation(recommendation, slot.id))
        .filter(Boolean);

      slotResults[slot.id] = {
        categoryId: slot.categoryId ?? null,
        prompt: slot.prompt,
        recommendations: compactRecommendations,
        status: compactRecommendations.length ? "ready" : "empty",
        topReason: response.data?.rationale?.topReason ?? null,
        usedQuery: response.data?.search?.usedQuery ?? null
      };

      if (compactRecommendations[0]) {
        selectedBySlot[slot.id] = compactRecommendations[0];
      }
    } catch (error) {
      errors.push({ message: error.message, slot: slot.id });
      slotResults[slot.id] = {
        categoryId: slot.categoryId ?? null,
        prompt: slot.prompt,
        recommendations: [],
        status: "error"
      };
    }
  }

  const attachedSlots = Object.keys(selectedBySlot);
  return {
    ...scene,
    assetRecommendations: {
      attachedSlots,
      errors,
      limit: BRIEF_SCENE_RECOMMENDATION_LIMIT,
      method: "brief-slot-keyword-rag",
      slots: slotResults,
      status: errors.length
        ? attachedSlots.length ? "partial" : "unavailable"
        : attachedSlots.length ? "ready" : "empty"
    },
    decisionAudit: {
      ...scene.decisionAudit,
      assetRecommendation: {
        attachedSlots,
        method: "brief-slot-keyword-rag",
        requestedSlots: slots.map((slot) => slot.id),
        status: errors.length
          ? attachedSlots.length ? "partial" : "unavailable"
          : attachedSlots.length ? "ready" : "empty"
      }
    },
    objects: attachRecommendationToObjects(scene.objects, selectedBySlot)
  };
}
