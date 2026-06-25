import React from "react";
import { Home, WandSparkles } from "lucide-react";

function getAiTileAuditBadges(generationStatus) {
  const audit = generationStatus?.audit;
  if (!audit || typeof audit !== "object") return [];

  const commandCount = Number(audit.semanticCommandPlan?.summary?.commandCount);
  const actionCount = Array.isArray(audit.plannedActions) ? audit.plannedActions.length : null;
  const slotCount = Array.isArray(audit.attachedAssetSlots) ? audit.attachedAssetSlots.length : 0;
  const clientValidation = audit.clientValidation && typeof audit.clientValidation === "object" ? audit.clientValidation : null;
  const commandValidation = audit.semanticCommandValidation && typeof audit.semanticCommandValidation === "object"
    ? audit.semanticCommandValidation
    : null;
  const validationBadge = clientValidation?.ok
    ? "scene ok"
    : commandValidation?.ok
      ? "command ok"
      : null;

  return [
    Number.isFinite(commandCount) ? `${commandCount} actions` : actionCount ? `${actionCount} actions` : null,
    validationBadge,
    slotCount ? `${slotCount} slots` : null,
    audit.selectedTemplate ?? null
  ].filter(Boolean).slice(0, 4);
}

export function StudioAssetAiLeadingTile({
  generationStatus = null,
  onGenerateSceneFromBrief,
  prompt = ""
}) {
  const brief = String(prompt ?? "").trim();
  if (brief.length < 2) return null;

  const isLoading = generationStatus?.state === "loading";
  const canGenerate = Boolean(onGenerateSceneFromBrief) && !isLoading;
  const auditBadges = getAiTileAuditBadges(generationStatus);

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
        {auditBadges.length ? (
          <span className="studio-catalog-ai-leading-badges" aria-label="최근 AI 생성 검증 상태">
            {auditBadges.map((badge) => <i key={badge}>{badge}</i>)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
