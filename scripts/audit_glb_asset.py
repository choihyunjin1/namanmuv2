from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


GLB_MAGIC = b"glTF"
JSON_CHUNK = 0x4E4F534A
TRIANGLES_MODE = 4


def read_glb_json(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB file is too small.")
    if data[:4] != GLB_MAGIC:
        raise ValueError("File does not start with GLB magic bytes.")

    version = int.from_bytes(data[4:8], "little")
    declared_length = int.from_bytes(data[8:12], "little")
    if version != 2:
        raise ValueError(f"Only GLB 2.0 is supported. Found version {version}.")
    if declared_length != len(data):
        raise ValueError("GLB declared length does not match file size.")

    offset = 12
    while offset + 8 <= len(data):
        chunk_length = int.from_bytes(data[offset:offset + 4], "little")
        chunk_type = int.from_bytes(data[offset + 4:offset + 8], "little")
        chunk_start = offset + 8
        chunk_end = chunk_start + chunk_length
        if chunk_end > len(data):
            raise ValueError("GLB chunk extends beyond file size.")
        if chunk_type == JSON_CHUNK:
            return json.loads(data[chunk_start:chunk_end].decode("utf-8").rstrip("\x00 "))
        offset = chunk_end

    raise ValueError("GLB JSON chunk was not found.")


def collection_len(value: Any) -> int:
    return len(value) if isinstance(value, list) else 0


def accessor_count(gltf: dict[str, Any], accessor_index: int | None) -> int | None:
    accessors = gltf.get("accessors")
    if accessor_index is None or not isinstance(accessors, list):
        return None
    if accessor_index < 0 or accessor_index >= len(accessors):
        return None
    count = accessors[accessor_index].get("count")
    return int(count) if isinstance(count, int) else None


def position_accessor_index(primitive: dict[str, Any]) -> int | None:
    attributes = primitive.get("attributes")
    if not isinstance(attributes, dict):
        return None
    position = attributes.get("POSITION")
    return int(position) if isinstance(position, int) else None


def union_bounds(bounds: dict[str, list[float]] | None, min_value: list[Any], max_value: list[Any]) -> dict[str, list[float]]:
    min_vec = [float(value) for value in min_value[:3]]
    max_vec = [float(value) for value in max_value[:3]]
    if bounds is None:
        return {"min": min_vec, "max": max_vec}
    return {
        "min": [min(bounds["min"][index], min_vec[index]) for index in range(3)],
        "max": [max(bounds["max"][index], max_vec[index]) for index in range(3)],
    }


def inspect_geometry(gltf: dict[str, Any]) -> tuple[dict[str, int], dict[str, Any] | None]:
    primitive_count = 0
    triangle_count = 0
    unknown_triangle_primitives = 0
    bounds: dict[str, list[float]] | None = None

    accessors = gltf.get("accessors") if isinstance(gltf.get("accessors"), list) else []
    for mesh in gltf.get("meshes", []) or []:
        for primitive in mesh.get("primitives", []) or []:
            primitive_count += 1
            mode = primitive.get("mode", TRIANGLES_MODE)
            if mode != TRIANGLES_MODE:
                unknown_triangle_primitives += 1
                continue

            position_index = position_accessor_index(primitive)
            if position_index is not None and 0 <= position_index < len(accessors):
                accessor = accessors[position_index]
                if isinstance(accessor.get("min"), list) and isinstance(accessor.get("max"), list):
                    bounds = union_bounds(bounds, accessor["min"], accessor["max"])

            index_count = accessor_count(gltf, primitive.get("indices"))
            if index_count is None:
                position_count = accessor_count(gltf, position_index)
                if position_count is None:
                    unknown_triangle_primitives += 1
                    continue
                triangle_count += position_count // 3
            else:
                triangle_count += index_count // 3

    counts = {
        "scenes": collection_len(gltf.get("scenes")),
        "nodes": collection_len(gltf.get("nodes")),
        "meshes": collection_len(gltf.get("meshes")),
        "materials": collection_len(gltf.get("materials")),
        "textures": collection_len(gltf.get("textures")),
        "images": collection_len(gltf.get("images")),
        "animations": collection_len(gltf.get("animations")),
        "buffers": collection_len(gltf.get("buffers")),
        "bufferViews": collection_len(gltf.get("bufferViews")),
        "accessors": collection_len(gltf.get("accessors")),
        "primitives": primitive_count,
        "trianglesEstimate": triangle_count,
        "unknownTrianglePrimitives": unknown_triangle_primitives,
    }

    if bounds is None:
        return counts, None

    dimensions = [round(bounds["max"][index] - bounds["min"][index], 6) for index in range(3)]
    return counts, {
        "min": [round(value, 6) for value in bounds["min"]],
        "max": [round(value, 6) for value in bounds["max"]],
        "dimensions": dimensions,
        "maxDimension": round(max(dimensions), 6),
    }


def score_audit(path: Path, counts: dict[str, int], bounds: dict[str, Any] | None) -> tuple[int, str, str, list[str], list[str]]:
    score = 0
    checks: list[str] = []
    issues: list[str] = []
    size_mb = path.stat().st_size / (1024 * 1024)
    triangles = counts["trianglesEstimate"]

    if counts["meshes"] > 0:
        score += 18
        checks.append("mesh present")
    else:
        issues.append("no mesh")

    if counts["materials"] > 0:
        score += 12
        checks.append("material present")
    else:
        issues.append("no material")

    if counts["textures"] > 0 or counts["images"] > 0:
        score += 16
        checks.append("texture present")
    else:
        issues.append("no texture")

    if bounds:
        score += 14
        checks.append("bounds present")
        if bounds["maxDimension"] <= 0:
            issues.append("invalid dimensions")
        elif bounds["maxDimension"] < 0.5:
            issues.append("very small normalized asset")
        elif bounds["maxDimension"] > 80:
            issues.append("very large asset bounds")
    else:
        issues.append("bounds missing")

    if 5_000 <= triangles <= 800_000:
        score += 16
        checks.append("triangle count usable")
    elif triangles > 800_000:
        score += 7
        issues.append("high triangle count")
    elif triangles > 0:
        score += 6
        issues.append("low triangle count")
    else:
        issues.append("triangle count unknown")

    if size_mb <= 8:
        score += 12
        checks.append("runtime size acceptable")
    elif size_mb <= 24:
        score += 6
        issues.append("large runtime asset")
    else:
        issues.append("very large runtime asset")

    if counts["meshes"] == 1 and triangles > 80_000:
        issues.append("single dense mesh; component editing limited")
    elif 2 <= counts["meshes"] <= 450:
        score += 8
        checks.append("mesh count manageable")

    if counts["unknownTrianglePrimitives"]:
        issues.append("non-triangle primitives present")

    score = max(0, min(100, score))
    if score >= 86:
        grade = "A"
    elif score >= 72:
        grade = "B"
    elif score >= 56:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"

    if grade in {"A", "B"} and counts["meshes"] > 1:
        readiness = "component-ready"
    elif grade in {"A", "B", "C"}:
        readiness = "visual-preview"
    elif grade == "D":
        readiness = "research-review"
    else:
        readiness = "blocked"

    return score, grade, readiness, checks, issues


def build_audit(path: Path) -> dict[str, Any]:
    gltf = read_glb_json(path)
    counts, bounds = inspect_geometry(gltf)
    score, grade, readiness, checks, issues = score_audit(path, counts, bounds)
    asset = gltf.get("asset") if isinstance(gltf.get("asset"), dict) else {}

    return {
        "tool": "scripts/audit_glb_asset.py",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceFile": str(path),
        "valid": True,
        "assetVersion": asset.get("version"),
        "assetGenerator": asset.get("generator"),
        "sizeBytes": path.stat().st_size,
        "sizeMb": round(path.stat().st_size / (1024 * 1024), 3),
        "counts": counts,
        "bounds": bounds,
        "extensionsUsed": sorted(gltf.get("extensionsUsed", []) or []),
        "extensionsRequired": sorted(gltf.get("extensionsRequired", []) or []),
        "technicalScore": score,
        "technicalGrade": grade,
        "interactionReadiness": readiness,
        "checks": checks,
        "issues": issues,
    }


def merge_metadata(metadata_path: Path, audit: dict[str, Any]) -> dict[str, Any]:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    quality = metadata.get("quality") if isinstance(metadata.get("quality"), dict) else {}
    counts = audit["counts"]
    is_component = metadata.get("type") == "component" or bool(metadata.get("componentKind"))
    existing_readiness = quality.get("interactionReadiness")
    interaction_readiness = audit["interactionReadiness"]
    if is_component and audit.get("valid") and counts["meshes"] > 0:
        interaction_readiness = "component-ready"
    entity_counts = metadata.get("entityCounts") if isinstance(metadata.get("entityCounts"), dict) else {}
    entity_counts = {
        **entity_counts,
        "GLBMesh": counts["meshes"],
        "GLBPrimitive": counts["primitives"],
        "GLBTriangleEstimate": counts["trianglesEstimate"],
        "GLBMaterial": counts["materials"],
        "GLBTexture": counts["textures"],
    }

    metadata.update(
        {
            "meshCount": counts["meshes"],
            "entityCounts": entity_counts,
            "quality": {
                **quality,
                "assetAudit": audit,
                "technicalGrade": audit["technicalGrade"],
                "technicalScore": audit["technicalScore"],
                "interactionReadiness": interaction_readiness,
                "manualReviewRequired": metadata.get("reviewStatus") != "approved" or bool(audit["issues"]),
            },
        }
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit a GLB and optionally merge technical quality metadata into its sidecar JSON.")
    parser.add_argument("glb", type=Path)
    parser.add_argument("--metadata", type=Path, help="Sidecar JSON to update. Defaults to <glb>.json.")
    parser.add_argument("--output", type=Path, help="Write standalone audit JSON.")
    parser.add_argument("--write", action="store_true", help="Merge audit data into the metadata sidecar.")
    args = parser.parse_args()

    if not args.glb.exists():
        raise SystemExit(f"GLB not found: {args.glb}")

    audit = build_audit(args.glb)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.write:
        metadata_path = args.metadata or args.glb.with_suffix(".json")
        merged = merge_metadata(metadata_path, audit)
        metadata_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
