import { getAssetTaxonomy } from "./assetTaxonomyRules.js";
import { HOST_KINDS, validateHostEligibility } from "./hostEligibilityRules.js";

const WALL_DIRECTIONS = ["north", "south", "east", "west"];

function roundMetric(value) {
  return Number((Number(value) || 0).toFixed(3));
}

function makeNode({ children = [], id, metadata = {}, parentId = null, type, visible = true, ...rest }) {
  return {
    object: "node",
    id,
    type,
    parentId,
    visible,
    metadata,
    children,
    ...rest
  };
}

function addNode(graph, node) {
  graph.nodes[node.id] = node;
  if (node.parentId && graph.nodes[node.parentId]) {
    graph.nodes[node.parentId].children.push(node.id);
  }
  return node;
}

function createCatalogLookup(catalogAssets = []) {
  return new Map(
    (Array.isArray(catalogAssets) ? catalogAssets : [])
      .filter((asset) => asset?.id)
      .map((asset) => [asset.id, asset])
  );
}

function resolveAssetContext(catalogLookup, source = {}, fallback = {}) {
  const assetId = source?.assetId ?? source?.id ?? fallback?.id ?? null;
  const catalogAsset = assetId ? catalogLookup.get(assetId) : null;
  return {
    ...fallback,
    ...(catalogAsset ?? {}),
    ...(source ?? {}),
    id: catalogAsset?.id ?? assetId ?? source?.id ?? fallback?.id ?? "unknown-asset"
  };
}

function createPolicyMetadata(assetContext, host = null) {
  const taxonomy = getAssetTaxonomy(assetContext);
  const hostEligibility = validateHostEligibility(assetContext, host);
  return {
    assetId: assetContext.assetId ?? assetContext.id ?? null,
    categoryId: taxonomy.categoryId,
    hostEligibility,
    placementMode: taxonomy.placementMode,
    taxonomy
  };
}

function createHostMetadata(assetContext, host, fields = {}) {
  const hostEligibility = validateHostEligibility(assetContext, host);
  return {
    allowedHostKinds: hostEligibility.allowedHostKinds,
    hostKind: hostEligibility.hostKind,
    ...fields
  };
}

function createFloorHostMetadata(assetContext, floor) {
  return createHostMetadata(assetContext, null, {
    hostKind: HOST_KINDS.FLOOR,
    hostNodeId: `level_${floor}`,
    hostObjectId: null,
    relationship: "floor-placement"
  });
}

function createWallLocalOpening(opening) {
  return {
    frameDepth: roundMetric(opening.frameDepth),
    height: roundMetric(opening.height),
    offset: roundMetric(opening.offset),
    sillHeight: roundMetric(opening.sillHeight),
    width: roundMetric(opening.width)
  };
}

function createWallLocalAttachment(attachment) {
  return {
    centerY: roundMetric(attachment.centerY),
    depth: roundMetric(attachment.depth),
    height: roundMetric(attachment.height),
    offset: roundMetric(attachment.offset),
    width: roundMetric(attachment.width)
  };
}

function getObjectFloor(object, fallbackFloor = 1, floorHeight = 2.7) {
  if (Number.isFinite(object?.room?.floor)) return object.room.floor;
  if (Number.isFinite(object?.floor)) return object.floor;
  if (Number.isFinite(object?.metadata?.floorNumber)) return object.metadata.floorNumber;
  const y = Number(object?.position?.[1] ?? 0);
  return Math.max(1, Math.round(y / floorHeight) + 1) || fallbackFloor;
}

function getRoomWallSegment(room, wall) {
  const [x = 0, , z = 0] = room.position ?? [0, 0, 0];
  const [width = 1, , depth = 1] = room.size ?? [1, 2.7, 1];
  const west = roundMetric(x - width / 2);
  const east = roundMetric(x + width / 2);
  const north = roundMetric(z - depth / 2);
  const south = roundMetric(z + depth / 2);

  if (wall === "north") return { start: [west, north], end: [east, north] };
  if (wall === "south") return { start: [east, south], end: [west, south] };
  if (wall === "east") return { start: [east, north], end: [east, south] };
  return { start: [west, south], end: [west, north] };
}

function getStructuralWallSegment(object) {
  const [x = 0, , z = 0] = object.position ?? [0, 0, 0];
  const [length = 1] = object.size ?? [1, 2.7, 0.16];
  const yaw = object.rotation?.[1] ?? 0;
  const half = length / 2;
  const dx = Math.cos(yaw) * half;
  const dz = -Math.sin(yaw) * half;
  return {
    end: [roundMetric(x + dx), roundMetric(z + dz)],
    start: [roundMetric(x - dx), roundMetric(z - dz)]
  };
}

function openingToNode(opening, parentId, hostObjectId, context = {}) {
  const nodeType = opening.type === "door" ? "door" : "window";
  const assetContext = resolveAssetContext(context.catalogLookup, opening, {
    categoryId: nodeType === "door" ? "door" : "window",
    openingType: nodeType,
    placementMode: "wall-opening"
  });
  return makeNode({
    id: `${nodeType}_${hostObjectId}_${opening.id}`,
    type: nodeType,
    parentId,
    metadata: {
      assetId: opening.assetId,
      ...createPolicyMetadata(assetContext, context.hostObject),
      host: createHostMetadata(assetContext, context.hostObject, {
        hostNodeId: parentId,
        hostObjectId,
        relationship: "wall-opening",
        sourceFeatureId: opening.id,
        wall: opening.wall,
        wallLocal: createWallLocalOpening(opening)
      }),
      hostObjectId,
      source: "ploton-wall-opening",
      sourceOpeningId: opening.id
    },
    offset: roundMetric(opening.offset),
    sillHeight: roundMetric(opening.sillHeight),
    width: roundMetric(opening.width),
    height: roundMetric(opening.height),
    frameDepth: roundMetric(opening.frameDepth)
  });
}

function attachmentToNode(attachment, parentId, hostObjectId, context = {}) {
  const assetContext = resolveAssetContext(context.catalogLookup, attachment, {
    categoryId: attachment.categoryId ?? "wall-pattern",
    placementMode: "wall-attached"
  });
  return makeNode({
    id: `item_${hostObjectId}_${attachment.id}`,
    type: "item",
    parentId,
    metadata: {
      assetId: attachment.assetId,
      ...createPolicyMetadata(assetContext, context.hostObject),
      host: createHostMetadata(assetContext, context.hostObject, {
        hostNodeId: parentId,
        hostObjectId,
        relationship: "wall-attachment",
        sourceFeatureId: attachment.id,
        wall: attachment.wall,
        wallLocal: createWallLocalAttachment(attachment)
      }),
      hostObjectId,
      source: "ploton-wall-attachment",
      sourceAttachmentId: attachment.id
    },
    wall: attachment.wall,
    offset: roundMetric(attachment.offset),
    centerY: roundMetric(attachment.centerY),
    width: roundMetric(attachment.width),
    height: roundMetric(attachment.height),
    depth: roundMetric(attachment.depth)
  });
}

function addLevel(graph, floor, floorHeight) {
  const levelId = `level_${floor}`;
  if (graph.nodes[levelId]) return graph.nodes[levelId];
  graph.levelIds.push(levelId);
  return addNode(
    graph,
    makeNode({
      id: levelId,
      type: "level",
      parentId: "building_primary",
      elevation: roundMetric((floor - 1) * floorHeight),
      metadata: {
        floor,
        source: "ploton-active-floor"
      }
    })
  );
}

function addRoomNodes(graph, object, floor, floorHeight, context = {}) {
  const level = addLevel(graph, floor, floorHeight);
  const [x = 0, y = 0, z = 0] = object.position ?? [0, 0, 0];
  const [width = 1, height = 2.7, depth = 1] = object.size ?? [1, 2.7, 1];
  const zoneId = `zone_${object.id}`;
  const roomAssetContext = resolveAssetContext(context.catalogLookup, object, {
    categoryId: object.categoryId ?? "wall-tool",
    placementMode: object.placementMode ?? "draw-room"
  });

  addNode(
    graph,
    makeNode({
      id: zoneId,
      type: "zone",
      parentId: level.id,
      metadata: {
        ...createPolicyMetadata(roomAssetContext, null),
        host: createFloorHostMetadata(roomAssetContext, floor),
        source: "ploton-room",
        sourceObjectId: object.id
      },
      position: [roundMetric(x), roundMetric(y), roundMetric(z)],
      size: [roundMetric(width), roundMetric(height), roundMetric(depth)]
    })
  );

  addNode(
    graph,
    makeNode({
      id: `slab_${object.id}`,
      type: "slab",
      parentId: level.id,
        metadata: {
          hostObjectId: object.id,
          material: object.room?.floorMaterial ?? "painted-slab",
          source: "ploton-room-floor",
        sourceObjectId: object.id,
        zoneId
      },
      polygon: [
        [roundMetric(x - width / 2), roundMetric(z - depth / 2)],
        [roundMetric(x + width / 2), roundMetric(z - depth / 2)],
        [roundMetric(x + width / 2), roundMetric(z + depth / 2)],
        [roundMetric(x - width / 2), roundMetric(z + depth / 2)]
      ]
    })
  );

  WALL_DIRECTIONS.forEach((wall) => {
    const wallNodeId = `wall_${object.id}_${wall}`;
    const segment = getRoomWallSegment(object, wall);
    addNode(
      graph,
      makeNode({
        id: wallNodeId,
        type: "wall",
        parentId: level.id,
        metadata: {
          hostObjectId: object.id,
          source: "ploton-room-wall",
          sourceObjectId: object.id,
          wall
        },
        start: segment.start,
        end: segment.end,
        height: roundMetric(height),
        thickness: roundMetric(object.room?.wallThickness ?? object.wallThickness ?? 0.16),
        frontSide: "unknown",
        backSide: "unknown"
      })
    );

    (object.room?.openings ?? [])
      .filter((opening) => opening.wall === wall)
      .forEach((opening) => addNode(graph, openingToNode(opening, wallNodeId, object.id, {
        catalogLookup: context.catalogLookup,
        hostObject: object
      })));

    (object.room?.attachments ?? [])
      .filter((attachment) => attachment.wall === wall)
      .forEach((attachment) => addNode(graph, attachmentToNode(attachment, wallNodeId, object.id, {
        catalogLookup: context.catalogLookup,
        hostObject: object
      })));
  });
}

function addStructuralWallNode(graph, object, floor, floorHeight, context = {}) {
  const level = addLevel(graph, floor, floorHeight);
  const [length = 1, height = 2.7, thickness = 0.16] = object.size ?? [1, 2.7, 0.16];
  const wallNodeId = `wall_${object.id}`;
  const segment = getStructuralWallSegment(object);
  const wallAssetContext = resolveAssetContext(context.catalogLookup, object, {
    categoryId: object.categoryId ?? "wall-tool",
    placementMode: object.placementMode ?? "floor-structural",
    supportKind: "wall"
  });
  addNode(
    graph,
    makeNode({
      id: wallNodeId,
      type: "wall",
      parentId: level.id,
      metadata: {
        ...createPolicyMetadata(wallAssetContext, null),
        host: createFloorHostMetadata(wallAssetContext, floor),
        source: "ploton-structural-wall",
        sourceObjectId: object.id
      },
      start: segment.start,
      end: segment.end,
      height: roundMetric(height),
      length: roundMetric(length),
      thickness: roundMetric(thickness),
      frontSide: "unknown",
      backSide: "unknown"
    })
  );

  (object.wallOpenings ?? []).forEach((opening) => addNode(graph, openingToNode(opening, wallNodeId, object.id, {
    catalogLookup: context.catalogLookup,
    hostObject: object
  })));
  (object.wallAttachments ?? []).forEach((attachment) => addNode(graph, attachmentToNode(attachment, wallNodeId, object.id, {
    catalogLookup: context.catalogLookup,
    hostObject: object
  })));
}

function getItemHostMetadata(assetContext, object, floor, context = {}) {
  const metadata = object.metadata ?? {};
  if (object.placementMode === "roof-attached" && metadata.attachedRoomId) {
    const hostObject = context.objectsById?.get(metadata.attachedRoomId) ?? null;
    return createHostMetadata(assetContext, hostObject, {
      hostKind: HOST_KINDS.ROOM,
      hostNodeId: `zone_${metadata.attachedRoomId}`,
      hostObjectId: metadata.attachedRoomId,
      relationship: "room-roof"
    });
  }
  if (object.placementMode === "roof-accessory" && metadata.attachedRoofId) {
    const hostObject = context.objectsById?.get(metadata.attachedRoofId) ?? null;
    return createHostMetadata(assetContext, hostObject, {
      hostKind: HOST_KINDS.ROOF,
      hostNodeId: `item_${metadata.attachedRoofId}`,
      hostObjectId: metadata.attachedRoofId,
      relationship: "roof-accessory",
      secondaryHostObjectId: metadata.attachedRoomId ?? null
    });
  }
  return createFloorHostMetadata(assetContext, floor);
}

function getItemPolicyHost(object, context = {}) {
  const metadata = object.metadata ?? {};
  if (object.placementMode === "roof-attached" && metadata.attachedRoomId) {
    return context.objectsById?.get(metadata.attachedRoomId) ?? null;
  }
  if (object.placementMode === "roof-accessory" && metadata.attachedRoofId) {
    return context.objectsById?.get(metadata.attachedRoofId) ?? null;
  }
  return null;
}

function addItemNode(graph, object, floor, floorHeight, context = {}) {
  const level = addLevel(graph, floor, floorHeight);
  const assetContext = resolveAssetContext(context.catalogLookup, object, {
    categoryId: object.categoryId,
    placementMode: object.placementMode
  });
  const policyHost = getItemPolicyHost(object, context);
  const isStair = object.placementMode === "floor-stair" || object.categoryId === "stairs-ladder";
  const stairMetadata = object.metadata?.stair ?? {};
  const normalizedStair = stairMetadata.normalized ?? {};
  addNode(
    graph,
    makeNode({
      id: `item_${object.id}`,
      type: object.placementMode?.startsWith("roof") ? "roof" : isStair ? "stair" : "item",
      parentId: level.id,
      metadata: {
        assetId: object.assetId,
        categoryId: object.categoryId,
        ...createPolicyMetadata(assetContext, policyHost),
        host: getItemHostMetadata(assetContext, object, floor, context),
        placementMode: object.placementMode,
        stair: isStair
          ? (() => {
              const metadata = {
                landingDepth: stairMetadata.landingDepth ?? normalizedStair.landingDepth ?? object.metadata?.landingDepth ?? null,
                run: object.stairRun ?? object.metadata?.stairRun ?? normalizedStair.stairRun ?? null,
                rise: object.stairRise ?? object.metadata?.stairRise ?? normalizedStair.stairRise ?? null,
                stepCount: object.stepCount ?? object.metadata?.stepCount ?? normalizedStair.stepCount ?? null,
                type: object.stairType ?? object.metadata?.stairType ?? stairMetadata.layout ?? "straight"
              };
              if (stairMetadata.orientation?.ascentDirection) metadata.ascentDirection = stairMetadata.orientation.ascentDirection;
              if (stairMetadata.kind ?? normalizedStair.kind) metadata.kind = stairMetadata.kind ?? normalizedStair.kind;
              if (stairMetadata.layout ?? normalizedStair.layout) metadata.layout = stairMetadata.layout ?? normalizedStair.layout;
              if (stairMetadata.railingAttachments?.length > 0) {
                metadata.railingAttachmentCount = stairMetadata.railingAttachments.length;
              }
              return metadata;
            })()
          : undefined,
        source: "ploton-catalog-object",
        sourceObjectId: object.id
      },
      position: (object.position ?? [0, 0, 0]).map(roundMetric),
      rotation: (object.rotation ?? [0, 0, 0]).map(roundMetric),
      size: (object.size ?? [1, 1, 1]).map(roundMetric)
    })
  );
}

export function buildStudioPascalSceneGraph(objects = [], options = {}) {
  const floorHeight = options.floorHeight ?? 2.7;
  const activeFloor = options.activeFloor ?? 1;
  const catalogLookup = createCatalogLookup(options.catalogAssets);
  const objectsById = new Map(objects.filter((object) => object?.id).map((object) => [object.id, object]));
  const floors = new Set([activeFloor]);
  objects.forEach((object) => floors.add(getObjectFloor(object, activeFloor, floorHeight)));

  const graph = {
    schema: "ploton-pascal-compatible-scene-graph",
    schemaVersion: 1,
    source: {
      reference: "pascalorg/editor",
      strategy: "flat-node-graph-adapter"
    },
    rootNodeIds: ["site_primary"],
    levelIds: [],
    nodes: {}
  };

  addNode(
    graph,
    makeNode({
      id: "site_primary",
      type: "site",
      metadata: {
        hostEligibility: validateHostEligibility("floor-free", null),
        source: "ploton-studio-editor"
      }
    })
  );
  addNode(
    graph,
    makeNode({
      id: "building_primary",
      type: "building",
      parentId: "site_primary",
      metadata: {
        hostEligibility: validateHostEligibility("floor-free", null),
        source: "ploton-studio-editor"
      }
    })
  );

  [...floors].sort((a, b) => a - b).forEach((floor) => addLevel(graph, floor, floorHeight));
  objects.forEach((object) => {
    const floor = getObjectFloor(object, activeFloor, floorHeight);
    if (object.type === "room") {
      addRoomNodes(graph, object, floor, floorHeight, { catalogLookup });
    } else if (object.supportKind === "wall" || object.metadata?.supportKind === "wall") {
      addStructuralWallNode(graph, object, floor, floorHeight, { catalogLookup });
    } else {
      addItemNode(graph, object, floor, floorHeight, { catalogLookup, objectsById });
    }
  });

  const nodeIds = Object.keys(graph.nodes);
  return {
    ...graph,
    dirtyNodeIds: nodeIds.filter((id) => graph.nodes[id].metadata?.sourceObjectId),
    summary: {
      levelCount: graph.levelIds.length,
      nodeCount: nodeIds.length,
      rootCount: graph.rootNodeIds.length,
      wallCount: nodeIds.filter((id) => graph.nodes[id].type === "wall").length
    }
  };
}
