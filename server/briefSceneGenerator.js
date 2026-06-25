import { createHash, randomUUID } from "node:crypto";
import {
  assertValidBriefSceneCommandPlan,
  compactBriefSceneCommandValidation
} from "./briefSceneCommandValidation.js";
import { compactBriefSceneCommand, createBriefSceneCommandPlan } from "./briefSceneSemanticCommands.js";

const SCHEMA_VERSION = 3;
const GENERATOR_VERSION = "brief-scene-generator-v1";
const FLOOR_HEIGHT = 2.7;
const WALL_THICKNESS = 0.16;

function sanitizeBrief(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 800);
}

function briefHash(brief) {
  return createHash("sha256").update(brief).digest("hex").slice(0, 10);
}

function parseBriefIntent(brief) {
  const text = brief.toLocaleLowerCase("ko-KR");
  const twoStory = /2층|이층|two[-\s]?story|2\s*floor|second floor/.test(text);
  const threeStory = /3층|삼층|three[-\s]?story|3\s*floor/.test(text);
  const garden = /정원|마당|가든|garden|yard|patio|테라스/.test(text);
  const modern = /모던|modern|미니멀|minimal|simple|심플/.test(text);
  const warm = /목재|우드|따뜻|내추럴|wood|timber|warm|natural/.test(text);
  const compact = /소형|작은|컴팩트|compact|tiny|studio/.test(text);
  const bedroomMatch = text.match(/(\d+)\s*(?:개\s*)?(?:침실|bedroom|bedrooms|룸)/);
  const bedroomCount = bedroomMatch ? Math.max(1, Math.min(5, Number(bedroomMatch[1]))) : compact ? 1 : 2;
  return {
    bedroomCount,
    compact,
    floors: threeStory ? 3 : twoStory ? 2 : 1,
    garden,
    modern,
    style: modern ? "modern" : warm ? "warm-natural" : "neutral",
    warm
  };
}

function selectTemplate(intent) {
  if (intent.floors >= 3) {
    return "stacked-three-story-house";
  }
  if (intent.floors >= 2) {
    return intent.garden ? "two-story-house-with-garden" : "two-story-house";
  }
  if (intent.compact) {
    return "compact-studio-house";
  }
  return intent.garden ? "single-story-house-with-garden" : "single-story-house";
}

function describeLimitations(intent) {
  const limitations = [
    "deterministic starter massing only; no structural analysis",
    "room layout is approximate and not code-compliance checked",
    "asset choices use built-in starter components"
  ];

  if (intent.floors > 2) {
    limitations.push("three-story output uses simplified stacked volumes");
  }

  if (intent.garden) {
    limitations.push("garden boundary is represented as a simple fence marker");
  }

  return limitations;
}

function opening(id, wall, offset, options = {}) {
  const type = options.type ?? "window";
  const isDoor = type === "door";
  const height = options.height ?? (isDoor ? 2.1 : 1.1);
  const width = options.width ?? (isDoor ? 1.0 : 1.2);
  return {
    assetId: isDoor ? "component-entry-door" : "component-wide-window",
    color: isDoor ? "#9b7252" : "#8fd3de",
    frameDepth: isDoor ? 0.2 : 0.16,
    height,
    id,
    label: options.label ?? (isDoor ? "현관문" : "창문"),
    offset,
    sillHeight: isDoor ? 0 : options.sillHeight ?? 0.9,
    type,
    wall,
    width
  };
}

function openingFromCommand(openingCommand) {
  return opening(openingCommand.id, openingCommand.wall, openingCommand.offset, {
    height: openingCommand.height,
    label: openingCommand.label,
    sillHeight: openingCommand.sillHeight,
    type: openingCommand.type,
    width: openingCommand.width
  });
}

function room(id, name, position, size, openings, metadata = {}) {
  return {
    id,
    type: "room",
    assetId: "brief-room-shell",
    categoryId: "wall-tool",
    color: metadata.color ?? "#a9c9bd",
    name,
    position,
    rotation: [0, 0, 0],
    shape: "room",
    size,
    room: {
      attachments: [],
      canContainObjects: true,
      floor: metadata.floor ?? 1,
      floorMaterial: "painted-slab",
      openings,
      wallHeight: size[1],
      wallThickness: WALL_THICKNESS
    },
    metadata: {
      floor: `${metadata.floor ?? 1}F`,
      floorBaseY: position[1],
      generatedFromBrief: true,
      gridUnit: "0.5m",
      placementSource: "brief-scene-generator",
      source: "ploton-brief-scene",
      ...metadata
    }
  };
}

function roof(id, roomId, floor, y, width, depth, style) {
  return {
    id,
    type: "catalog-asset",
    assetId: style === "modern" ? "test-flat-roof" : "test-gable-roof",
    categoryId: "roof",
    color: style === "modern" ? "#bfc7c4" : "#8ea8b5",
    floor,
    name: style === "modern" ? "모던 평지붕" : "박공지붕",
    placementMode: "roof-attached",
    position: [0, y, 0],
    rotation: [0, 0, 0],
    shape: style === "modern" ? "slab" : "gable",
    size: [width + 0.6, style === "modern" ? 0.35 : 1.25, depth + 0.8],
    metadata: {
      attachedRoomId: roomId,
      generatedFromBrief: true,
      placementSource: "brief-scene-generator",
      source: "ploton-brief-scene"
    }
  };
}

function gardenFence(prefix, z, width) {
  return [
    {
      id: `${prefix}-fence-north`,
      type: "catalog-asset",
      assetId: "component-fence-line",
      categoryId: "railing",
      color: "#c6b19a",
      floor: 1,
      name: "정원 울타리",
      placementMode: "floor-free",
      position: [0, 0.65, z],
      rotation: [0, 0, 0],
      shape: "railing",
      size: [width, 1.3, 0.12],
      metadata: {
        generatedFromBrief: true,
        placementSource: "brief-scene-generator",
        source: "ploton-brief-scene"
      }
    }
  ];
}

function materializeBriefSceneCommand(command) {
  if (command.type === "create_room_shell") {
    return [room(
      command.targetId,
      command.name,
      command.position,
      command.size,
      (command.openings ?? []).map(openingFromCommand),
      {
        floor: command.floor,
        brief: command.sourceBrief,
        color: command.materialHints?.color,
        semanticCommandId: command.id,
        style: command.materialHints?.style
      }
    )];
  }

  if (command.type === "attach_roof") {
    const [width, depth] = command.footprintSize ?? [command.size?.[0] ?? 1, command.size?.[2] ?? 1];
    return [roof(
      command.targetId,
      command.hostRoomId,
      command.floor,
      command.position?.[1] ?? 0,
      width,
      depth,
      command.roofStyle
    )].map((object) => ({
      ...object,
      metadata: {
        ...object.metadata,
        semanticCommandId: command.id
      }
    }));
  }

  if (command.type === "place_garden_fence") {
    return gardenFence(command.targetId, command.position?.[2] ?? 0, command.size?.[0] ?? 1)
      .map((object) => ({
        ...object,
        metadata: {
          ...object.metadata,
          semanticCommandId: command.id
        }
      }));
  }

  return [];
}

export function applyBriefSceneCommandPlan(commandPlan) {
  const validation = assertValidBriefSceneCommandPlan(commandPlan);
  return {
    objects: commandPlan.commands.flatMap(materializeBriefSceneCommand),
    validation
  };
}

function createStarterObjects(brief, intent, seed) {
  const commandPlan = createBriefSceneCommandPlan({
    brief,
    floorHeight: FLOOR_HEIGHT,
    intent,
    seed
  });
  const { objects, validation } = applyBriefSceneCommandPlan(commandPlan);
  return { commandPlan, commandValidation: validation, objects };
}

export function createBriefScene(payload = {}) {
  const originalBrief = String(payload.brief ?? payload.prompt ?? "");
  const brief = sanitizeBrief(originalBrief);
  if (!brief) {
    throw Object.assign(new Error("집 초안 생성을 위한 brief가 필요합니다."), { statusCode: 400 });
  }

  const intent = parseBriefIntent(brief);
  const selectedTemplate = selectTemplate(intent);
  const seed = `${briefHash(brief)}-${randomUUID().slice(0, 6)}`;
  const { commandPlan, commandValidation, objects } = createStarterObjects(brief, intent, seed);
  const createdAt = new Date().toISOString();
  const generatedObjectIds = objects.map((object) => object.id);

  return {
    activeCategoryId: "wall-tool",
    activeFloor: 1,
    activeWorkflowMode: "build",
    cameraView: "orbit",
    createdAt,
    decisionAudit: {
      generatedObjectIds,
      generatorVersion: GENERATOR_VERSION,
      limitations: describeLimitations(intent),
      nextStep: "Review the starter scene in studio-editor, then refine rooms, openings, and recommended assets.",
      originalBrief,
      parsedIntent: intent,
      plannedActions: commandPlan.commands.map(compactBriefSceneCommand),
      sanitizedBrief: brief,
      semanticCommandPlan: {
        schemaVersion: commandPlan.schemaVersion,
        source: commandPlan.source,
        strategy: commandPlan.strategy,
        summary: commandPlan.summary
      },
      semanticCommandValidation: compactBriefSceneCommandValidation(commandValidation),
      selectedTemplate
    },
    generator: {
      adapter: "ploton-brief-scene",
      inspiredBy: "pascal-create-house-from-brief",
      mode: "deterministic-template-starter",
      orchestration: "brief-semantic-command-plan"
    },
    gridVisible: true,
    objects,
    recentAssetIds: [],
    savedAt: createdAt,
    schemaVersion: SCHEMA_VERSION,
    snapEnabled: true,
    source: "ploton-brief-scene",
    summary: {
      brief,
      floorCount: intent.floors,
      intent,
      objectCount: objects.length,
      roomCount: objects.filter((object) => object.type === "room").length
    },
    wallViewMode: "cutaway"
  };
}
