const VALID_OPENING_WALLS = new Set(["north", "south", "east", "west", "body"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function hasFiniteVector(values, length) {
  return Array.isArray(values) && values.length >= length && values.slice(0, length).every(isFiniteNumber);
}

function addIssue(issues, code, message, details = {}) {
  issues.push({ code, details, message });
}

function addWarning(warnings, code, message, details = {}) {
  warnings.push({ code, details, message });
}

function collectObjectIds(objects) {
  const seen = new Set();
  const duplicates = new Set();
  objects.forEach((object) => {
    if (!object?.id) return;
    if (seen.has(object.id)) duplicates.add(object.id);
    seen.add(object.id);
  });
  return { duplicates: [...duplicates], seen };
}

function validateObjectShape(object, index, issues) {
  if (!isObject(object)) {
    addIssue(issues, "invalid-object", "씬 객체가 object 형식이 아닙니다.", { index });
    return;
  }
  if (!object.id) {
    addIssue(issues, "missing-object-id", "씬 객체 id가 없습니다.", { index });
  }
  if (!hasFiniteVector(object.position, 3)) {
    addIssue(issues, "invalid-object-position", "씬 객체 position은 숫자 3개여야 합니다.", { id: object.id, index });
  }
  if (!hasFiniteVector(object.size, 3)) {
    addIssue(issues, "invalid-object-size", "씬 객체 size는 숫자 3개여야 합니다.", { id: object.id, index });
  }
}

function validateHostedOpening(opening, host, issues) {
  if (!opening?.id) {
    addIssue(issues, "missing-opening-id", "개구부 id가 없습니다.", { hostId: host.id });
  }
  if (!VALID_OPENING_WALLS.has(opening?.wall)) {
    addIssue(issues, "invalid-opening-wall", "개구부 wall 값이 지원 범위 밖입니다.", {
      hostId: host.id,
      openingId: opening?.id,
      wall: opening?.wall
    });
  }
  ["offset", "width", "height", "sillHeight"].forEach((field) => {
    if (!isFiniteNumber(opening?.[field])) {
      addIssue(issues, "invalid-opening-metric", "개구부 위치/크기 값은 숫자여야 합니다.", {
        field,
        hostId: host.id,
        openingId: opening?.id
      });
    }
  });
}

function validateHostedFeatures(object, issues) {
  const openings = [
    ...(Array.isArray(object?.room?.openings) ? object.room.openings : []),
    ...(Array.isArray(object?.wallOpenings) ? object.wallOpenings : [])
  ];
  openings.forEach((opening) => validateHostedOpening(opening, object, issues));
}

function validateGeneratedObjectIds(decisionAudit, objectIdSet, warnings) {
  if (!Array.isArray(decisionAudit?.generatedObjectIds)) return;
  const missingIds = decisionAudit.generatedObjectIds.filter((id) => !objectIdSet.has(id));
  if (missingIds.length) {
    addWarning(warnings, "generated-object-id-missing", "생성 audit의 객체 id 일부가 씬에 없습니다.", {
      missingIds: missingIds.slice(0, 8)
    });
  }
}

function validateCommandPlan(decisionAudit, issues, warnings) {
  if (!isObject(decisionAudit)) return null;
  const plannedActions = Array.isArray(decisionAudit.plannedActions) ? decisionAudit.plannedActions : [];
  const commandCount = Number(decisionAudit.semanticCommandPlan?.summary?.commandCount);
  const commandCountMatches = !Number.isFinite(commandCount) || commandCount === plannedActions.length;
  if (!commandCountMatches) {
    addIssue(issues, "command-count-mismatch", "semantic command plan 수와 planned action 수가 다릅니다.", {
      commandCount,
      plannedActionCount: plannedActions.length
    });
  }
  if (!plannedActions.length) {
    addWarning(warnings, "missing-planned-actions", "생성 audit에 planned action이 없습니다.");
  }
  return {
    commandCount: Number.isFinite(commandCount) ? commandCount : plannedActions.length,
    commandCountMatches,
    plannedActionCount: plannedActions.length,
    strategy: decisionAudit.semanticCommandPlan?.strategy ?? null
  };
}

export function validateBriefScenePayload(payload) {
  const issues = [];
  const warnings = [];
  const objects = Array.isArray(payload?.objects) ? payload.objects : null;

  if (!objects) {
    addIssue(issues, "missing-objects", "씬 payload에 objects 배열이 없습니다.");
    return {
      checks: {
        commandCountMatches: false,
        objectCount: 0,
        uniqueObjectIdCount: 0
      },
      issueCount: issues.length,
      issues,
      ok: false,
      schemaVersion: 1,
      warningCount: warnings.length,
      warnings
    };
  }

  objects.forEach((object, index) => {
    validateObjectShape(object, index, issues);
    validateHostedFeatures(object, issues);
  });

  const { duplicates, seen: objectIdSet } = collectObjectIds(objects);
  duplicates.forEach((id) => {
    addIssue(issues, "duplicate-object-id", "씬 객체 id가 중복됩니다.", { id });
  });

  const commandPlan = validateCommandPlan(payload?.decisionAudit, issues, warnings);
  validateGeneratedObjectIds(payload?.decisionAudit, objectIdSet, warnings);

  return {
    checks: {
      commandCount: commandPlan?.commandCount ?? null,
      commandCountMatches: commandPlan?.commandCountMatches ?? null,
      objectCount: objects.length,
      plannedActionCount: commandPlan?.plannedActionCount ?? null,
      strategy: commandPlan?.strategy ?? null,
      uniqueObjectIdCount: objectIdSet.size
    },
    issueCount: issues.length,
    issues,
    ok: issues.length === 0,
    schemaVersion: 1,
    warningCount: warnings.length,
    warnings
  };
}
