import { isStructuralWallObject } from "./wallJoinRules.js";

export function getAttachmentNodeId(hostId, attachmentId) {
  return `${hostId}:${attachmentId}`;
}

function getHostLabel(object) {
  return object?.name ?? object?.label ?? object?.id ?? "attachment host";
}

function getHostFloor(object) {
  return object?.room?.floor ?? object?.floor ?? object?.metadata?.floorNumber ?? 1;
}

function attachmentToNode(attachment, host, hostType, order) {
  const attachmentId = attachment.id ?? attachment.attachmentId;
  const hostId = host.id;
  const type = attachment.type ?? attachment.placementMode ?? "attachment";

  return {
    id: getAttachmentNodeId(hostId, attachmentId),
    attachmentId,
    hostId,
    hostType,
    hostLabel: getHostLabel(host),
    assetId: attachment.assetId,
    label: attachment.label,
    type,
    shape: attachment.shape,
    floor: getHostFloor(host),
    wall: attachment.wall,
    offset: attachment.offset,
    centerY: attachment.centerY,
    width: attachment.width,
    height: attachment.height,
    depth: attachment.depth,
    color: attachment.color ?? host.color,
    order
  };
}

export function collectAttachmentNodes(objects = []) {
  if (!Array.isArray(objects)) return [];

  const nodes = [];
  objects.forEach((object) => {
    (object?.room?.attachments ?? []).forEach((attachment) => {
      nodes.push(attachmentToNode(attachment, object, "room", nodes.length));
    });

    if (isStructuralWallObject(object)) {
      (object?.wallAttachments ?? []).forEach((attachment) => {
        nodes.push(attachmentToNode(attachment, object, "wall", nodes.length));
      });
    }
  });

  return nodes;
}

export function findAttachmentNode(nodes, ref) {
  if (!Array.isArray(nodes) || !ref?.attachmentId) return null;

  const hostId = ref.hostId ?? ref.roomId ?? ref.wallObjectId;
  if (!hostId) return null;

  return nodes.find((node) => (
    node.hostId === hostId &&
    node.attachmentId === ref.attachmentId
  )) ?? null;
}

export function summarizeAttachmentNodes(nodes = []) {
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
