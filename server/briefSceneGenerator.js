import { createHash, randomUUID } from "node:crypto";

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

function createStarterObjects(brief, intent, seed) {
  const baseWidth = intent.compact ? 7 : intent.bedroomCount >= 3 ? 11 : 9;
  const baseDepth = intent.compact ? 5.5 : intent.garden ? 7 : 6.5;
  const objects = [];

  const firstRoomId = `brief-room-1-${seed}`;
  objects.push(room(
    firstRoomId,
    intent.bedroomCount <= 1 ? "오픈 스튜디오" : "1층 생활공간",
    [0, 0, 0],
    [baseWidth, FLOOR_HEIGHT, baseDepth],
    [
      opening(`brief-door-front-${seed}`, "south", 0, { label: "현관문", type: "door", width: 1.05 }),
      opening(`brief-window-south-left-${seed}`, "south", -baseWidth * 0.28),
      opening(`brief-window-south-right-${seed}`, "south", baseWidth * 0.28),
      opening(`brief-window-east-${seed}`, "east", 0.8),
      ...(intent.garden ? [opening(`brief-door-garden-${seed}`, "north", 0, { label: "정원문", type: "door", width: 1.45 })] : [])
    ],
    {
      floor: 1,
      brief,
      color: intent.warm ? "#c8b59b" : intent.modern ? "#b9c8c7" : "#a9c9bd",
      style: intent.style
    }
  ));

  if (intent.floors >= 2) {
    const upperWidth = Math.max(5.5, baseWidth - 1.2);
    const upperDepth = Math.max(4.8, baseDepth - 1.0);
    objects.push(room(
      `brief-room-2-${seed}`,
      `${intent.bedroomCount}침실 상부 매스`,
      [0, FLOOR_HEIGHT, 0],
      [upperWidth, FLOOR_HEIGHT, upperDepth],
      [
        opening(`brief-window-2-south-${seed}`, "south", 0, { width: 1.6 }),
        opening(`brief-window-2-east-${seed}`, "east", 0.4),
        opening(`brief-window-2-west-${seed}`, "west", -0.4)
      ],
      {
        floor: 2,
        brief,
        color: intent.warm ? "#d3c0a8" : "#c4d0ce",
        style: intent.style
      }
    ));
  }

  if (intent.floors >= 3) {
    objects.push(room(
      `brief-room-3-${seed}`,
      "3층 스튜디오",
      [0, FLOOR_HEIGHT * 2, 0],
      [Math.max(4.8, baseWidth - 2.2), FLOOR_HEIGHT, Math.max(4.2, baseDepth - 2.0)],
      [opening(`brief-window-3-south-${seed}`, "south", 0, { width: 1.4 })],
      {
        floor: 3,
        brief,
        color: "#d8ddd8",
        style: intent.style
      }
    ));
  }

  const topFloor = intent.floors;
  const topRoomId = `brief-room-${topFloor}-${seed}`;
  const topWidth = topFloor === 1 ? baseWidth : topFloor === 2 ? Math.max(5.5, baseWidth - 1.2) : Math.max(4.8, baseWidth - 2.2);
  const topDepth = topFloor === 1 ? baseDepth : topFloor === 2 ? Math.max(4.8, baseDepth - 1.0) : Math.max(4.2, baseDepth - 2.0);
  objects.push(roof(
    `brief-roof-${seed}`,
    topRoomId,
    topFloor,
    FLOOR_HEIGHT * (topFloor - 1) + FLOOR_HEIGHT + (intent.style === "modern" ? 0.18 : 0.62),
    topWidth,
    topDepth,
    intent.style
  ));

  if (intent.garden) {
    objects.push(...gardenFence(`brief-garden-${seed}`, -baseDepth / 2 - 3, baseWidth + 1.2));
  }

  return objects;
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
  const objects = createStarterObjects(brief, intent, seed);
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
      sanitizedBrief: brief,
      selectedTemplate
    },
    generator: {
      adapter: "ploton-brief-scene",
      inspiredBy: "pascal-create-house-from-brief",
      mode: "deterministic-template-starter"
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
