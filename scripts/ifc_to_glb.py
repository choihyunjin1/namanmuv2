from __future__ import annotations

import argparse
import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import trimesh


DEFAULT_COLORS = {
    "IfcCovering": [0.78, 0.76, 0.7, 1.0],
    "IfcCurtainWall": [0.36, 0.57, 0.64, 0.72],
    "IfcDoor": [0.55, 0.32, 0.18, 1.0],
    "IfcRoof": [0.18, 0.2, 0.2, 1.0],
    "IfcSlab": [0.72, 0.74, 0.7, 1.0],
    "IfcStair": [0.64, 0.49, 0.34, 1.0],
    "IfcWall": [0.86, 0.84, 0.78, 1.0],
    "IfcWallStandardCase": [0.86, 0.84, 0.78, 1.0],
    "IfcWindow": [0.33, 0.55, 0.62, 0.78],
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


def _safe_name(entity: object, fallback: str) -> str:
    name = getattr(entity, "Name", None)
    if not name:
        return fallback
    return str(name).replace("/", "-").replace("\\", "-")[:80]


def convert_ifc_to_glb(ifc_path: Path, output_path: Path, metadata_path: Path, target_size: float) -> dict:
    model = ifcopenshell.open(str(ifc_path))

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    settings.set(settings.DISABLE_OPENING_SUBTRACTIONS, False)

    scene = trimesh.Scene()
    all_vertices: list[np.ndarray] = []
    entity_counts: dict[str, int] = {}

    iterator = ifcopenshell.geom.iterator(settings, model, 1)
    if not iterator.initialize():
        raise RuntimeError(f"No renderable geometry found: {ifc_path}")

    while True:
        shape = iterator.get()
        geometry = shape.geometry
        raw_vertices = np.array(geometry.verts, dtype=np.float64).reshape((-1, 3))
        raw_faces = np.array(geometry.faces, dtype=np.int64).reshape((-1, 3))

        if len(raw_vertices) and len(raw_faces):
            vertices = _transform_ifc_to_three(raw_vertices)
            faces = raw_faces.copy()

            entity = model.by_guid(shape.guid) if shape.guid else None
            ifc_type = entity.is_a() if entity is not None else str(getattr(shape, "type", "IfcProduct"))
            entity_counts[ifc_type] = entity_counts.get(ifc_type, 0) + 1

            materials = list(getattr(geometry, "materials", []) or [])
            material_ids = list(getattr(geometry, "material_ids", []) or [])
            default_color = DEFAULT_COLORS.get(ifc_type, [0.74, 0.74, 0.7, 1.0])
            face_colors = np.tile(np.array(default_color) * 255, (len(faces), 1)).astype(np.uint8)

            if materials and material_ids:
                for face_index, material_id in enumerate(material_ids[: len(faces)]):
                    if 0 <= material_id < len(materials):
                        face_colors[face_index] = (np.array(_material_color(materials[material_id], ifc_type)) * 255).clip(0, 255).astype(np.uint8)

            # glTF stores vertex colors. Duplicating vertices per face preserves IFC material
            # colors without pulling in scipy for trimesh's face->vertex color conversion.
            export_vertices = vertices[faces].reshape((-1, 3))
            export_faces = np.arange(len(export_vertices), dtype=np.int64).reshape((-1, 3))
            vertex_colors = np.repeat(face_colors, 3, axis=0)

            mesh = trimesh.Trimesh(vertices=export_vertices, faces=export_faces, process=False)
            mesh.visual.vertex_colors = vertex_colors
            scene.add_geometry(mesh, node_name=f"{ifc_type}_{shape.id}", geom_name=_safe_name(entity, f"{ifc_type}_{shape.id}"))
            all_vertices.append(export_vertices)

        if not iterator.next():
            break

    if not all_vertices:
        raise RuntimeError(f"Geometry iterator returned no meshes: {ifc_path}")

    stacked = np.vstack(all_vertices)
    minimum = stacked.min(axis=0)
    maximum = stacked.max(axis=0)
    center = (minimum + maximum) / 2
    extents = maximum - minimum
    longest_horizontal = max(float(extents[0]), float(extents[2]), 0.001)
    scale = target_size / longest_horizontal

    transform = np.eye(4)
    transform[:3, 3] = [-center[0], -minimum[1], -center[2]]
    scale_matrix = np.diag([scale, scale, scale, 1.0])
    scene.apply_transform(scale_matrix @ transform)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    scene.export(output_path, file_type="glb")

    metadata = {
        "assetSchemaVersion": 1,
        "id": output_path.stem,
        "label": output_path.stem.replace("-", " ").title(),
        "type": "house-shell",
        "format": "glb",
        "sourceType": "ifc",
        "source": ifc_path.name,
        "output": str(output_path),
        "scaleUnit": "meter",
        "anchor": "site-center",
        "tags": ["detached-house", "ifc-derived", "building-shell"],
        "compatibleZones": [],
        "placementRules": {
            "rotatable": True,
            "snappable": True,
            "requiresGround": True,
        },
        "reviewStatus": "needs-review",
        "license": "source-review-required",
        "schema": model.schema,
        "entityCounts": dict(sorted(entity_counts.items())),
        "meshCount": len(scene.geometry),
        "sourceBounds": {
            "min": minimum.round(4).tolist(),
            "max": maximum.round(4).tolist(),
            "extent": extents.round(4).tolist(),
        },
        "normalization": {
            "targetSize": target_size,
            "scale": scale,
            "axis": "IFC x,y,z -> Three x,y,z = x,z,-y",
        },
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert IFC building assets to normalized GLB for PLOT:ON.")
    parser.add_argument("ifc", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--target-size", type=float, default=4.4)
    args = parser.parse_args()

    metadata_path = args.metadata or args.output.with_suffix(".json")
    metadata = convert_ifc_to_glb(args.ifc, args.output, metadata_path, args.target_size)
    print(json.dumps({"output": metadata["output"], "meshCount": metadata["meshCount"], "schema": metadata["schema"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
