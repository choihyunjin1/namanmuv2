import React from "react";
import { WandSparkles } from "lucide-react";

function getRecommendationScoreLabel(score) {
  if (!Number.isFinite(score)) return null;
  return `score ${Number(score.toFixed(2))}`;
}

function formatKrw(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `₩${new Intl.NumberFormat("ko-KR").format(Math.round(number))}`;
}

function getRecommendationCostLabel(asset) {
  const primaryPrice = formatKrw(asset?.cost?.primary?.unitPriceKrw);
  if (primaryPrice) {
    return `${primaryPrice}${asset?.cost?.primary?.unit ? `/${asset.cost.primary.unit}` : ""}`;
  }

  const roughCost = formatKrw(asset?.cost?.defaultRoughCostKrw);
  if (roughCost) return `개략 ${roughCost}`;
  if (asset?.cost?.catalogStatus) return "가격 검토";
  return "가격 미매핑";
}

function getRecommendationSourceLabel(asset) {
  const source = [
    asset?.cost?.primary?.sourceLabel,
    asset?.sourceType,
    asset?.source,
    asset?.sourceId,
    asset?.librarySource
  ].find(Boolean);
  const text = String(source ?? "catalog");
  if (text.includes("조달청")) return "조달청";
  if (text.toLowerCase() === "ifc") return "IFC";
  if (text.includes("ploton") || text.includes("PLOT:ON")) return "PLOT:ON";
  return text.slice(0, 18);
}

function getRecommendationMaterialLabel(asset) {
  return [
    asset?.cost?.primary?.classificationName,
    asset?.previewMaterialLabel,
    asset?.componentKind,
    asset?.previewQuality
  ].find(Boolean) ?? "asset";
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
        if (!asset?.id) return null;
        const reason = item.reasons?.[0];
        const scoreLabel = getRecommendationScoreLabel(item.score);
        const costLabel = getRecommendationCostLabel(asset);
        const sourceLabel = getRecommendationSourceLabel(asset);
        const materialLabel = getRecommendationMaterialLabel(asset);

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
              costLabel,
              sourceLabel,
              materialLabel,
              reason,
              recommendation?.prompt ? `prompt: ${recommendation.prompt}` : null,
              `parcel: ${recommendationParcelLabel}`
            ].filter(Boolean).join(" · ")}
            type="button"
          >
            <span className="studio-catalog-recommendation-title">
              {asset.label ?? asset.id}
            </span>
            <span className="studio-catalog-recommendation-meta">
              {scoreLabel ? <em>{scoreLabel}</em> : null}
              <em>{costLabel}</em>
              <em>{sourceLabel}</em>
              <em>{materialLabel}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}
