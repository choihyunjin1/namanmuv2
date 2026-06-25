const WALL_DIRECTIONS = ["north", "east", "south", "west"];

function roundMetric(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function getObjectFloor(object, fallbackFloor = 1, floorHeight = 2.7) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  if (Number.isFinite(object?.metadata?.floorNumber)) return object.metadata.floorNumber;
  const y = Number(object?.position?.[1] ?? 0);
  return Math.max(1, Math.round(y / floorHeight) + 1) || fallbackFloor;
}

function getRoomBounds(object) {
  const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
  const [width = 1, , depth = 1] = object.size ?? [1, 2.7, 1];
  return {
    centerX: roundMetric(x),
    centerZ: roundMetric(z),
    depth: roundMetric(depth),
    east: roundMetric(x + width / 2),
    north: roundMetric(z - depth / 2),
    south: roundMetric(z + depth / 2),
    west: roundMetric(x - width / 2),
    width: roundMetric(width)
  };
}

function getRoomWallPoints(object, wall) {
  const bounds = getRoomBounds(object);
  const points = {
    east: [
      [bounds.east, bounds.north],
      [bounds.east, bounds.south]
    ],
    north: [
      [bounds.west, bounds.north],
      [bounds.east, bounds.north]
    ],
    south: [
      [bounds.east, bounds.south],
      [bounds.west, bounds.south]
    ],
    west: [
      [bounds.west, bounds.south],
      [bounds.west, bounds.north]
    ]
  };
  return points[wall] ?? points.north;
}

function getStructuralWallPoints(object) {
  const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
  const [length = 1] = object.size ?? [1, 2.7, 0.16];
  const yaw = object.rotation?.[1] ?? 0;
  const half = length / 2;
  const dx = Math.cos(yaw) * half;
  const dz = -Math.sin(yaw) * half;
  return [
    [roundMetric(x - dx), roundMetric(z - dz)],
    [roundMetric(x + dx), roundMetric(z + dz)]
  ];
}

function makeBlueprintFloor(floor, floorHeight) {
  return {
    corners: {},
    floorTextures: {},
    metadata: {
      elevation: roundMetric((floor - 1) * floorHeight),
      floor,
      source: "ploton-studio-editor"
    },
    newFloorTextures: {},
    wallTextures: [],
    walls: []
  };
}

function makePlannerLayer(floor, floorHeight) {
  return {
    altitude: roundMetric((floor - 1) * floorHeight),
    areas: {},
    holes: {},
    id: `layer_${floor}`,
    items: {},
    lines: {},
    name: `${floor}F`,
    opacity: 1,
    order: floor,
    selected: {
      areas: [],
      holes: [],
      items: [],
      lines: [],
      vertices: []
    },
    vertices: {},
    visible: true
  };
}

function getOrCreateFloor(container, floor, floorHeight, factory) {
  const floorId = `floor_${floor}`;
  if (!container[floorId]) container[floorId] = factory(floor, floorHeight);
  return container[floorId];
}

function createLayerAccess(layers, floor, floorHeight) {
  const layer = getOrCreateFloor(layers, floor, floorHeight, makePlannerLayer);
  return { layer, layerId: layer.id };
}

function coordinateKey(floor, point) {
  return `${floor}:${roundMetric(point[0])}:${roundMetric(point[1])}`;
}

function getOrCreateCorner(floorplan, cornerLookup, floor, point) {
  const key = coordinateKey(floor, point);
  if (cornerLookup.has(key)) return cornerLookup.get(key);
  const cornerId = `corner_${floor}_${cornerLookup.size + 1}`;
  floorplan.corners[cornerId] = {
    x: roundMetric(point[0]),
    y: roundMetric(point[1])
  };
  cornerLookup.set(key, cornerId);
  return cornerId;
}

function getOrCreateVertex(layer, vertexLookup, floor, point) {
  const key = coordinateKey(floor, point);
  if (vertexLookup.has(key)) return vertexLookup.get(key);
  const vertexId = `vertex_${floor}_${vertexLookup.size + 1}`;
  layer.vertices[vertexId] = {
    areas: [],
    id: vertexId,
    lines: [],
    name: "",
    prototype: "vertices",
    properties: {},
    selected: false,
    type: "vertex",
    visible: true,
    x: roundMetric(point[0]),
    y: roundMetric(point[1])
  };
  vertexLookup.set(key, vertexId);
  return vertexId;
}

function addVertexLineRef(layer, vertexId, lineId) {
  const vertex = layer.vertices[vertexId];
  if (vertex && !vertex.lines.includes(lineId)) vertex.lines.push(lineId);
}

function addVertexAreaRef(layer, vertexId, areaId) {
  const vertex = layer.vertices[vertexId];
  if (vertex && !vertex.areas.includes(areaId)) vertex.areas.push(areaId);
}

function wallLengthFromPoints(points) {
  const [start, end] = points;
  return Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
}

function openingOffsetRatio(opening, wallPoints) {
  const wallLength = wallLengthFromPoints(wallPoints);
  return roundMetric(Math.min(1, Math.max(0, (Number(opening.offset) + wallLength / 2) / wallLength)));
}

function addWallToInterop({
  blueprintFloor,
  floor,
  floorHeight,
  floorplanCornerLookup,
  layer,
  plannerVertexLookup,
  source,
  sourceId,
  wall,
  wallIndex,
  wallPoints,
  wallThickness,
  wallHeight,
  openings = []
}) {
  const [startPoint, endPoint] = wallPoints;
  const corner1 = getOrCreateCorner(blueprintFloor, floorplanCornerLookup, floor, startPoint);
  const corner2 = getOrCreateCorner(blueprintFloor, floorplanCornerLookup, floor, endPoint);
  const lineId = `line_${sourceId}_${wall ?? wallIndex}`;
  const vertex1 = getOrCreateVertex(layer, plannerVertexLookup, floor, startPoint);
  const vertex2 = getOrCreateVertex(layer, plannerVertexLookup, floor, endPoint);

  blueprintFloor.walls.push({
    backTexture: null,
    corner1,
    corner2,
    frontTexture: null,
    metadata: {
      source,
      sourceId,
      wall
    }
  });

  layer.lines[lineId] = {
    holes: [],
    id: lineId,
    misc: {
      source,
      sourceId,
      wall
    },
    name: "",
    prototype: "lines",
    properties: {
      height: roundMetric(wallHeight),
      thickness: roundMetric(wallThickness)
    },
    selected: false,
    type: "wall",
    vertices: [vertex1, vertex2],
    visible: true
  };
  addVertexLineRef(layer, vertex1, lineId);
  addVertexLineRef(layer, vertex2, lineId);

  openings.forEach((opening) => {
    const holeId = `hole_${sourceId}_${opening.id}`;
    layer.holes[holeId] = {
      id: holeId,
      line: lineId,
      misc: {
        source,
        sourceId,
        sourceOpeningId: opening.id,
        wall
      },
      name: "",
      offset: openingOffsetRatio(opening, wallPoints),
      properties: {
        frameDepth: roundMetric(opening.frameDepth),
        height: roundMetric(opening.height),
        sillHeight: roundMetric(opening.sillHeight),
        width: roundMetric(opening.width)
      },
      prototype: "holes",
      selected: false,
      type: opening.type === "door" ? "door" : "window",
      visible: true
    };
    layer.lines[lineId].holes.push(holeId);
  });

  return lineId;
}

function addRoomToInterop({ blueprintFloors, floor, floorHeight, layer, object, plannerVertexLookup, floorplanCornerLookup }) {
  const blueprintFloor = getOrCreateFloor(blueprintFloors, floor, floorHeight, makeBlueprintFloor);
  const [width = 1, height = 2.7, depth = 1] = object.size ?? [1, 2.7, 1];
  const wallThickness = object.room?.wallThickness ?? object.wallThickness ?? 0.16;
  const bounds = getRoomBounds(object);
  const areaId = `area_${object.id}`;
  const areaPoints = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ];
  const areaVertices = areaPoints.map((point) => getOrCreateVertex(layer, plannerVertexLookup, floor, point));

  layer.areas[areaId] = {
    holes: [],
    id: areaId,
    misc: {
      source: "ploton-room",
      sourceId: object.id
    },
    name: object.name ?? "Room",
    properties: {
      depth: roundMetric(depth),
      floorMaterial: object.room?.floorMaterial ?? "painted-slab",
      height: roundMetric(height),
      width: roundMetric(width)
    },
    prototype: "areas",
    selected: false,
    type: "room",
    vertices: areaVertices,
    visible: true
  };
  areaVertices.forEach((vertexId) => addVertexAreaRef(layer, vertexId, areaId));

  WALL_DIRECTIONS.forEach((wall, wallIndex) => {
    const wallOpenings = (object.room?.openings ?? []).filter((opening) => opening.wall === wall);
    addWallToInterop({
      blueprintFloor,
      floor,
      floorHeight,
      floorplanCornerLookup,
      layer,
      openings: wallOpenings,
      plannerVertexLookup,
      source: "ploton-room-wall",
      sourceId: object.id,
      wall,
      wallHeight: height,
      wallIndex,
      wallPoints: getRoomWallPoints(object, wall),
      wallThickness
    });
  });
}

function addStructuralWallToInterop({ blueprintFloors, floor, floorHeight, layer, object, plannerVertexLookup, floorplanCornerLookup }) {
  const blueprintFloor = getOrCreateFloor(blueprintFloors, floor, floorHeight, makeBlueprintFloor);
  const [, height = 2.7, thickness = 0.16] = object.size ?? [1, 2.7, 0.16];
  addWallToInterop({
    blueprintFloor,
    floor,
    floorHeight,
    floorplanCornerLookup,
    layer,
    openings: object.wallOpenings ?? [],
    plannerVertexLookup,
    source: "ploton-structural-wall",
    sourceId: object.id,
    wall: "freeform",
    wallHeight: height,
    wallIndex: 0,
    wallPoints: getStructuralWallPoints(object),
    wallThickness: thickness
  });
}

function addItemToPlannerLayer(layer, object) {
  const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
  const [width = 1, height = 1, depth = 1] = object.size ?? [1, 1, 1];
  const itemId = `item_${object.id}`;
  layer.items[itemId] = {
    id: itemId,
    misc: {
      assetId: object.assetId,
      placementMode: object.placementMode,
      source: "ploton-object",
      sourceId: object.id
    },
    name: object.name ?? object.assetId ?? "Object",
    prototype: "items",
    properties: {
      depth: roundMetric(depth),
      height: roundMetric(height),
      width: roundMetric(width)
    },
    rotation: roundMetric(object.rotation?.[1] ?? 0),
    selected: false,
    type: object.type ?? "item",
    visible: true,
    x: roundMetric(x),
    y: roundMetric(z)
  };
}

export function buildStudioFloorplanInterop(objects, { activeFloor = 1, floorHeight = 2.7 } = {}) {
  const blueprintFloors = {};
  const plannerLayers = {};
  const floorplanCornerLookup = new Map();
  const plannerVertexLookup = new Map();
  const floors = new Set([activeFloor]);

  objects.forEach((object) => {
    const floor = getObjectFloor(object, activeFloor, floorHeight);
    floors.add(floor);
    const { layer } = createLayerAccess(plannerLayers, floor, floorHeight);

    if (object.type === "room") {
      addRoomToInterop({
        blueprintFloors,
        floor,
        floorHeight,
        floorplanCornerLookup,
        layer,
        object,
        plannerVertexLookup
      });
      return;
    }

    if (
      object.type === "structural-wall" ||
      object.type === "wall" ||
      object.placementMode === "draw-wall" ||
      object.supportKind === "wall"
    ) {
      addStructuralWallToInterop({
        blueprintFloors,
        floor,
        floorHeight,
        floorplanCornerLookup,
        layer,
        object,
        plannerVertexLookup
      });
      return;
    }

    addItemToPlannerLayer(layer, object);
  });

  floors.forEach((floor) => {
    getOrCreateFloor(blueprintFloors, floor, floorHeight, makeBlueprintFloor);
    createLayerAccess(plannerLayers, floor, floorHeight);
  });

  const orderedFloorIds = [...floors].sort((a, b) => a - b).map((floor) => `floor_${floor}`);
  const layerIds = orderedFloorIds.map((floorId) => floorId.replace("floor_", "layer_"));
  const layerValues = Object.values(plannerLayers);
  const summary = {
    areaCount: layerValues.reduce((total, layer) => total + Object.keys(layer.areas).length, 0),
    floorCount: orderedFloorIds.length,
    holeCount: layerValues.reduce((total, layer) => total + Object.keys(layer.holes).length, 0),
    itemCount: layerValues.reduce((total, layer) => total + Object.keys(layer.items).length, 0),
    lineCount: layerValues.reduce((total, layer) => total + Object.keys(layer.lines).length, 0),
    vertexCount: layerValues.reduce((total, layer) => total + Object.keys(layer.vertices).length, 0)
  };

  return {
    blueprint3d: {
      floors: blueprintFloors,
      schema: "ploton-blueprint3d-floorplan-adapter"
    },
    reactPlanner: {
      groups: {},
      grids: {
        h1: { id: "h1", properties: { step: 1 }, type: "horizontal-streak" },
        v1: { id: "v1", properties: { step: 1 }, type: "vertical-streak" }
      },
      height: 100,
      layerIds,
      layers: plannerLayers,
      schema: "ploton-react-planner-layer-adapter",
      selectedLayer: `layer_${activeFloor}`,
      unit: "meter",
      width: 100
    },
    schema: "ploton-floorplan-interop",
    summary
  };
}
