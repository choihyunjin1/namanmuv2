export const DEFAULT_ROOF_OVERHANG = 0.35;
export const ROOF_ACCESSORY_CLEARANCE = 0.06;

function roundDimension(value) {
  return Number(value.toFixed(2));
}

export function createRoofObjectForRoom(room, asset, options = {}) {
  if (!room || room.type !== "room" || !asset || asset.categoryId !== "roof") return null;

  const id = options.id ?? `roof-${room.id}`;
  const overhang = options.overhang ?? DEFAULT_ROOF_OVERHANG;
  const [roomX = 0, roomBaseY = 0, roomZ = 0] = room.position ?? [0, 0, 0];
  const [roomWidth = 1, roomHeight = 2.7, roomDepth = 1] = room.size ?? [1, 2.7, 1];
  const [, assetHeight = 0.8] = asset.size ?? [1, 0.8, 1];
  const roofHeight = asset.shape === "slab" ? Math.max(assetHeight, 0.28) : Math.max(assetHeight, 0.65);
  const width = Number((roomWidth + overhang * 2).toFixed(2));
  const depth = Number((roomDepth + overhang * 2).toFixed(2));
  const y = Number((roomBaseY + roomHeight + roofHeight / 2).toFixed(2));
  const floor = room.room?.floor ?? room.floor ?? 1;

  return {
    id,
    type: "catalog-asset",
    assetId: asset.id,
    categoryId: asset.categoryId,
    name: `${room.name ?? "방"} ${asset.label}`,
    color: asset.color,
    floor,
    position: [roomX, y, roomZ],
    placementMode: "roof-attached",
    rotation: [0, 0, 0],
    shape: asset.shape,
    size: [width, roofHeight, depth],
    metadata: {
      attachedRoomId: room.id,
      floorNumber: floor,
      overhang,
      placementSource: "roof-room-attach",
      source: "studio-editor-roof-tool",
      sourceAssetLabel: asset.label
    }
  };
}

export function createRoofAccessoryObjectForRoom(room, asset, roof = null, options = {}) {
  if (!room || room.type !== "room" || !asset || asset.categoryId === "roof") return null;

  const id = options.id ?? `roof-accessory-${room.id}-${asset.id}`;
  const [roomX = 0, roomBaseY = 0, roomZ = 0] = room.position ?? [0, 0, 0];
  const [roomWidth = 1, roomHeight = 2.7, roomDepth = 1] = room.size ?? [1, 2.7, 1];
  const [roofX = roomX, roofY = roomBaseY + roomHeight + 0.18, roofZ = roomZ] = roof?.position ?? [];
  const [roofWidth = roomWidth + DEFAULT_ROOF_OVERHANG * 2, roofHeight = 0.35, roofDepth = roomDepth + DEFAULT_ROOF_OVERHANG * 2] =
    roof?.size ?? [];
  const roofShape = roof?.shape ?? "slab";
  const floor = room.room?.floor ?? room.floor ?? 1;
  const kind = asset.categoryId.replace("roof-", "");
  const baseY = Number((roofY + roofHeight / 2 + ROOF_ACCESSORY_CLEARANCE).toFixed(2));
  const dimensions = {
    decor: [
      Math.min(roofWidth * 0.42, Math.max(asset.size?.[0] ?? 1, 0.8)),
      Math.max(asset.size?.[1] ?? 0.35, 0.24),
      Math.max(asset.size?.[2] ?? 0.18, 0.16)
    ],
    pattern: [
      roofShape === "slab" ? Math.max(roofWidth - 0.72, 0.8) : Math.max(roofWidth - 0.1, 0.8),
      roofShape === "slab" ? Math.max(asset.size?.[1] ?? 0.08, 0.06) : roofHeight + 0.04,
      roofShape === "slab" ? Math.max(roofDepth - 0.72, 0.8) : Math.max(roofDepth - 0.1, 0.8)
    ],
    trim: [
      roofWidth + 0.08,
      Math.max(asset.size?.[1] ?? 0.16, 0.12),
      roofDepth + 0.08
    ]
  };
  const size = (dimensions[kind] ?? [asset.size?.[0] ?? 1, asset.size?.[1] ?? 0.2, asset.size?.[2] ?? 1])
    .map(roundDimension);
  const offsetZ = kind === "decor" ? Number((roofDepth / 2 + size[2] / 2 - 0.18).toFixed(2)) : 0;
  const centerYByKind = {
    pattern: roofShape === "slab"
      ? Number((baseY + size[1] / 2).toFixed(2))
      : Number((roofY + ROOF_ACCESSORY_CLEARANCE / 2).toFixed(2)),
    trim: Number((roofY - roofHeight / 2 + size[1] / 2 + 0.03).toFixed(2))
  };
  const position = [
    roofX,
    centerYByKind[kind] ?? Number((baseY + size[1] / 2).toFixed(2)),
    Number((roofZ + offsetZ).toFixed(2))
  ];

  return {
    id,
    type: "catalog-asset",
    assetId: asset.id,
    categoryId: asset.categoryId,
    name: `${room.name ?? "방"} ${asset.label}`,
    color: asset.color,
    floor,
    placementMode: "roof-accessory",
    position,
    rotation: [0, 0, 0],
    shape: asset.shape,
    size,
    metadata: {
      accessoryKind: kind,
      attachedRoofId: roof?.id ?? null,
      attachedRoomId: room.id,
      floorNumber: floor,
      placementSource: "roof-accessory-attach",
      roofShape,
      source: "studio-editor-roof-tool",
      sourceAssetLabel: asset.label
    }
  };
}
