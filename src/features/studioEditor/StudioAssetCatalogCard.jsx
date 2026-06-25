import React from "react";
import {
  getAssetHostLabel,
  getAssetIconSrc,
  getAssetMetaLabel,
  getAssetPreviewMeta,
  getAssetStatus,
  getAssetStatusLabel,
  getAssetTaxonomyLabel,
  getInteractionVerb,
  getPlacementBadgeLabel,
  getPlacementHint,
  getPlacementLabel,
  getPreviewQuality,
  getPreviewQualityLabel,
  getReadablePlacementLabel
} from "./studioAssetCatalogDisplay.js";

function CatalogPreview({ asset, badgeLabel, iconSrc, shape }) {
  const preview = getAssetPreviewMeta(asset);
  const previewStyle = {
    "--asset-accent": preview.accent,
    "--asset-swatch": preview.swatch,
    "--asset-trim": preview.trim
  };

  return (
    <div
      className={`studio-catalog-preview has-asset-preview is-${shape} is-preview-${preview.kind}`}
      data-badge={badgeLabel}
      data-preview-kind={preview.kind}
      style={previewStyle}
    >
      {preview.thumbnailSrc ? <img alt="" className="studio-catalog-preview-thumb" draggable="false" src={preview.thumbnailSrc} /> : null}
      <span className="studio-catalog-preview-scene" aria-hidden="true">
        <span className="studio-catalog-preview-ground" />
        <span className="studio-catalog-preview-primitive" />
      </span>
      {iconSrc ? <img alt="" className="studio-catalog-preview-icon" draggable="false" src={iconSrc} /> : null}
      <span className="studio-catalog-preview-swatches" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="studio-catalog-preview-kind">{preview.materialLabel}</span>
    </div>
  );
}

export function StudioAssetCatalogCard({
  asset,
  categoryLabel = "",
  isActive = false,
  onAssetPick,
  onDragAssetStart,
  searchActive = false
}) {
  const isDrawTool = ["draw-room", "draw-wall"].includes(asset.placementMode);
  const isPlacementTool = Boolean(asset.placementMode);
  const placementLabel = getPlacementLabel(asset);
  const placementBadgeLabel = getPlacementBadgeLabel(asset);
  const placementPolicyLabel = getReadablePlacementLabel(asset);
  const placementHint = getPlacementHint(asset);
  const sizeLabel = getAssetMetaLabel(asset);
  const hostLabel = getAssetHostLabel(asset);
  const taxonomyLabel = getAssetTaxonomyLabel(asset);
  const previewMeta = getAssetPreviewMeta(asset);
  const assetStatus = getAssetStatus(asset);
  const assetStatusLabel = getAssetStatusLabel(asset);
  const interactionVerb = getInteractionVerb(asset, isDrawTool);
  const previewQuality = getPreviewQuality(asset);
  const previewQualityLabel = getPreviewQualityLabel(asset);
  const isComingSoon = assetStatus === "coming-soon";
  const metaLabel = searchActive ? categoryLabel || sizeLabel : sizeLabel;
  const isRecommended = Number.isFinite(Number(asset.recommendationScore));
  const recommendationScoreLabel = asset.recommendationScoreLabel ?? (isRecommended ? `score ${Number(Number(asset.recommendationScore).toFixed(2))}` : "");
  const recommendationReason = asset.recommendationReason ?? "";

  return (
    <button
      aria-disabled={isComingSoon ? "true" : undefined}
      aria-label={`${asset.label}, ${isRecommended ? `RAG 추천 ${recommendationScoreLabel}, ` : ""}${assetStatusLabel}, ${previewQualityLabel}, ${placementBadgeLabel}, ${previewMeta.materialLabel}, ${sizeLabel}, ${hostLabel}, ${taxonomyLabel}, ${placementHint}`}
      aria-pressed={isActive}
      className={[
        "studio-catalog-asset-card",
        isPlacementTool ? "is-tool" : "",
        isDrawTool ? "is-draw-tool" : "is-draggable",
        isRecommended ? "is-recommended" : "",
        assetStatus ? `is-status-${assetStatus}` : "",
        previewQuality ? `is-quality-${previewQuality}` : "",
        isActive ? "is-active" : ""
      ].filter(Boolean).join(" ")}
      data-action={isDrawTool ? "click-tool" : "drag-asset"}
      data-action-label={interactionVerb}
      data-badge={placementBadgeLabel}
      data-disabled-reason={isComingSoon ? asset.disabledReason ?? "후속 구현 예정" : undefined}
      data-meta={sizeLabel}
      data-placement={placementLabel}
      data-policy={hostLabel}
      data-preview-kind={previewMeta.kind}
      data-preview-quality={previewQuality}
      data-recommendation={isRecommended ? "true" : undefined}
      data-status={assetStatus}
      data-swatch={previewMeta.swatch}
      disabled={isComingSoon}
      draggable={!isDrawTool && !isComingSoon}
      onClick={() => {
        if (isComingSoon) return;
        onAssetPick?.(asset);
      }}
      onDragStart={(event) => {
        if (isComingSoon) {
          event.preventDefault();
          return;
        }
        if (isDrawTool) {
          event.preventDefault();
          onAssetPick?.(asset);
          return;
        }
        onAssetPick?.(asset.placementMode ? asset : null);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-ploton-asset", asset.id);
        onDragAssetStart?.(asset);
      }}
      onDragEnd={() => onDragAssetStart?.(null)}
      title={[
        asset.label,
        isRecommended ? `RAG 추천 ${recommendationScoreLabel}` : null,
        recommendationReason,
        asset.recommendationPrompt ? `prompt: ${asset.recommendationPrompt}` : null,
        assetStatusLabel,
        previewQualityLabel,
        placementBadgeLabel,
        sizeLabel,
        hostLabel,
        taxonomyLabel,
        placementPolicyLabel,
        placementHint
      ].filter(Boolean).join(" · ")}
      type="button"
    >
      <span className="studio-catalog-asset-mode">{placementBadgeLabel}</span>
      <CatalogPreview asset={asset} badgeLabel={placementBadgeLabel} iconSrc={getAssetIconSrc(asset)} shape={asset.shape} />
      <span className="studio-catalog-asset-content">
        <span className="studio-catalog-asset-title">{asset.label}</span>
        {isRecommended ? (
          <span className="studio-catalog-asset-recommendation-row">
            <small>RAG 추천</small>
            <em>{recommendationScoreLabel}</em>
          </span>
        ) : null}
        <span className="studio-catalog-asset-status-row">
          <small>{assetStatusLabel}</small>
          <em>{previewQualityLabel}</em>
          <strong>{interactionVerb}</strong>
        </span>
        <span className="studio-catalog-asset-material">
          <i style={{ "--asset-swatch": previewMeta.swatch }} />
          <span>{previewMeta.materialLabel}</span>
        </span>
        <span className="studio-catalog-asset-meta-row">
          <small>{metaLabel}</small>
          <em>{hostLabel}</em>
        </span>
        <span className="studio-catalog-asset-meta-row is-taxonomy">
          <small>{taxonomyLabel}</small>
          <em>{placementPolicyLabel}</em>
        </span>
      </span>
    </button>
  );
}
