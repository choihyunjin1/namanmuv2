import React from "react";
import { Home, WandSparkles } from "lucide-react";

export function StudioAssetAiLeadingTile({
  generationStatus = null,
  onGenerateSceneFromBrief,
  prompt = ""
}) {
  const brief = String(prompt ?? "").trim();
  if (brief.length < 2) return null;

  const isLoading = generationStatus?.state === "loading";
  const canGenerate = Boolean(onGenerateSceneFromBrief) && !isLoading;

  return (
    <button
      aria-label={`AI 집 초안 생성: ${brief}`}
      className={[
        "studio-catalog-asset-card",
        "studio-catalog-ai-leading-tile",
        canGenerate ? "is-tool" : "is-status-coming-soon"
      ].join(" ")}
      data-action-label={isLoading ? "생성중" : "AI"}
      disabled={!canGenerate}
      onClick={() => onGenerateSceneFromBrief?.(brief)}
      title={`검색 문장을 Pascal-style semantic command plan으로 변환: ${brief}`}
      type="button"
    >
      <span className="studio-catalog-ai-leading-icon" aria-hidden="true">
        <WandSparkles size={18} />
        <Home size={20} />
      </span>
      <span className="studio-catalog-ai-leading-content">
        <strong>AI 집 초안</strong>
        <small>{brief}</small>
        <em>brief → command plan → scene</em>
      </span>
    </button>
  );
}
