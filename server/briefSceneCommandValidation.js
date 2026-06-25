import { BRIEF_SCENE_COMMAND_SCHEMA_VERSION } from "./briefSceneSemanticCommands.js";

export const BRIEF_SCENE_COMMAND_TYPES = new Set([
  "attach_roof",
  "create_room_shell",
  "place_garden_fence"
]);

const VALID_OPENING_TYPES = new Set(["door", "window"]);
const VALID_OPENING_WALLS = new Set(["north", "south", "east", "west"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && Number(value) > 0;
}

function hasFiniteVector(values, length) {
  return Array.isArray(values) && values.length >= length && values.slice(0, length).every(isFiniteNumber);
}

function hasPositiveVector(values, length) {
  return Array.isArray(values) && values.length >= length && values.slice(0, length).every(isPositiveNumber);
}

function addError(errors, code, message, details = {}) {
  errors.push({ code, details, message });
}

function addWarning(warnings, code, message, details = {}) {
  warnings.push({ code, details, message });
}

function validateOpeningCommand(opening, command, errors) {
  if (!opening?.id) {
    addError(errors, "missing-opening-id", "opening command id가 없습니다.", { commandId: command.id });
  }
  if (!VALID_OPENING_TYPES.has(opening?.type)) {
    addError(errors, "invalid-opening-type", "opening type은 door/window만 지원합니다.", {
      commandId: command.id,
      openingId: opening?.id,
      type: opening?.type
    });
  }
  if (!VALID_OPENING_WALLS.has(opening?.wall)) {
    addError(errors, "invalid-opening-wall", "opening wall은 north/south/east/west만 지원합니다.", {
      commandId: command.id,
      openingId: opening?.id,
      wall: opening?.wall
    });
  }
  if (!isFiniteNumber(opening?.offset)) {
    addError(errors, "invalid-opening-offset", "opening offset은 숫자여야 합니다.", {
      commandId: command.id,
      openingId: opening?.id
    });
  }
  ["height", "sillHeight", "width"].forEach((field) => {
    if (opening?.[field] !== null && opening?.[field] !== undefined && !isPositiveNumber(opening[field])) {
      addError(errors, "invalid-opening-metric", "opening 크기 값은 양수여야 합니다.", {
        commandId: command.id,
        field,
        openingId: opening?.id
      });
    }
  });
}

function validateRoomCommand(command, errors) {
  if (!Number.isInteger(Number(command.floor)) || Number(command.floor) < 1) {
    addError(errors, "invalid-room-floor", "방 command floor는 1 이상의 정수여야 합니다.", { commandId: command.id });
  }
  if (!hasFiniteVector(command.position, 3)) {
    addError(errors, "invalid-room-position", "방 command position은 숫자 3개여야 합니다.", { commandId: command.id });
  }
  if (!hasPositiveVector(command.size, 3)) {
    addError(errors, "invalid-room-size", "방 command size는 양수 3개여야 합니다.", { commandId: command.id });
  }
  if (!Array.isArray(command.openings)) {
    addError(errors, "invalid-room-openings", "방 command openings는 배열이어야 합니다.", { commandId: command.id });
    return;
  }
  command.openings.forEach((opening) => validateOpeningCommand(opening, command, errors));
}

function validateRoofCommand(command, roomTargetIds, errors) {
  if (!roomTargetIds.has(command.hostRoomId)) {
    addError(errors, "invalid-roof-host", "지붕 command hostRoomId가 생성된 방 targetId와 매칭되지 않습니다.", {
      commandId: command.id,
      hostRoomId: command.hostRoomId
    });
  }
  if (!hasPositiveVector(command.footprintSize, 2)) {
    addError(errors, "invalid-roof-footprint", "지붕 footprintSize는 양수 2개여야 합니다.", { commandId: command.id });
  }
  if (!hasPositiveVector(command.size, 3)) {
    addError(errors, "invalid-roof-size", "지붕 size는 양수 3개여야 합니다.", { commandId: command.id });
  }
}

function validateGardenFenceCommand(command, errors) {
  if (!hasFiniteVector(command.position, 3)) {
    addError(errors, "invalid-garden-position", "정원 command position은 숫자 3개여야 합니다.", { commandId: command.id });
  }
  if (!hasPositiveVector(command.size, 3)) {
    addError(errors, "invalid-garden-size", "정원 command size는 양수 3개여야 합니다.", { commandId: command.id });
  }
}

export function validateBriefSceneCommandPlan(commandPlan) {
  const errors = [];
  const warnings = [];

  if (!isObject(commandPlan)) {
    addError(errors, "invalid-command-plan", "command plan이 object 형식이 아닙니다.");
    return { commandCount: 0, commandIds: [], errorCount: errors.length, errors, knownCommandCount: 0, ok: false, schemaVersion: 1, warningCount: 0, warnings };
  }

  if (commandPlan.schemaVersion !== BRIEF_SCENE_COMMAND_SCHEMA_VERSION) {
    addError(errors, "invalid-schema-version", "지원하지 않는 command plan schemaVersion입니다.", {
      expected: BRIEF_SCENE_COMMAND_SCHEMA_VERSION,
      received: commandPlan.schemaVersion
    });
  }
  if (commandPlan.source !== "ploton-brief-semantic-command-plan") {
    addWarning(warnings, "unexpected-source", "command plan source가 예상값과 다릅니다.", {
      source: commandPlan.source
    });
  }

  const commands = Array.isArray(commandPlan.commands) ? commandPlan.commands : [];
  if (!commands.length) {
    addError(errors, "missing-commands", "command plan commands 배열이 비어 있습니다.");
  }

  const commandIds = [];
  const commandIdSet = new Set();
  const duplicateCommandIds = new Set();
  const targetIdSet = new Set();
  const duplicateTargetIds = new Set();
  const roomTargetIds = new Set();
  let knownCommandCount = 0;

  commands.forEach((command, index) => {
    if (!isObject(command)) {
      addError(errors, "invalid-command", "command가 object 형식이 아닙니다.", { index });
      return;
    }
    if (!command.id) {
      addError(errors, "missing-command-id", "command id가 없습니다.", { index });
    } else {
      commandIds.push(command.id);
      if (commandIdSet.has(command.id)) duplicateCommandIds.add(command.id);
      commandIdSet.add(command.id);
    }
    if (!command.targetId) {
      addError(errors, "missing-target-id", "command targetId가 없습니다.", { commandId: command.id, index });
    } else {
      if (targetIdSet.has(command.targetId)) duplicateTargetIds.add(command.targetId);
      targetIdSet.add(command.targetId);
    }
    if (!isFiniteNumber(command.order)) {
      addError(errors, "invalid-command-order", "command order는 숫자여야 합니다.", { commandId: command.id, index });
    }
    if (!BRIEF_SCENE_COMMAND_TYPES.has(command.type)) {
      addError(errors, "unknown-command-type", "지원하지 않는 command type입니다.", {
        commandId: command.id,
        type: command.type
      });
      return;
    }

    knownCommandCount += 1;
    if (command.type === "create_room_shell") roomTargetIds.add(command.targetId);
  });

  duplicateCommandIds.forEach((id) => addError(errors, "duplicate-command-id", "command id가 중복됩니다.", { id }));
  duplicateTargetIds.forEach((id) => addError(errors, "duplicate-target-id", "command targetId가 중복됩니다.", { id }));

  commands.forEach((command) => {
    if (!BRIEF_SCENE_COMMAND_TYPES.has(command?.type)) return;
    if (command.type === "create_room_shell") validateRoomCommand(command, errors);
    if (command.type === "attach_roof") validateRoofCommand(command, roomTargetIds, errors);
    if (command.type === "place_garden_fence") validateGardenFenceCommand(command, errors);
  });

  const expectedCommandCount = Number(commandPlan.summary?.commandCount);
  if (Number.isFinite(expectedCommandCount) && expectedCommandCount !== commands.length) {
    addError(errors, "summary-command-count-mismatch", "summary.commandCount와 commands 길이가 다릅니다.", {
      commandCount: commands.length,
      summaryCommandCount: expectedCommandCount
    });
  }

  return {
    commandCount: commands.length,
    commandIds,
    errorCount: errors.length,
    errors,
    knownCommandCount,
    ok: errors.length === 0,
    schemaVersion: 1,
    source: commandPlan.source ?? null,
    strategy: commandPlan.strategy ?? null,
    summary: commandPlan.summary ?? {},
    warningCount: warnings.length,
    warnings
  };
}

export function assertValidBriefSceneCommandPlan(commandPlan) {
  const validation = validateBriefSceneCommandPlan(commandPlan);
  if (!validation.ok) {
    const error = new Error(validation.errors[0]?.message ?? "brief scene command plan validation failed");
    error.code = "BRIEF_COMMAND_PLAN_INVALID";
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }
  return validation;
}

export function compactBriefSceneCommandValidation(validation) {
  if (!validation) return null;
  return {
    commandCount: validation.commandCount,
    errorCount: validation.errorCount,
    knownCommandCount: validation.knownCommandCount,
    ok: validation.ok,
    schemaVersion: validation.schemaVersion,
    strategy: validation.strategy,
    warningCount: validation.warningCount
  };
}
