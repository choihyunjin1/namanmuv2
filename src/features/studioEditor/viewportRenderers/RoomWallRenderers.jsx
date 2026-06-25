import React from "react";
import { Edges, Html } from "@react-three/drei";
import * as THREE from "three";

const WALL_LOW_HEIGHT = 1.05;

function getWallViewOpacity(baseOpacity, floorMode, preview, wallViewMode = "cutaway") {
  if (preview) return baseOpacity;
  if (floorMode !== "current") return baseOpacity;
  if (wallViewMode === "up") return 1;
  if (wallViewMode === "low") return Math.min(baseOpacity, 0.72);
  if (wallViewMode === "translucent") return Math.min(baseOpacity, 0.36);
  return baseOpacity;
}

function getWallViewHeight(height, floorMode, preview, wallViewMode = "cutaway") {
  if (preview || floorMode !== "current" || wallViewMode !== "low") return height;
  return Math.min(height, WALL_LOW_HEIGHT);
}

function shouldHideWallDetails(floorMode, preview, wallViewMode = "cutaway") {
  return !preview && floorMode === "current" && wallViewMode === "low";
}

function formatPreviewBlockedReason(reason) {
  if (reason === "overlap") return "blocked overlap";
  if (reason === "out-of-wall") return "blocked out-of-wall";
  if (reason) return `blocked ${reason}`;
  return "blocked";
}

function getPreviewLabel(entity, fallbackLabel) {
  if (!entity?.preview) return entity?.label ?? fallbackLabel;
  if (entity.valid === false) return formatPreviewBlockedReason(entity.invalidReason);
  return `ready ${entity.label ?? fallbackLabel}`;
}

function getPreviewLabelClassName(entity, selected = false) {
  return [
    "studio-editor-object-label",
    entity?.preview ? "is-preview" : "",
    entity?.preview && entity.valid === false ? "is-invalid" : "",
    entity?.preview && entity.valid !== false ? "is-drafting" : "",
    selected && !entity?.preview ? "is-selected" : ""
  ].filter(Boolean).join(" ");
}

function mergeRanges(ranges) {
  return ranges
    .sort((a, b) => a[0] - b[0])
    .reduce((merged, range) => {
      const previous = merged[merged.length - 1];
      if (!previous || range[0] > previous[1]) {
        merged.push([...range]);
        return merged;
      }
      previous[1] = Math.max(previous[1], range[1]);
      return merged;
    }, []);
}

function createWallPanels(uLength, wallHeight, wallThickness, openings) {
  const half = uLength / 2;
  const boundaries = [-half, half];
  const normalizedOpenings = openings
    .map((opening) => ({
      ...opening,
      u1: Math.max(-half, opening.offset - opening.width / 2),
      u2: Math.min(half, opening.offset + opening.width / 2),
      y1: Math.max(0, opening.sillHeight),
      y2: Math.min(wallHeight, opening.sillHeight + opening.height)
    }))
    .filter((opening) => opening.u2 - opening.u1 > 0.01 && opening.y2 - opening.y1 > 0.01);

  normalizedOpenings.forEach((opening) => {
    boundaries.push(opening.u1, opening.u2);
  });

  const sortedBoundaries = [...new Set(boundaries.map((value) => Number(value.toFixed(3))))].sort((a, b) => a - b);
  const panels = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const u1 = sortedBoundaries[index];
    const u2 = sortedBoundaries[index + 1];
    const uWidth = u2 - u1;
    if (uWidth <= 0.01) continue;

    const uMid = (u1 + u2) / 2;
    const blockedRanges = mergeRanges(
      normalizedOpenings
        .filter((opening) => uMid > opening.u1 + 0.001 && uMid < opening.u2 - 0.001)
        .map((opening) => [opening.y1, opening.y2])
    );

    let cursor = 0;
    blockedRanges.forEach(([blockedStart, blockedEnd]) => {
      if (blockedStart - cursor > 0.01) {
        panels.push({ u: uMid, y: (cursor + blockedStart) / 2, size: [uWidth, blockedStart - cursor, wallThickness] });
      }
      cursor = Math.max(cursor, blockedEnd);
    });

    if (wallHeight - cursor > 0.01) {
      panels.push({ u: uMid, y: (cursor + wallHeight) / 2, size: [uWidth, wallHeight - cursor, wallThickness] });
    }
  }

  return panels;
}

function getWallLocalPosition(wall, u, y, roomWidth, roomDepth, wallThickness) {
  if (wall === "north") return [u, y, -roomDepth / 2 + wallThickness / 2];
  if (wall === "south") return [u, y, roomDepth / 2 - wallThickness / 2];
  if (wall === "west") return [-roomWidth / 2 + wallThickness / 2, y, u];
  return [roomWidth / 2 - wallThickness / 2, y, u];
}

function getWallPanelSize(wall, [uWidth, yHeight, wallThickness]) {
  if (wall === "north" || wall === "south") return [uWidth, yHeight, wallThickness];
  return [wallThickness, yHeight, uWidth];
}

function WallWithOpenings({
  activeTool,
  edgeColor,
  openings,
  onDeleteRoomWall,
  roomDepth,
  roomId,
  roomWidth,
  wall,
  wallHeight,
  wallMaterial,
  wallThickness
}) {
  const wallLength = wall === "north" || wall === "south" ? roomWidth : roomDepth;
  const panels = createWallPanels(wallLength, wallHeight, wallThickness, openings);

  return (
    <>
      {panels.map((panel, index) => (
        <mesh
          castShadow
          key={`${wall}-panel-${index}`}
          onPointerDown={(event) => {
            if (activeTool !== "erase" || !onDeleteRoomWall) return;
            event.stopPropagation();
            onDeleteRoomWall(roomId, wall);
          }}
          position={getWallLocalPosition(wall, panel.u, panel.y, roomWidth, roomDepth, wallThickness)}
          receiveShadow
        >
          <boxGeometry args={getWallPanelSize(wall, panel.size)} />
          {wallMaterial}
          <Edges color={edgeColor} lineWidth={1} />
        </mesh>
      ))}
    </>
  );
}

function OpeningMesh({
  activeTool,
  opening,
  preview = false,
  roomDepth,
  roomId,
  roomWidth,
  selected = false,
  wallThickness,
  onDeleteOpening,
  onOpeningDragStart,
  onSelectOpening
}) {
  const frameBar = Math.min(0.09, Math.max(0.05, Math.min(opening.width, opening.height) / 8));
  const frameDepth = opening.frameDepth ?? 0.18;
  const centerY = opening.sillHeight + opening.height / 2;
  const frameColor = opening.valid === false ? "#d46e5a" : selected ? "#f0b45f" : "#2f5960";
  const glassColor = opening.valid === false ? "#f5b2a5" : opening.color ?? "#7eb4c0";
  const glassOpacity = preview ? 0.34 : 0.48;
  const isDoor = opening.type === "door";
  const zSign = opening.wall === "north" ? -1 : 1;
  const xSign = opening.wall === "west" ? -1 : 1;
  const isHorizontalWall = opening.wall === "north" || opening.wall === "south";
  const surfaceZ = opening.wall === "north" ? -roomDepth / 2 : roomDepth / 2;
  const surfaceX = opening.wall === "west" ? -roomWidth / 2 : roomWidth / 2;
  const openingPosition = isHorizontalWall
    ? [opening.offset, centerY, surfaceZ + zSign * (frameDepth / 2 + 0.025)]
    : [surfaceX + xSign * (frameDepth / 2 + 0.025), centerY, opening.offset];
  const frameParts = isHorizontalWall
    ? [
        { position: [-opening.width / 2 - frameBar / 2, 0, 0], size: [frameBar, opening.height + frameBar * 2, frameDepth] },
        { position: [opening.width / 2 + frameBar / 2, 0, 0], size: [frameBar, opening.height + frameBar * 2, frameDepth] },
        { position: [0, -opening.height / 2 - frameBar / 2, 0], size: [opening.width + frameBar * 2, frameBar, frameDepth] },
        { position: [0, opening.height / 2 + frameBar / 2, 0], size: [opening.width + frameBar * 2, frameBar, frameDepth] }
      ]
    : [
        { position: [0, 0, -opening.width / 2 - frameBar / 2], size: [frameDepth, opening.height + frameBar * 2, frameBar] },
        { position: [0, 0, opening.width / 2 + frameBar / 2], size: [frameDepth, opening.height + frameBar * 2, frameBar] },
        { position: [0, -opening.height / 2 - frameBar / 2, 0], size: [frameDepth, frameBar, opening.width + frameBar * 2] },
        { position: [0, opening.height / 2 + frameBar / 2, 0], size: [frameDepth, frameBar, opening.width + frameBar * 2] }
      ];
  const glassSize = isHorizontalWall
    ? [opening.width * 0.86, opening.height * 0.84, frameDepth * 0.24]
    : [frameDepth * 0.24, opening.height * 0.84, opening.width * 0.86];
  const doorPanelSize = isHorizontalWall
    ? [opening.width * 0.78, opening.height * 0.92, frameDepth * 0.18]
    : [frameDepth * 0.18, opening.height * 0.92, opening.width * 0.78];
  const knobPosition = isHorizontalWall
    ? [opening.width * 0.28, -opening.height * 0.08, zSign * frameDepth * 0.18]
    : [xSign * frameDepth * 0.18, -opening.height * 0.08, opening.width * 0.28];
  const knobSize = isHorizontalWall ? [0.07, 0.07, 0.04] : [0.04, 0.07, 0.07];

  return (
    <group
      position={openingPosition}
      onPointerDown={(event) => {
        if (preview) return;
        event.stopPropagation();
        if (activeTool === "erase") {
          onDeleteOpening(roomId, opening.id);
          return;
        }
        onSelectOpening(roomId, opening.id);
        if (activeTool === "select" || activeTool === "move") {
          onOpeningDragStart(roomId, opening.id);
        }
      }}
    >
      {frameParts.map((part, index) => (
        <mesh castShadow key={`${opening.id}-frame-${index}`} position={part.position} receiveShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial color={frameColor} metalness={0.04} roughness={0.46} transparent={preview} opacity={preview ? 0.72 : 1} />
          <Edges color={selected ? "#102d29" : "#244a4f"} lineWidth={selected ? 2 : 1} />
        </mesh>
      ))}
      {isDoor ? (
        <>
          <mesh>
            <boxGeometry args={doorPanelSize} />
            <meshStandardMaterial
              color={opening.color ?? "#8c5d3c"}
              metalness={0.02}
              opacity={preview ? 0.58 : 0.92}
              roughness={0.58}
              transparent={preview}
            />
          </mesh>
          <mesh position={knobPosition}>
            <boxGeometry args={knobSize} />
            <meshStandardMaterial color="#d6c18c" metalness={0.42} roughness={0.32} />
          </mesh>
        </>
      ) : (
        <mesh>
          <boxGeometry args={glassSize} />
          <meshPhysicalMaterial
            color={glassColor}
            metalness={0}
            opacity={glassOpacity}
            roughness={0.16}
            transparent
            transmission={0.35}
          />
        </mesh>
      )}
      {selected || preview ? (
        <Html center distanceFactor={9} position={[0, opening.height / 2 + 0.28, 0]}>
          <div className={getPreviewLabelClassName(opening, selected)}>{getPreviewLabel(opening, "창문")}</div>
        </Html>
      ) : null}
    </group>
  );
}

function WallAttachmentMesh({
  activeTool,
  attachment,
  onDeleteAttachment,
  onAttachmentDragStart,
  onSelectAttachment,
  planMode = false,
  preview = false,
  roomDepth,
  roomHeight,
  roomId,
  roomWidth,
  selected = false
}) {
  const depth = attachment.depth ?? 0.06;
  const frameDepth = depth + 0.025;
  const isHorizontalWall = attachment.wall === "north" || attachment.wall === "south";
  const zSign = attachment.wall === "north" ? -1 : 1;
  const xSign = attachment.wall === "west" ? -1 : 1;
  const surfaceZ = attachment.wall === "north" ? -roomDepth / 2 : roomDepth / 2;
  const surfaceX = attachment.wall === "west" ? -roomWidth / 2 : roomWidth / 2;
  const attachmentPosition = isHorizontalWall
    ? [attachment.offset, planMode ? roomHeight + 0.08 : attachment.centerY, surfaceZ + zSign * (frameDepth / 2 + 0.035)]
    : [surfaceX + xSign * (frameDepth / 2 + 0.035), planMode ? roomHeight + 0.08 : attachment.centerY, attachment.offset];
  const attachmentSize = isHorizontalWall
    ? [attachment.width, attachment.height, frameDepth]
    : [frameDepth, attachment.height, attachment.width];
  const valid = attachment.valid !== false;
  const color = valid ? attachment.color ?? "#e4dfcf" : "#d46e5a";
  const edgeColor = selected ? "#102d29" : valid ? "#655f55" : "#8b261e";

  return (
    <group
      position={attachmentPosition}
      onPointerDown={(event) => {
        if (preview) return;
        event.stopPropagation();
        if (activeTool === "erase") {
          onDeleteAttachment(roomId, attachment.id);
          return;
        }
        onSelectAttachment(roomId, attachment.id);
        if (activeTool === "select" || activeTool === "move") {
          onAttachmentDragStart(roomId, attachment.id);
        }
      }}
    >
      {planMode ? (
        <mesh renderOrder={35}>
          <boxGeometry args={isHorizontalWall ? [Math.max(attachment.width, 0.8), 0.04, 0.42] : [0.42, 0.04, Math.max(attachment.width, 0.8)]} />
          <meshBasicMaterial color={selected ? "#f0b45f" : "#25a89a"} depthTest={false} opacity={selected ? 0.32 : 0.18} transparent />
        </mesh>
      ) : null}
      <mesh castShadow receiveShadow>
        <boxGeometry args={attachmentSize} />
        <meshStandardMaterial
          color={color}
          metalness={0.02}
          opacity={preview ? 0.56 : 0.9}
          roughness={0.74}
          transparent={preview}
        />
        <Edges color={edgeColor} lineWidth={selected ? 2 : 1} />
      </mesh>
      {attachment.shape === "tile" ? (
        <mesh position={[0, 0, 0.001]}>
          <boxGeometry args={isHorizontalWall ? [attachment.width * 0.92, 0.035, frameDepth + 0.01] : [frameDepth + 0.01, 0.035, attachment.width * 0.92]} />
          <meshStandardMaterial color="#ffffff" opacity={0.24} transparent />
        </mesh>
      ) : null}
      {selected || preview ? (
        <Html center distanceFactor={9} position={[0, attachment.height / 2 + 0.24, 0]}>
          <div className={getPreviewLabelClassName(attachment, selected)}>{getPreviewLabel(attachment, "벽 부착")}</div>
        </Html>
      ) : null}
    </group>
  );
}

function StructuralOpeningMesh({
  activeTool,
  opening,
  onDeleteOpening,
  onOpeningDragStart,
  onSelectOpening,
  preview = false,
  selected = false,
  wallHeight,
  wallObjectId
}) {
  const frameBar = Math.min(0.09, Math.max(0.05, Math.min(opening.width, opening.height) / 8));
  const frameDepth = opening.frameDepth ?? 0.18;
  const centerY = opening.sillHeight + opening.height / 2 - wallHeight / 2;
  const frameColor = opening.valid === false ? "#d46e5a" : selected ? "#f0b45f" : "#2f5960";
  const glassColor = opening.valid === false ? "#f5b2a5" : opening.color ?? "#7eb4c0";
  const isDoor = opening.type === "door";
  const frameParts = [
    { position: [-opening.width / 2 - frameBar / 2, 0, 0], size: [frameBar, opening.height + frameBar * 2, frameDepth] },
    { position: [opening.width / 2 + frameBar / 2, 0, 0], size: [frameBar, opening.height + frameBar * 2, frameDepth] },
    { position: [0, -opening.height / 2 - frameBar / 2, 0], size: [opening.width + frameBar * 2, frameBar, frameDepth] },
    { position: [0, opening.height / 2 + frameBar / 2, 0], size: [opening.width + frameBar * 2, frameBar, frameDepth] }
  ];
  const glassSize = [opening.width * 0.86, opening.height * 0.84, frameDepth * 0.24];
  const doorPanelSize = [opening.width * 0.78, opening.height * 0.92, frameDepth * 0.18];

  return (
    <group
      position={[opening.offset, centerY, frameDepth / 2 + 0.035]}
      onPointerDown={(event) => {
        if (preview) return;
        event.stopPropagation();
        if (activeTool === "erase") {
          onDeleteOpening(wallObjectId, opening.id);
          return;
        }
        onSelectOpening(wallObjectId, opening.id);
        if (activeTool === "select" || activeTool === "move") {
          onOpeningDragStart(wallObjectId, opening.id);
        }
      }}
    >
      {frameParts.map((part, index) => (
        <mesh castShadow key={`${opening.id}-structural-frame-${index}`} position={part.position} receiveShadow>
          <boxGeometry args={part.size} />
          <meshStandardMaterial color={frameColor} metalness={0.04} opacity={preview ? 0.72 : 1} roughness={0.46} transparent={preview} />
          <Edges color={selected ? "#102d29" : "#244a4f"} lineWidth={selected ? 2 : 1} />
        </mesh>
      ))}
      {isDoor ? (
        <>
          <mesh>
            <boxGeometry args={doorPanelSize} />
            <meshStandardMaterial
              color={opening.color ?? "#8c5d3c"}
              metalness={0.02}
              opacity={preview ? 0.58 : 0.92}
              roughness={0.58}
              transparent={preview}
            />
          </mesh>
          <mesh position={[opening.width * 0.28, -opening.height * 0.08, frameDepth * 0.18]}>
            <boxGeometry args={[0.07, 0.07, 0.04]} />
            <meshStandardMaterial color="#d6c18c" metalness={0.42} roughness={0.32} />
          </mesh>
        </>
      ) : (
        <mesh>
          <boxGeometry args={glassSize} />
          <meshPhysicalMaterial
            color={glassColor}
            metalness={0}
            opacity={preview ? 0.34 : 0.48}
            roughness={0.16}
            transparent
            transmission={0.35}
          />
        </mesh>
      )}
      {selected || preview ? (
        <Html center distanceFactor={9} position={[0, opening.height / 2 + 0.28, 0]}>
          <div className={getPreviewLabelClassName(opening, selected)}>{getPreviewLabel(opening, "개구부")}</div>
        </Html>
      ) : null}
    </group>
  );
}

function StructuralWallAttachmentMesh({
  activeTool,
  attachment,
  onDeleteAttachment,
  onAttachmentDragStart,
  onSelectAttachment,
  planMode = false,
  preview = false,
  selected = false,
  wallHeight,
  wallObjectId
}) {
  const depth = attachment.depth ?? 0.06;
  const frameDepth = depth + 0.025;
  const valid = attachment.valid !== false;
  const color = valid ? attachment.color ?? "#e4dfcf" : "#d46e5a";
  const edgeColor = selected ? "#102d29" : valid ? "#655f55" : "#8b261e";

  return (
    <group
      position={[attachment.offset, planMode ? wallHeight / 2 + 0.08 : attachment.centerY - wallHeight / 2, frameDepth / 2 + 0.04]}
      onPointerDown={(event) => {
        if (preview) return;
        event.stopPropagation();
        if (activeTool === "erase") {
          onDeleteAttachment(wallObjectId, attachment.id);
          return;
        }
        onSelectAttachment(wallObjectId, attachment.id);
        if (activeTool === "select" || activeTool === "move") {
          onAttachmentDragStart(wallObjectId, attachment.id);
        }
      }}
    >
      {planMode ? (
        <mesh renderOrder={35}>
          <boxGeometry args={[Math.max(attachment.width, 0.8), 0.04, 0.42]} />
          <meshBasicMaterial color={selected ? "#f0b45f" : "#25a89a"} depthTest={false} opacity={selected ? 0.32 : 0.18} transparent />
        </mesh>
      ) : null}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[attachment.width, attachment.height, frameDepth]} />
        <meshStandardMaterial
          color={color}
          metalness={0.02}
          opacity={preview ? 0.56 : 0.9}
          roughness={0.74}
          transparent={preview}
        />
        <Edges color={edgeColor} lineWidth={selected ? 2 : 1} />
      </mesh>
      {attachment.shape === "tile" ? (
        <mesh position={[0, 0, frameDepth / 2 + 0.006]}>
          <boxGeometry args={[attachment.width * 0.92, 0.035, 0.014]} />
          <meshStandardMaterial color="#ffffff" opacity={0.24} transparent />
        </mesh>
      ) : null}
      {selected || preview ? (
        <Html center distanceFactor={9} position={[0, attachment.height / 2 + 0.24, 0]}>
          <div className={getPreviewLabelClassName(attachment, selected)}>{getPreviewLabel(attachment, "벽 부착")}</div>
        </Html>
      ) : null}
    </group>
  );
}

export function StructuralWallBody({
  activeTool,
  dragging = false,
  floorMode = "current",
  object,
  onDeleteAttachment,
  onDeleteOpening,
  onAttachmentDragStart,
  onOpeningDragStart,
  onSelectAttachment,
  onSelectOpening,
  planMode = false,
  preview = false,
  selected = false,
  selectedAttachmentId,
  selectedOpeningId,
  wallAttachmentPreview,
  wallOpeningPreview,
  wallViewMode = "cutaway"
}) {
  const [wallLength = 1, wallHeight = 2.7, wallThickness = 0.16] = object.size ?? [1, 2.7, 0.16];
  const openings = object.wallOpenings ?? [];
  const attachments = object.wallAttachments ?? [];
  const previewOpening =
    wallOpeningPreview && wallOpeningPreview.wallObjectId === object.id && wallOpeningPreview.valid
      ? { ...wallOpeningPreview, id: "structural-opening-preview", preview: true }
      : null;
  const previewOnlyOpening =
    wallOpeningPreview && wallOpeningPreview.wallObjectId === object.id
      ? { ...wallOpeningPreview, id: "structural-opening-preview", preview: true }
      : null;
  const hideWallDetails = shouldHideWallDetails(floorMode, preview, wallViewMode);
  const displayedWallHeight = getWallViewHeight(wallHeight, floorMode, preview, wallViewMode);
  const allPanelOpenings = hideWallDetails ? [] : previewOpening ? [...openings, previewOpening] : openings;
  const previewAttachment =
    wallAttachmentPreview && wallAttachmentPreview.wallObjectId === object.id
      ? { ...wallAttachmentPreview, id: "structural-attachment-preview", preview: true }
      : null;
  const panels = createWallPanels(wallLength, displayedWallHeight, wallThickness, allPanelOpenings);
  const wallJoinCount = object.metadata?.wallJoin?.sourceCount ?? 1;
  const isJoinedWall = wallJoinCount > 1;
  const wallColor = dragging ? "#f6c879" : selected ? "#f0b45f" : isJoinedWall ? "#6cbcaf" : object.color ?? "#7fb6a8";
  const baseOpacity = floorMode === "current" ? 1 : floorMode === "below" ? 0.58 : 0.28;
  const opacity = getWallViewOpacity(baseOpacity, floorMode, preview, wallViewMode);
  const edgeColor = selected || dragging ? "#1b2f2a" : isJoinedWall ? "#0f6f64" : "#315b52";

  return (
    <group>
      {panels.map((panel, index) => (
        <mesh castShadow key={`${object.id}-wall-panel-${index}`} position={[panel.u, panel.y - wallHeight / 2, 0]} receiveShadow>
          <boxGeometry args={panel.size} />
          <meshStandardMaterial
            color={wallColor}
            metalness={0.02}
            opacity={preview ? 0.58 : opacity}
            roughness={0.68}
            transparent={preview || floorMode !== "current"}
          />
          <Edges color={edgeColor} lineWidth={selected || dragging || isJoinedWall ? 2 : 1} />
        </mesh>
      ))}
      {hideWallDetails ? null : openings.map((opening) => (
        <StructuralOpeningMesh
          activeTool={activeTool}
          key={opening.id}
          opening={opening}
          onDeleteOpening={onDeleteOpening}
          onOpeningDragStart={onOpeningDragStart}
          onSelectOpening={onSelectOpening}
          selected={selectedOpeningId === opening.id}
          wallHeight={wallHeight}
          wallObjectId={object.id}
        />
      ))}
      {hideWallDetails ? null : attachments.map((attachment) => (
        <StructuralWallAttachmentMesh
          activeTool={activeTool}
          attachment={attachment}
          key={attachment.id}
          onDeleteAttachment={onDeleteAttachment}
          onAttachmentDragStart={onAttachmentDragStart}
          onSelectAttachment={onSelectAttachment}
          planMode={planMode}
          selected={selectedAttachmentId === attachment.id}
          wallHeight={wallHeight}
          wallObjectId={object.id}
        />
      ))}
      {!hideWallDetails && previewOnlyOpening ? (
        <StructuralOpeningMesh
          activeTool={activeTool}
          opening={previewOnlyOpening}
          preview
          selected={previewOnlyOpening.valid}
          wallHeight={wallHeight}
          wallObjectId={object.id}
        />
      ) : null}
      {!hideWallDetails && previewAttachment ? (
        <StructuralWallAttachmentMesh
          activeTool={activeTool}
          attachment={previewAttachment}
          onDeleteAttachment={onDeleteAttachment}
          onAttachmentDragStart={onAttachmentDragStart}
          onSelectAttachment={onSelectAttachment}
          planMode={planMode}
          preview
          selected={previewAttachment.valid}
          wallHeight={wallHeight}
          wallObjectId={object.id}
        />
      ) : null}
    </group>
  );
}

export function RoomBody({
  activeTool,
  dragging = false,
  floorMode = "current",
  object,
  onDeleteAttachment,
  onDeleteOpening,
  onDeleteRoomWall,
  onAttachmentDragStart,
  onOpeningDragStart,
  onSelectAttachment,
  onSelectOpening,
  planMode = false,
  preview = false,
  selected = false,
  selectedAttachmentId,
  selectedOpeningId,
  wallAttachmentPreview,
  wallOpeningPreview,
  wallViewMode = "cutaway"
}) {
  const [width = 1, height = 2.7, depth = 1] = object.size ?? [1, 2.7, 1];
  const wallThickness = object.room?.wallThickness ?? object.wallThickness ?? 0.16;
  const wallColor = dragging ? "#f6c879" : selected ? "#f0b45f" : object.color ?? "#a9c9bd";
  const floorColor = preview ? "#dff3ec" : "#d8eee7";
  const floorModeOpacity = floorMode === "current" ? 0.84 : floorMode === "below" ? 0.42 : 0.24;
  const hideWallDetails = shouldHideWallDetails(floorMode, preview, wallViewMode);
  const displayedWallHeight = getWallViewHeight(height, floorMode, preview, wallViewMode);
  const opacity = getWallViewOpacity(preview ? 0.5 : floorModeOpacity, floorMode, preview, wallViewMode);
  const edgeColor = selected || dragging ? "#1b2f2a" : "#43796e";
  const wallMaterial = (
    <meshStandardMaterial
      color={wallColor}
      metalness={0.02}
      opacity={opacity}
      roughness={0.72}
      transparent={preview || floorMode !== "current"}
    />
  );

  const actualOpenings = object.room?.openings ?? [];
  const actualAttachments = object.room?.attachments ?? [];
  const previewOpening =
    wallOpeningPreview && wallOpeningPreview.roomId === object.id && wallOpeningPreview.valid
      ? { ...wallOpeningPreview, id: "opening-preview", preview: true }
      : null;
  const allPanelOpenings = hideWallDetails ? [] : previewOpening ? [...actualOpenings, previewOpening] : actualOpenings;
  const previewOnlyOpening =
    wallOpeningPreview && wallOpeningPreview.roomId === object.id
      ? { ...wallOpeningPreview, id: "opening-preview", preview: true }
      : null;
  const previewAttachment =
    wallAttachmentPreview && wallAttachmentPreview.roomId === object.id
      ? { ...wallAttachmentPreview, id: "attachment-preview", preview: true }
      : null;

  return (
    <group>
      {planMode ? null : (
        <mesh position={[0, 0.026, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial
            color={floorColor}
            metalness={0}
            opacity={preview ? 0.48 : 0.72}
            roughness={0.86}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      )}

      {["north", "south", "west", "east"].map((wall) => (
        <WallWithOpenings
          activeTool={activeTool}
          edgeColor={edgeColor}
          key={wall}
          onDeleteRoomWall={onDeleteRoomWall}
          openings={allPanelOpenings.filter((opening) => opening.wall === wall)}
          roomDepth={depth}
          roomId={object.id}
          roomWidth={width}
          wall={wall}
          wallHeight={displayedWallHeight}
          wallMaterial={wallMaterial}
          wallThickness={wallThickness}
        />
      ))}

      {hideWallDetails ? null : actualOpenings.map((opening) => (
        <OpeningMesh
          activeTool={activeTool}
          key={opening.id}
          opening={opening}
          onDeleteOpening={onDeleteOpening}
          onOpeningDragStart={onOpeningDragStart}
          onSelectOpening={onSelectOpening}
          roomDepth={depth}
          roomId={object.id}
          roomWidth={width}
          selected={selectedOpeningId === opening.id}
          wallThickness={wallThickness}
        />
      ))}

      {hideWallDetails ? null : actualAttachments.map((attachment) => (
        <WallAttachmentMesh
          activeTool={activeTool}
          attachment={attachment}
          key={attachment.id}
          onDeleteAttachment={onDeleteAttachment}
          onAttachmentDragStart={onAttachmentDragStart}
          onSelectAttachment={onSelectAttachment}
          planMode={planMode}
          roomDepth={depth}
          roomHeight={height}
          roomId={object.id}
          roomWidth={width}
          selected={selectedAttachmentId === attachment.id}
        />
      ))}

      {!hideWallDetails && previewOnlyOpening ? (
        <OpeningMesh
          activeTool={activeTool}
          opening={previewOnlyOpening}
          preview
          roomDepth={depth}
          roomId={object.id}
          roomWidth={width}
          selected={previewOnlyOpening.valid}
          wallThickness={wallThickness}
        />
      ) : null}

      {!hideWallDetails && previewAttachment ? (
        <WallAttachmentMesh
          activeTool={activeTool}
          attachment={previewAttachment}
          onDeleteAttachment={onDeleteAttachment}
          onAttachmentDragStart={onAttachmentDragStart}
          onSelectAttachment={onSelectAttachment}
          planMode={planMode}
          preview
          roomDepth={depth}
          roomHeight={height}
          roomId={object.id}
          roomWidth={width}
          selected={previewAttachment.valid}
        />
      ) : null}
    </group>
  );
}
