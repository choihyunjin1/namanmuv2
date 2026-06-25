from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import trimesh


DEFAULT_OUTPUT_DIR = Path("public/assets/models")

DEFAULT_CLASSES = [
    "IfcWindow",
    "IfcDoor",
    "IfcRoof",
    "IfcSlab",
    "IfcWallStandardCase",
    "IfcWall",
    "IfcCurtainWall",
    "IfcCovering",
    "IfcColumn",
    "IfcBeam",
    "IfcFooting",
    "IfcBuildingElementProxy",
    "IfcFlowTerminal",
    "IfcFlowSegment",
    "IfcDistributionElement",
]

DEFAULT_COLORS = {
    "IfcBeam": [0.63, 0.55, 0.46, 1.0],
    "IfcBuildingElementProxy": [0.62, 0.62, 0.58, 1.0],
    "IfcColumn": [0.68, 0.6, 0.5, 1.0],
    "IfcCovering": [0.78, 0.76, 0.7, 1.0],
    "IfcCurtainWall": [0.36, 0.57, 0.64, 0.72],
    "IfcDistributionElement": [0.35, 0.42, 0.44, 1.0],
    "IfcDoor": [0.55, 0.32, 0.18, 1.0],
    "IfcElementAssembly": [0.58, 0.58, 0.54, 1.0],
    "IfcFlowSegment": [0.48, 0.5, 0.52, 1.0],
    "IfcFlowTerminal": [0.52, 0.56, 0.58, 1.0],
    "IfcFooting": [0.5, 0.48, 0.45, 1.0],
    "IfcRoof": [0.18, 0.2, 0.2, 1.0],
    "IfcSlab": [0.72, 0.74, 0.7, 1.0],
    "IfcWall": [0.86, 0.84, 0.78, 1.0],
    "IfcWallStandardCase": [0.86, 0.84, 0.78, 1.0],
    "IfcWindow": [0.33, 0.55, 0.62, 0.78],
}

CLASS_TO_KIND = {
    "IfcBeam": "beam",
    "IfcBuildingElementProxy": "building-proxy",
    "IfcColumn": "column",
    "IfcCovering": "cladding-panel",
    "IfcCurtainWall": "curtain-wall",
    "IfcDistributionElement": "equipment",
    "IfcDoor": "door",
    "IfcElementAssembly": "assembly",
    "IfcFlowSegment": "mep-segment",
    "IfcFlowTerminal": "equipment",
    "IfcFooting": "foundation",
    "IfcRoof": "roof",
    "IfcSlab": "slab",
    "IfcWall": "wall-panel",
    "IfcWallStandardCase": "wall-panel",
    "IfcWindow": "window",
}

KIND_LABELS = {
    "beam": "Beam",
    "building-proxy": "Building Proxy",
    "cladding-panel": "Cladding Panel",
    "column": "Column",
    "curtain-wall": "Curtain Wall",
    "door": "Door",
    "equipment": "Equipment",
    "assembly": "Assembly",
    "foundation": "Foundation",
    "mep-segment": "MEP Segment",
    "roof": "Roof",
    "slab": "Slab",
    "wall-panel": "Wall Panel",
    "window": "Window",
}


def _float(value: object, fallback: float = 1.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _material_color(material: object, ifc_type: str) -> list[float]:
    diffuse = getattr(material, "diffuse", None)
    colour = getattr(diffuse, "colour", None)

    if colour is not None:
        return [
            _float(getattr(colour, "r", None)),
            _float(getattr(colour, "g", None)),
            _float(getattr(colour, "b", None)),
            1.0 - _float(getattr(diffuse, "transparency", 0.0), 0.0),
        ]

    return DEFAULT_COLORS.get(ifc_type, [0.74, 0.74, 0.7, 1.0])


def _transform_ifc_to_three(vertices: np.ndarray) -> np.ndarray:
    transformed = np.empty_like(vertices, dtype=np.float64)
    transformed[:, 0] = vertices[:, 0]
    transformed[:, 1] = vertices[:, 2]
    transformed[:, 2] = -vertices[:, 1]
    return transformed


def _slug(value: str, fallback: str = "asset") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug[:80] or fallback


def _name(entity: Any, fallback: str) -> str:
    value = getattr(entity, "Name", None)
    return str(value)[:100] if value else fallback


def _shape_to_mesh(model: Any, shape: Any, entity: Any | None) -> tuple[trimesh.Trimesh | None, str, np.ndarray | None]:
    geometry = shape.geometry
    raw_vertices = np.array(geometry.verts, dtype=np.float64).reshape((-1, 3))
    raw_faces = np.array(geometry.faces, dtype=np.int64).reshape((-1, 3))
    if len(raw_vertices) == 0 or len(raw_faces) == 0:
        return None, "IfcProduct", None

    resolved_entity = entity
    if resolved_entity is None and getattr(shape, "guid", None):
        try:
            resolved_entity = model.by_guid(shape.guid)
        except Exception:
            resolved_entity = None

    ifc_type = resolved_entity.is_a() if resolved_entity is not None else str(getattr(shape, "type", "IfcProduct"))
    vertices = _transform_ifc_to_three(raw_vertices)
    faces = raw_faces.copy()

    materials = list(getattr(geometry, "materials", []) or [])
    material_ids = list(getattr(geometry, "material_ids", []) or [])
    default_color = DEFAULT_COLORS.get(ifc_type, [0.74, 0.74, 0.7, 1.0])
    face_colors = np.tile(np.array(default_color) * 255, (len(faces), 1)).astype(np.uint8)

    if materials and material_ids:
        for face_index, material_id in enumerate(material_ids[: len(faces)]):
            if 0 <= material_id < len(materials):
                color = _material_color(materials[material_id], ifc_type)
                face_colors[face_index] = (np.array(color) * 255).clip(0, 255).astype(np.uint8)

    export_vertices = vertices[faces].reshape((-1, 3))
    export_faces = np.arange(len(export_vertices), dtype=np.int64).reshape((-1, 3))
    vertex_colors = np.repeat(face_colors, 3, axis=0)

    mesh = trimesh.Trimesh(vertices=export_vertices, faces=export_faces, process=False)
    mesh.visual.vertex_colors = vertex_colors
    return mesh, ifc_type, export_vertices


def _placement_rules(kind: str) -> tuple[str, dict[str, Any]]:
    if kind in {"window", "door", "cladding-panel", "curtain-wall"}:
        return "surface-center", {
            "rotatable": True,
            "snappable": True,
            "requiresGround": False,
            "attachToSurface": "wall",
            "supportsSurfaceSnap": True,
        }
    if kind == "roof":
        return "roof-center", {
            "rotatable": True,
            "snappable": True,
            "requiresGround": False,
            "attachToSurface": "building-top",
            "supportsSurfaceSnap": True,
        }
    if kind in {"slab", "foundation"}:
        return "ground-center", {
            "rotatable": True,
            "snappable": True,
            "requiresGround": True,
            "supportsGridSnap": True,
        }
    if kind in {"wall-panel", "column", "beam"}:
        return "ground-center", {
            "rotatable": True,
            "snappable": True,
            "requiresGround": True,
            "supportsGridSnap": True,
            "supportsSurfaceSnap": True,
        }
    return "object-center", {
        "rotatable": True,
        "snappable": True,
        "requiresGround": False,
        "supportsGridSnap": True,
    }


def _normalize_scene(scene: trimesh.Scene, all_vertices: list[np.ndarray], target_size: float) -> dict[str, Any]:
    stacked = np.vstack(all_vertices)
    minimum = stacked.min(axis=0)
    maximum = stacked.max(axis=0)
    center = (minimum + maximum) / 2
    extents = maximum - minimum
    longest = max(float(extents.max()), 0.001)
    scale = target_size / longest

    transform = np.eye(4)
    transform[:3, 3] = [-center[0], -minimum[1], -center[2]]
    scale_matrix = np.diag([scale, scale, scale, 1.0])
    baked_transform = scale_matrix @ transform
    for geometry in scene.geometry.values():
        geometry.apply_transform(baked_transform)

    return {
        "targetSize": target_size,
        "scale": scale,
        "axis": "IFC x,y,z -> Three x,y,z = x,z,-y",
        "sourceBounds": {
            "min": minimum.round(4).tolist(),
            "max": maximum.round(4).tolist(),
            "extent": extents.round(4).tolist(),
        },
    }


def _write_asset(
    *,
    model: Any,
    ifc_path: Path,
    output_dir: Path,
    asset_id: str,
    label: str,
    scene: trimesh.Scene,
    all_vertices: list[np.ndarray],
    entity_counts: dict[str, int],
    kind: str,
    bim_type: str,
    target_size: float,
    source_mode: str,
    source_entities: list[dict[str, Any]],
    review_status: str,
) -> dict[str, Any]:
    normalization = _normalize_scene(scene, all_vertices, target_size)
    output_path = output_dir / f"{asset_id}.glb"
    metadata_path = output_dir / f"{asset_id}.json"
    output_dir.mkdir(parents=True, exist_ok=True)
    scene.export(output_path, file_type="glb")

    anchor, placement_rules = _placement_rules(kind)
    tags = sorted({
        "bim-component",
        "component",
        "component-ready",
        "editable-component",
        "glb",
        "ifc-derived",
        "local-asset",
        kind,
        bim_type,
    })

    metadata = {
        "assetSchemaVersion": 1,
        "id": asset_id,
        "label": label,
        "type": "component",
        "componentKind": kind,
        "bimType": bim_type,
        "format": "glb",
        "sourceType": "ifc",
        "source": ifc_path.name,
        "sourcePath": str(ifc_path),
        "sourceMode": source_mode,
        "generatedAssetFile": output_path.name,
        "scaleUnit": "meter",
        "unitScaleMetersPerSceneUnit": 1,
        "anchor": anchor,
        "tags": tags,
        "compatibleZones": [],
        "placementRules": placement_rules,
        "reviewStatus": review_status,
        "license": "source-review-required",
        "schema": model.schema,
        "entityCounts": dict(sorted(entity_counts.items())),
        "meshCount": len(scene.geometry),
        "sourceEntities": source_entities,
        "sourceBounds": normalization["sourceBounds"],
        "normalization": {
            "targetSize": normalization["targetSize"],
            "scale": normalization["scale"],
            "axis": normalization["axis"],
        },
        "quality": {
            "interactionReadiness": "component-ready",
            "manualReviewRequired": True,
            "limitation": "IFC-derived component asset for PLOT:ON exterior customization. Not a permit or construction document.",
        },
        "component": {
            "kind": kind,
            "bimType": bim_type,
            "reusable": True,
            "intendedUse": "drag-drop exterior customization",
        },
        "intake": {
            "status": "ifc-derived-generated",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceSizeBytes": ifc_path.stat().st_size,
        },
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "id": asset_id,
        "kind": kind,
        "bimType": bim_type,
        "glb": str(output_path),
        "metadata": str(metadata_path),
        "meshCount": len(scene.geometry),
        "entityCounts": metadata["entityCounts"],
    }


def _settings() -> Any:
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.DISABLE_OPENING_SUBTRACTIONS, False)
    return settings


def export_entity_components(
    ifc_path: Path,
    output_dir: Path,
    classes: list[str],
    max_per_class: int,
    max_total: int,
    target_size: float,
    prefix: str,
    review_status: str,
    dry_run: bool,
) -> list[dict[str, Any]]:
    model = ifcopenshell.open(str(ifc_path))
    settings = _settings()
    exported: list[dict[str, Any]] = []
    seen_global_ids: set[str] = set()
    source_slug = _slug(ifc_path.stem, "ifc")

    for class_name in classes:
        class_export_count = 0
        for entity in model.by_type(class_name):
            global_id = str(getattr(entity, "GlobalId", "") or "")
            if global_id and global_id in seen_global_ids:
                continue
            if global_id:
                seen_global_ids.add(global_id)
            if max_total and len(exported) >= max_total:
                return exported
            if max_per_class and class_export_count >= max_per_class:
                break

            ifc_type = entity.is_a()
            kind = CLASS_TO_KIND.get(ifc_type, CLASS_TO_KIND.get(class_name, "building-component"))
            asset_id = f"{prefix}-{source_slug}-{_slug(ifc_type, 'ifc')}-{class_export_count + 1:02d}"
            label = f"BIM {KIND_LABELS.get(kind, kind.title())} {class_export_count + 1:02d} - {ifc_path.stem}"
            source_entities = [{
                "ifcType": ifc_type,
                "globalId": global_id,
                "name": _name(entity, ""),
                "stepId": int(entity.id()),
            }]

            if dry_run:
                exported.append({
                    "id": asset_id,
                    "kind": kind,
                    "bimType": ifc_type,
                    "source": ifc_path.name,
                    "sourceEntities": source_entities,
                })
                class_export_count += 1
                continue

            try:
                shape = ifcopenshell.geom.create_shape(settings, entity)
                mesh, resolved_type, vertices = _shape_to_mesh(model, shape, entity)
            except Exception as exc:
                print(json.dumps({
                    "skipped": ifc_path.name,
                    "ifcType": ifc_type,
                    "globalId": global_id,
                    "reason": str(exc),
                }, ensure_ascii=False))
                continue

            if mesh is None or vertices is None:
                continue

            scene = trimesh.Scene()
            scene.add_geometry(mesh, node_name=f"{resolved_type}_{entity.id()}", geom_name=_slug(_name(entity, resolved_type), resolved_type))
            entity_counts = {resolved_type: 1}
            exported.append(_write_asset(
                model=model,
                ifc_path=ifc_path,
                output_dir=output_dir,
                asset_id=asset_id,
                label=label,
                scene=scene,
                all_vertices=[vertices],
                entity_counts=entity_counts,
                kind=kind,
                bim_type=resolved_type,
                target_size=target_size,
                source_mode="entity",
                source_entities=source_entities,
                review_status=review_status,
            ))
            class_export_count += 1

    return exported


def export_file_component(
    ifc_path: Path,
    output_dir: Path,
    target_size: float,
    prefix: str,
    review_status: str,
    dry_run: bool,
) -> list[dict[str, Any]]:
    model = ifcopenshell.open(str(ifc_path))
    settings = _settings()
    source_slug = _slug(ifc_path.stem, "ifc")
    asset_id = f"{prefix}-{source_slug}"

    dominant_type = "IfcProduct"
    dominant_kind = "building-component"
    entity_counts: dict[str, int] = {}
    semantic_counts = {class_name: len(model.by_type(class_name)) for class_name in DEFAULT_CLASSES if len(model.by_type(class_name))}
    source_entities: list[dict[str, Any]] = []

    if dry_run:
        if semantic_counts:
            dominant_type = max(semantic_counts.items(), key=lambda item: item[1])[0]
            dominant_kind = CLASS_TO_KIND.get(dominant_type, "building-component")
        return [{
            "id": asset_id,
            "kind": dominant_kind,
            "bimType": dominant_type,
            "source": ifc_path.name,
            "entityCounts": dict(sorted(semantic_counts.items())),
        }]

    scene = trimesh.Scene()
    all_vertices: list[np.ndarray] = []
    iterator = ifcopenshell.geom.iterator(settings, model, 1)
    if not iterator.initialize():
        return []

    while True:
        shape = iterator.get()
        entity = None
        if getattr(shape, "guid", None):
            try:
                entity = model.by_guid(shape.guid)
            except Exception:
                entity = None
        mesh, ifc_type, vertices = _shape_to_mesh(model, shape, entity)
        if mesh is not None and vertices is not None:
            step_id = int(entity.id()) if entity is not None else int(getattr(shape, "id", 0) or 0)
            scene.add_geometry(mesh, node_name=f"{ifc_type}_{step_id}", geom_name=_slug(_name(entity, ifc_type), ifc_type))
            all_vertices.append(vertices)
            entity_counts[ifc_type] = entity_counts.get(ifc_type, 0) + 1
            source_entities.append({
                "ifcType": ifc_type,
                "globalId": str(getattr(entity, "GlobalId", "") or ""),
                "name": _name(entity, ""),
                "stepId": step_id,
            })

        if not iterator.next():
            break

    if not all_vertices:
        return []

    if semantic_counts:
        dominant_type = max(semantic_counts.items(), key=lambda item: item[1])[0]
    else:
        dominant_type = max(entity_counts.items(), key=lambda item: item[1])[0]
    dominant_kind = CLASS_TO_KIND.get(dominant_type, "building-component")
    label = f"BIM {KIND_LABELS.get(dominant_kind, dominant_kind.title())} - {ifc_path.stem}"
    combined_counts = dict(entity_counts)
    for class_name, count in semantic_counts.items():
        combined_counts[class_name] = max(combined_counts.get(class_name, 0), count)
    return [_write_asset(
        model=model,
        ifc_path=ifc_path,
        output_dir=output_dir,
        asset_id=asset_id,
        label=label,
        scene=scene,
        all_vertices=all_vertices,
        entity_counts=combined_counts,
        kind=dominant_kind,
        bim_type=dominant_type,
        target_size=target_size,
        source_mode="file",
        source_entities=source_entities[:30],
        review_status=review_status,
    )]


def _parse_classes(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Export IFC-derived construction components as GLB + metadata JSON assets.")
    parser.add_argument("ifc", type=Path, nargs="+")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--mode", choices=["entities", "file"], default="entities")
    parser.add_argument("--classes", default=",".join(DEFAULT_CLASSES))
    parser.add_argument("--max-per-class", type=int, default=2)
    parser.add_argument("--max-total", type=int, default=16)
    parser.add_argument("--target-size", type=float, default=1.8)
    parser.add_argument("--prefix", default="bim-component")
    parser.add_argument("--review-status", default="needs-review")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    classes = _parse_classes(args.classes)
    results: list[dict[str, Any]] = []
    for ifc_path in args.ifc:
        if not ifc_path.exists():
            raise SystemExit(f"IFC not found: {ifc_path}")
        if args.mode == "file":
            results.extend(export_file_component(
                ifc_path=ifc_path,
                output_dir=args.output_dir,
                target_size=args.target_size,
                prefix=args.prefix,
                review_status=args.review_status,
                dry_run=args.dry_run,
            ))
        else:
            results.extend(export_entity_components(
                ifc_path=ifc_path,
                output_dir=args.output_dir,
                classes=classes,
                max_per_class=args.max_per_class,
                max_total=args.max_total,
                target_size=args.target_size,
                prefix=args.prefix,
                review_status=args.review_status,
                dry_run=args.dry_run,
            ))

    print(json.dumps({
        "mode": args.mode,
        "count": len(results),
        "assets": results,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
