import { normalizePlacementMode } from "./placementRules.js";

export const HOST_KINDS = {
  FLOOR: "floor",
  ROOM: "room",
  ROOF: "roof",
  STRUCTURAL_WALL: "structural-wall",
  UNKNOWN: "unknown"
};

export const HOST_ELIGIBILITY_INVALID_REASONS = {
  REQUIRES_FLOOR_HOST: "requires-floor-host",
  REQUIRES_ROOM_HOST: "requires-room-host",
  REQUIRES_ROOF_HOST: "requires-roof-host",
  REQUIRES_WALL_HOST: "requires-wall-host",
  UNSUPPORTED_HOST: "unsupported-host"
};

export const HOST_ELIGIBILITY_BY_PLACEMENT_MODE = {
  "draw-room": {
    allowedHostKinds: [HOST_KINDS.FLOOR],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_FLOOR_HOST
  },
  "draw-wall": {
    allowedHostKinds: [HOST_KINDS.FLOOR],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_FLOOR_HOST
  },
  "floor-free": {
    allowedHostKinds: [HOST_KINDS.FLOOR],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_FLOOR_HOST
  },
  "floor-stair": {
    allowedHostKinds: [HOST_KINDS.FLOOR],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_FLOOR_HOST
  },
  "floor-structural": {
    allowedHostKinds: [HOST_KINDS.FLOOR],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_FLOOR_HOST
  },
  "roof-accessory": {
    allowedHostKinds: [HOST_KINDS.ROOF, HOST_KINDS.ROOM],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_ROOF_HOST
  },
  "roof-attached": {
    allowedHostKinds: [HOST_KINDS.ROOM],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_ROOM_HOST
  },
  "wall-attached": {
    allowedHostKinds: [HOST_KINDS.ROOM, HOST_KINDS.STRUCTURAL_WALL],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_WALL_HOST
  },
  "wall-opening": {
    allowedHostKinds: [HOST_KINDS.ROOM, HOST_KINDS.STRUCTURAL_WALL],
    invalidReason: HOST_ELIGIBILITY_INVALID_REASONS.REQUIRES_WALL_HOST
  }
};

function getSupportKind(host) {
  return host?.supportKind ?? host?.metadata?.supportKind ?? null;
}

function isRoofHost(host) {
  return (
    host?.type === "roof" ||
    host?.hostKind === HOST_KINDS.ROOF ||
    host?.categoryId === "roof" ||
    host?.placementMode === "roof-attached" ||
    host?.metadata?.hostKind === HOST_KINDS.ROOF
  );
}

export function getHostKind(host = null) {
  if (host == null) return HOST_KINDS.FLOOR;
  if (typeof host === "string") {
    return Object.values(HOST_KINDS).includes(host) ? host : HOST_KINDS.UNKNOWN;
  }

  if (host.hostKind && Object.values(HOST_KINDS).includes(host.hostKind)) return host.hostKind;
  if (host.type === "floor" || host.type === "ground" || host.kind === "ground") return HOST_KINDS.FLOOR;
  if (host.type === "room") return HOST_KINDS.ROOM;
  if (isRoofHost(host)) return HOST_KINDS.ROOF;
  if (host.type === "structural-wall" || getSupportKind(host) === "wall") return HOST_KINDS.STRUCTURAL_WALL;

  return HOST_KINDS.UNKNOWN;
}

export function getAllowedHostKinds(asset = {}) {
  const placementMode = normalizePlacementMode(asset);
  const rule = HOST_ELIGIBILITY_BY_PLACEMENT_MODE[placementMode] ?? HOST_ELIGIBILITY_BY_PLACEMENT_MODE["floor-free"];
  return [...rule.allowedHostKinds];
}

export function validateHostEligibility(asset = {}, host = null) {
  const placementMode = normalizePlacementMode(asset);
  const rule = HOST_ELIGIBILITY_BY_PLACEMENT_MODE[placementMode] ?? HOST_ELIGIBILITY_BY_PLACEMENT_MODE["floor-free"];
  const hostKind = getHostKind(host);
  const allowed = rule.allowedHostKinds.includes(hostKind);

  return {
    allowed,
    allowedHostKinds: [...rule.allowedHostKinds],
    hostKind,
    invalidReason: allowed
      ? null
      : hostKind === HOST_KINDS.UNKNOWN
      ? HOST_ELIGIBILITY_INVALID_REASONS.UNSUPPORTED_HOST
      : rule.invalidReason,
    placementMode
  };
}
