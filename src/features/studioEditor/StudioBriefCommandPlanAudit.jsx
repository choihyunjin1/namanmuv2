import React from "react";

const ACTION_LABELS = {
  attach_roof: "지붕",
  create_room_shell: "방",
  place_garden_fence: "외부"
};

const KNOWN_ACTION_TYPES = new Set(Object.keys(ACTION_LABELS));

function getGenerationAudit(status) {
  const audit = status?.audit;
  if (!audit || typeof audit !== "object") return null;

  const actions = Array.isArray(audit.plannedActions) ? audit.plannedActions : [];
  const summary = audit.semanticCommandPlan?.summary ?? {};
  const attachedSlots = Array.isArray(audit.attachedAssetSlots) ? audit.attachedAssetSlots : [];
  const clientValidation = audit.clientValidation && typeof audit.clientValidation === "object"
    ? audit.clientValidation
    : null;
  const commandCount = summary.commandCount ?? actions.length;
  const knownActionCount = actions.filter((action) => KNOWN_ACTION_TYPES.has(action.type)).length;
  const actionCountMatches = commandCount === actions.length;
  const validationState = clientValidation
    ? clientValidation.ok ? "validated" : "blocked"
    : actionCountMatches && knownActionCount === actions.length ? "validated" : "review";

  return {
    actions: actions.slice(0, 4),
    actionCountMatches,
    attachedSlots,
    commandCount,
    floorCount: summary.floorCount ?? null,
    issueCount: clientValidation?.issueCount ?? null,
    knownActionCount,
    roomCommandCount: summary.roomCommandCount ?? null,
    strategy: audit.semanticCommandPlan?.strategy ?? "pascal-style-tool-command-plan",
    template: audit.selectedTemplate ?? null,
    validationState,
    warningCount: clientValidation?.warningCount ?? null
  };
}

export function StudioBriefCommandPlanAudit({ status }) {
  const audit = getGenerationAudit(status);
  if (!audit) return null;

  return (
    <div className="studio-generation-audit" aria-label="AI 생성 작업 내역" data-validation={audit.validationState}>
      <div>
        <strong>Plan</strong>
        <span>{audit.commandCount} actions · {audit.strategy}</span>
      </div>
      <div className="studio-generation-audit-chips">
        <em>{audit.validationState}</em>
        {audit.actionCountMatches ? <em>count verified</em> : <em>count review</em>}
        {audit.issueCount === 0 ? <em>scene validated</em> : audit.issueCount ? <em>{audit.issueCount} issues</em> : null}
        {audit.warningCount ? <em>{audit.warningCount} warnings</em> : null}
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
