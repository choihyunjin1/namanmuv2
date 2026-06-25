import { isStructuralWallObject } from "./wallJoinRules.js";

export function getOpeningNodeId(hostId, openingId) {
  return `${hostId}:${openingId}`;
}

function getHostLabel(object) {
  return object?.name ?? object?.label ?? object?.id ?? "opening host";
}

function getHostFloor(object) {
  return object?.room?.floor ?? object?.floor ?? object?.metadata?.floorNumber ?? 1;
}

function openingToNode(opening, host, hostType, order) {
  const openingId = opening.id ?? opening.openingId;
  const hostId = host.id;
  const type = opening.type ?? opening.openingType ?? "opening";

  return {
    id: getOpeningNodeId(hostId, openingId),
    openingId,
    hostId,
    hostType,
    hostLabel: getHostLabel(host),
    assetId: opening.assetId,
    label: opening.label ?? (type === "door" ? "문 개구부" : "창문 개구부"),
    type,
    floor: getHostFloor(host),
    wall: opening.wall,
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    sillHeight: opening.sillHeight,
    frameDepth: opening.frameDepth,
    color: opening.color ?? host.color,
    order
  };
}

export function collectOpeningNodes(objects = []) {
  if (!Array.isArray(objects)) return [];

  const nodes = [];
  objects.forEach((object) => {
    (object?.room?.openings ?? []).forEach((opening) => {
      nodes.push(openingToNode(opening, object, "room", nodes.length));
    });

    if (isStructuralWallObject(object)) {
      (object?.wallOpenings ?? []).forEach((opening) => {
        nodes.push(openingToNode(opening, object, "wall", nodes.length));
      });
    }
  });

  return nodes;
}

export function findOpeningNode(nodes, ref) {
  if (!Array.isArray(nodes) || !ref?.openingId) return null;

  const hostId = ref.hostId ?? ref.roomId ?? ref.wallObjectId;
  if (!hostId) return null;

  return nodes.find((node) => (
    node.hostId === hostId &&
    node.openingId === ref.openingId
  )) ?? null;
}

export function summarizeOpeningNodes(nodes = []) {
  return (Array.isArray(nodes) ? nodes : []).reduce(
    (summary, node) => {
      summary.total += 1;

      const hostType = node.hostType ?? "unknown";
      summary.byHostType[hostType] = (summary.byHostType[hostType] ?? 0) + 1;

      const type = node.type ?? "unknown";
      summary.byType[type] = (summary.byType[type] ?? 0) + 1;

      return summary;
    },
    {
      total: 0,
      byHostType: {},
      byType: {}
    }
  );
}
