import React, { useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import { EDITOR_GRID } from "./editorDefaults.js";
import { StudioAssetRecommendationStrip } from "./StudioAssetRecommendationStrip.jsx";

const DEFAULT_RECOMMENDATION_LIMIT = 5;
const DEFAULT_RECOMMENDATION_PARCEL = {
  areaM2: EDITOR_GRID.parcelWidth * EDITOR_GRID.parcelDepth,
  depthM: EDITOR_GRID.parcelDepth,
  maxBuildingCoverageRatio: 0.6,
  maxFloorAreaRatio: 1,
  widthM: EDITOR_GRID.parcelWidth,
  zone: "제1종일반주거지역"
};
const ACTION_LABELS = {
  attach_roof: "지붕",
  create_room_shell: "방",
  place_garden_fence: "외부"
};

function getAssetRecommendations(payload) {
  const recommendations = Array.isArray(payload?.data?.recommendations)
    ? payload.data.recommendations
    : Array.isArray(payload?.recommendations)
      ? payload.recommendations
      : Array.isArray(payload)
        ? payload
        : [];

  return recommendations
    .map((recommendation) => {
      const asset = recommendation?.asset ?? recommendation;
      if (!asset?.id) return null;

      return {
        asset,
        fit: recommendation?.fit ?? null,
        reasons: Array.isArray(recommendation?.reasons) ? recommendation.reasons : [],
        score: Number.isFinite(Number(recommendation?.score)) ? Number(recommendation.score) : null
      };
    })
    .filter(Boolean);
}

function getGenerationAudit(status) {
  const audit = status?.audit;
  if (!audit || typeof audit !== "object") return null;

  const actions = Array.isArray(audit.plannedActions) ? audit.plannedActions : [];
  const summary = audit.semanticCommandPlan?.summary ?? {};
  const attachedSlots = Array.isArray(audit.attachedAssetSlots) ? audit.attachedAssetSlots : [];
  return {
    actions: actions.slice(0, 4),
    attachedSlots,
    commandCount: summary.commandCount ?? actions.length,
    floorCount: summary.floorCount ?? null,
    roomCommandCount: summary.roomCommandCount ?? null,
    strategy: audit.semanticCommandPlan?.strategy ?? "pascal-style-tool-command-plan",
    template: audit.selectedTemplate ?? null
  };
}

function StudioGenerationAudit({ status }) {
  const audit = getGenerationAudit(status);
  if (!audit) return null;

  return (
    <div className="studio-generation-audit" aria-label="AI 생성 작업 내역">
      <div>
        <strong>Plan</strong>
        <span>{audit.commandCount} actions · {audit.strategy}</span>
      </div>
      <div className="studio-generation-audit-chips">
        {audit.floorCount ? <em>{audit.floorCount}F</em> : null}
        {audit.roomCommandCount ? <em>{audit.roomCommandCount} rooms</em> : null}
        {audit.attachedSlots.length ? <em>{audit.attachedSlots.length} asset slots</em> : null}
        {audit.template ? <em>{audit.template}</em> : null}
      </div>
      <ol>
        {audit.actions.map((action) => (
          <li key={action.id}>
            <span>{ACTION_LABELS[action.type] ?? action.type}</span>
            <b>{action.floor ? `${action.floor}F` : "scene"}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StudioAssetGenerationControls({
  generationStatus = null,
  onAssetPick,
  onDragAssetStart,
  onGenerateAsset,
  onGenerateSceneFromBrief,
  onSourceFilterChange,
  searchTerm = ""
}) {
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [assetRecommendation, setAssetRecommendation] = useState({
    message: "",
    prompt: "",
    recommendations: [],
    status: "idle"
  });

  const generationPromptValue = generationPrompt.trim();
  const recommendationPrompt = generationPromptValue || searchTerm.trim();
  const recommendationParcelLabel = useMemo(
    () =>
      `${DEFAULT_RECOMMENDATION_PARCEL.zone} · ${DEFAULT_RECOMMENDATION_PARCEL.widthM}x${DEFAULT_RECOMMENDATION_PARCEL.depthM}m · BCR ${Math.round(DEFAULT_RECOMMENDATION_PARCEL.maxBuildingCoverageRatio * 100)}% · FAR ${Math.round(DEFAULT_RECOMMENDATION_PARCEL.maxFloorAreaRatio * 100)}%`,
    []
  );
  const canGenerateAsset = Boolean(onGenerateAsset) && generationPromptValue.length > 0 && generationStatus?.state !== "loading";
  const canGenerateBriefScene = Boolean(onGenerateSceneFromBrief) && generationPromptValue.length > 0 && generationStatus?.state !== "loading";
  const canRecommendAssets = recommendationPrompt.length > 0 && assetRecommendation.status !== "loading";

  const handleGenerateSubmit = async (event) => {
    event.preventDefault();
    if (!generationPromptValue || !onGenerateAsset) return;
    const result = await onGenerateAsset(generationPromptValue);
    if (result?.ok !== false) {
      setGenerationPrompt("");
      onSourceFilterChange?.("generated");
    }
  };

  const handleGenerateBriefScene = async () => {
    if (!generationPromptValue || !onGenerateSceneFromBrief) return;
    const result = await onGenerateSceneFromBrief(generationPromptValue);
    if (result?.ok !== false) {
      setGenerationPrompt("");
      onSourceFilterChange?.("all");
    }
  };

  const handleRecommendAssets = async () => {
    const prompt = recommendationPrompt;
    if (!prompt) return;

    setAssetRecommendation({
      message: "",
      prompt,
      recommendations: [],
      status: "loading"
    });

    try {
      const response = await fetch("/api/assets/recommend", {
        body: JSON.stringify({
          limit: DEFAULT_RECOMMENDATION_LIMIT,
          parcel: DEFAULT_RECOMMENDATION_PARCEL,
          prompt
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      if (!response.ok) throw new Error(`Asset recommendation failed: ${response.status}`);

      const payload = await response.json();
      if (payload?.ok === false) throw new Error(payload.message ?? "Asset recommendation failed");

      const recommendations = getAssetRecommendations(payload);
      setAssetRecommendation({
        message: payload?.data?.rationale?.summary ?? "",
        prompt,
        recommendations,
        status: recommendations.length ? "ready" : "empty"
      });
    } catch (error) {
      setAssetRecommendation({
        message: error?.message ?? "추천 자산을 불러오지 못했습니다.",
        prompt,
        recommendations: [],
        status: "offline"
      });
    }
  };

  return (
    <>
      <form className="studio-catalog-generator" onSubmit={handleGenerateSubmit}>
        <label>
          <WandSparkles size={14} />
          <input
            aria-label="자연어 3D 자산 생성"
            onChange={(event) => setGenerationPrompt(event.target.value)}
            placeholder="자연어로 CAD 초안 생성"
            type="text"
            value={generationPrompt}
          />
        </label>
        <button disabled={!canGenerateAsset} type="submit">
          {generationStatus?.state === "loading" ? "생성중" : "Generate"}
        </button>
        <button disabled={!canGenerateBriefScene} onClick={handleGenerateBriefScene} type="button">
          집 초안
        </button>
        {generationStatus?.message ? <span>{generationStatus.message}</span> : null}
      </form>
      <StudioGenerationAudit status={generationStatus} />
      <StudioAssetRecommendationStrip
        canRecommendAssets={canRecommendAssets}
        onAssetPick={onAssetPick}
        onDragAssetStart={onDragAssetStart}
        onRecommendAssets={handleRecommendAssets}
        recommendation={assetRecommendation}
        recommendationParcelLabel={recommendationParcelLabel}
        recommendationPrompt={recommendationPrompt}
      />
    </>
  );
}
