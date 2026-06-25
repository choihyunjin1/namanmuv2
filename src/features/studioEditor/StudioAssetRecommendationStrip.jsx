import React from "react";
import { WandSparkles } from "lucide-react";

function getRecommendationScoreLabel(score) {
  if (!Number.isFinite(score)) return null;
  return `score ${Number(score.toFixed(2))}`;
}

function getRecommendationStatusLabel(status, recommendationCount) {
  if (status === "loading") return "프롬프트/토지조건 기반 추천 중";
  if (status === "ready") return `${recommendationCount}개 추천 · 프롬프트/토지조건 기반`;
  if (status === "empty") return "추천 결과 없음 · 기존 카탈로그 사용 가능";
  if (status === "offline") return "추천 API offline · 기존 카탈로그 사용 가능";
  return "프롬프트/토지조건 기반 추천";
}

export function StudioAssetRecommendationStrip({
  canRecommendAssets = false,
  onAssetPick,
  onDragAssetStart,
  onRecommendAssets,
  recommendation,
  recommendationParcelLabel,
  recommendationPrompt = ""
}) {
  const recommendations = Array.isArray(recommendation?.recommendations) ? recommendation.recommendations : [];
  const status = recommendation?.status ?? "idle";
  const statusLabel = getRecommendationStatusLabel(status, recommendations.length);

  return (
    <div
      className="studio-catalog-recent studio-catalog-recommendations"
      aria-label="프롬프트와 토지조건 기반 추천 자산"
      data-state={status}
      title={`프롬프트: ${recommendationPrompt || "입력 필요"} · 토지조건: ${recommendationParcelLabel}`}
    >
      <WandSparkles size={14} />
      <button disabled={!canRecommendAssets} onClick={onRecommendAssets} type="button">
        {status === "loading" ? "추천중" : "추천"}
      </button>
      <span role="status">
        {statusLabel}
      </span>
      {recommendations.map((item) => {
        const { asset } = item;
        const reason = item.reasons?.[0];
        const scoreLabel = getRecommendationScoreLabel(item.score);

        return (
          <button
            className="studio-catalog-recommendation-result"
            draggable
            key={asset.id}
            onClick={() => onAssetPick?.(asset)}
            onDragEnd={() => onDragAssetStart?.(null)}
            onDragStart={(event) => {
              onAssetPick?.(asset.placementMode ? asset : null);
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-ploton-asset", asset.id);
              onDragAssetStart?.(asset);
            }}
            title={[
              asset.label ?? asset.id,
              scoreLabel,
              reason,
              recommendation?.prompt ? `prompt: ${recommendation.prompt}` : null,
              `parcel: ${recommendationParcelLabel}`
            ].filter(Boolean).join(" · ")}
            type="button"
          >
            {asset.label ?? asset.id}
          </button>
        );
      })}
    </div>
  );
}
