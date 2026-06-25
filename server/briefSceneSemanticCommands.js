export const BRIEF_SCENE_COMMAND_SCHEMA_VERSION = 1;

function createOpeningCommand(id, wall, offset, options = {}) {
  return {
    id,
    height: options.height ?? null,
    label: options.label ?? null,
    offset,
    sillHeight: options.sillHeight ?? null,
    type: options.type ?? "window",
    wall,
    width: options.width ?? null
  };
}

function createRoomCommand({ brief, color, floor, id, name, openings, position, size, style }) {
  return {
    id: `cmd-${id}`,
    type: "create_room_shell",
    targetId: id,
    floor,
    name,
    position,
    size,
    openings,
    materialHints: {
      color,
      style
    },
    sourceBrief: brief
  };
}

function createRoofCommand({ floor, footprintSize, hostRoomId, id, positionY, roofStyle, size }) {
  return {
    id: `cmd-${id}`,
    type: "attach_roof",
    targetId: id,
    floor,
    hostRoomId,
    footprintSize,
    position: [0, positionY, 0],
    roofStyle,
    size
  };
}

function createGardenFenceCommand({ id, positionZ, width }) {
  return {
    id: `cmd-${id}`,
    type: "place_garden_fence",
    targetId: id,
    floor: 1,
    position: [0, 0.65, positionZ],
    size: [width, 1.3, 0.12]
  };
}

export function createBriefSceneCommandPlan({ brief, floorHeight = 2.7, intent, seed }) {
  const baseWidth = intent.compact ? 7 : intent.bedroomCount >= 3 ? 11 : 9;
  const baseDepth = intent.compact ? 5.5 : intent.garden ? 7 : 6.5;
  const commands = [];

  const firstRoomId = `brief-room-1-${seed}`;
  commands.push(createRoomCommand({
    brief,
    color: intent.warm ? "#c8b59b" : intent.modern ? "#b9c8c7" : "#a9c9bd",
    floor: 1,
    id: firstRoomId,
    name: intent.bedroomCount <= 1 ? "오픈 스튜디오" : "1층 생활공간",
    openings: [
      createOpeningCommand(`brief-door-front-${seed}`, "south", 0, { label: "현관문", type: "door", width: 1.05 }),
      createOpeningCommand(`brief-window-south-left-${seed}`, "south", -baseWidth * 0.28),
      createOpeningCommand(`brief-window-south-right-${seed}`, "south", baseWidth * 0.28),
      createOpeningCommand(`brief-window-east-${seed}`, "east", 0.8),
      ...(intent.garden ? [
        createOpeningCommand(`brief-door-garden-${seed}`, "north", 0, { label: "정원문", type: "door", width: 1.45 })
      ] : [])
    ],
    position: [0, 0, 0],
    size: [baseWidth, floorHeight, baseDepth],
    style: intent.style
  }));

  if (intent.floors >= 2) {
    const upperWidth = Math.max(5.5, baseWidth - 1.2);
    const upperDepth = Math.max(4.8, baseDepth - 1.0);
    commands.push(createRoomCommand({
      brief,
      color: intent.warm ? "#d3c0a8" : "#c4d0ce",
      floor: 2,
      id: `brief-room-2-${seed}`,
      name: `${intent.bedroomCount}침실 상부 매스`,
      openings: [
        createOpeningCommand(`brief-window-2-south-${seed}`, "south", 0, { width: 1.6 }),
        createOpeningCommand(`brief-window-2-east-${seed}`, "east", 0.4),
        createOpeningCommand(`brief-window-2-west-${seed}`, "west", -0.4)
      ],
      position: [0, floorHeight, 0],
      size: [upperWidth, floorHeight, upperDepth],
      style: intent.style
    }));
  }

  if (intent.floors >= 3) {
    commands.push(createRoomCommand({
      brief,
      color: "#d8ddd8",
      floor: 3,
      id: `brief-room-3-${seed}`,
      name: "3층 스튜디오",
      openings: [
        createOpeningCommand(`brief-window-3-south-${seed}`, "south", 0, { width: 1.4 })
      ],
      position: [0, floorHeight * 2, 0],
      size: [Math.max(4.8, baseWidth - 2.2), floorHeight, Math.max(4.2, baseDepth - 2.0)],
      style: intent.style
    }));
  }

  const topFloor = intent.floors;
  const topRoomId = `brief-room-${topFloor}-${seed}`;
  const topWidth = topFloor === 1 ? baseWidth : topFloor === 2 ? Math.max(5.5, baseWidth - 1.2) : Math.max(4.8, baseWidth - 2.2);
  const topDepth = topFloor === 1 ? baseDepth : topFloor === 2 ? Math.max(4.8, baseDepth - 1.0) : Math.max(4.2, baseDepth - 2.0);
  commands.push(createRoofCommand({
    floor: topFloor,
    footprintSize: [topWidth, topDepth],
    hostRoomId: topRoomId,
    id: `brief-roof-${seed}`,
    positionY: floorHeight * (topFloor - 1) + floorHeight + (intent.style === "modern" ? 0.18 : 0.62),
    roofStyle: intent.style,
    size: [topWidth + 0.6, intent.style === "modern" ? 0.35 : 1.25, topDepth + 0.8]
  }));

  if (intent.garden) {
    commands.push(createGardenFenceCommand({
      id: `brief-garden-${seed}`,
      positionZ: -baseDepth / 2 - 3,
      width: baseWidth + 1.2
    }));
  }

  return {
    schemaVersion: BRIEF_SCENE_COMMAND_SCHEMA_VERSION,
    source: "ploton-brief-semantic-command-plan",
    strategy: "pascal-style-tool-command-plan",
    commands: commands.map((command, index) => ({
      ...command,
      order: (index + 1) * 10
    })),
    summary: {
      commandCount: commands.length,
      floorCount: intent.floors,
      hasGardenCommand: intent.garden,
      roomCommandCount: commands.filter((command) => command.type === "create_room_shell").length
    }
  };
}

export function compactBriefSceneCommand(command) {
  return {
    id: command.id,
    type: command.type,
    targetId: command.targetId,
    floor: command.floor ?? null,
    hostRoomId: command.hostRoomId ?? null,
    openingCount: Array.isArray(command.openings) ? command.openings.length : 0,
    order: command.order
  };
}
