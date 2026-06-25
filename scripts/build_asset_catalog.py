from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_MODEL_DIR = Path("public/assets/models")
REQUIRED_METADATA_FIELDS = [
    "assetSchemaVersion",
    "id",
    "label",
    "type",
    "format",
    "sourceType",
    "scaleUnit",
    "anchor",
    "tags",
    "placementRules",
    "reviewStatus",
    "license",
]


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"metadataError": f"Invalid JSON: {path}"}


def size_label(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f}MB"
    return f"{max(1, round(size_bytes / 1024))}KB"


def public_model_url(path: Path, model_dir: Path) -> str:
    relative = path.relative_to(model_dir).as_posix()
    return f"/assets/models/{relative}"


def infer_tags(metadata: dict, name: str) -> list[str]:
    tags = set(metadata.get("tags", [])) if isinstance(metadata.get("tags"), list) else set()
    tags.update({"glb", "local-asset"})
    entity_counts = metadata.get("entityCounts", {})
    source = str(metadata.get("source", "")).lower()
    lower_name = name.lower()

    if "ifc" in source or metadata.get("schema"):
        tags.add("ifc-derived")
    if any(key in entity_counts for key in ("IfcRoof", "IfcWall", "IfcWallStandardCase")):
        tags.add("building-shell")
    if any(key in entity_counts for key in ("IfcDoor", "IfcWindow")):
        tags.add("openings")
    if "house" in lower_name or "haus" in lower_name:
        tags.add("detached-house")
    if "basic" in lower_name:
        tags.add("stress-test")

    return sorted(tags)


def public_source_label(metadata: dict) -> str:
    source = str(metadata.get("source", ""))
    if not source:
        return ""
    return source.replace("\\", "/").split("/")[-1]


def performance_profile(size_bytes: int, mesh_count: int, tags: list[str]) -> dict:
    size_mb = size_bytes / (1024 * 1024)
    if size_bytes <= 2 * 1024 * 1024 and mesh_count <= 450:
        tier = "hot"
        load_strategy = "preload-candidate"
        cache_policy = "long-cache"
        max_preview = True
    elif size_bytes <= 8 * 1024 * 1024 and mesh_count <= 900:
        tier = "warm"
        load_strategy = "on-demand"
        cache_policy = "long-cache"
        max_preview = True
    elif size_bytes <= 12 * 1024 * 1024 and mesh_count <= 1200:
        tier = "heavy"
        load_strategy = "on-demand-review"
        cache_policy = "review-cache"
        max_preview = False
    else:
        tier = "deferred"
        load_strategy = "manual-confirm"
        cache_policy = "cold-review"
        max_preview = False

    if "stress-test" in tags:
        tier = "deferred"
        load_strategy = "manual-confirm"
        cache_policy = "cold-review"
        max_preview = False

    return {
        "tier": tier,
        "loadStrategy": load_strategy,
        "cachePolicy": cache_policy,
        "previewAllowedByDefault": max_preview,
        "requiresUserConfirm": not max_preview,
        "compressionRequired": size_bytes > 8 * 1024 * 1024 or mesh_count > 900,
        "thumbnailRequired": True,
        "estimatedDownloadMb": round(size_mb, 2),
        "notes": [
            note for note in [
                "2MB 이하 hot preview 권장" if tier == "hot" else "",
                "온디맨드 로드" if tier in ("warm", "heavy") else "",
                "사용자 확인 후 로드" if tier == "deferred" else "",
                "추가 압축/분할 필요" if size_bytes > 8 * 1024 * 1024 else "",
                "메시 최적화 필요" if mesh_count > 900 else "",
            ] if note
        ],
    }


def compression_profile(asset_id: str, glb_path: Path, model_dir: Path) -> dict:
    optimized_path = model_dir / "optimized" / f"{asset_id}.meshopt.glb"
    original_size = glb_path.stat().st_size
    if not optimized_path.exists():
        return {
            "status": "missing",
            "method": None,
            "runtimeUrl": public_model_url(glb_path, model_dir),
            "originalUrl": public_model_url(glb_path, model_dir),
            "optimizedUrl": None,
            "originalSizeBytes": original_size,
            "optimizedSizeBytes": None,
            "savedBytes": 0,
            "ratio": 1,
            "reductionPercent": 0,
            "usesOptimizedRuntime": False,
        }

    optimized_size = optimized_path.stat().st_size
    is_smaller = optimized_size < original_size
    ratio = optimized_size / original_size if original_size else 1
    return {
        "status": "ready" if is_smaller else "not-smaller",
        "method": "meshopt",
        "runtimeUrl": public_model_url(optimized_path, model_dir) if is_smaller else public_model_url(glb_path, model_dir),
        "originalUrl": public_model_url(glb_path, model_dir),
        "optimizedUrl": public_model_url(optimized_path, model_dir),
        "originalSizeBytes": original_size,
        "optimizedSizeBytes": optimized_size,
        "savedBytes": max(0, original_size - optimized_size),
        "ratio": round(ratio, 4),
        "reductionPercent": round(max(0, 1 - ratio) * 100, 1),
        "usesOptimizedRuntime": is_smaller,
    }


def thumbnail_profile(asset_id: str, model_dir: Path) -> dict:
    thumbnail_path = model_dir / "thumbnails" / f"{asset_id}.png"
    if not thumbnail_path.exists():
        return {
            "status": "missing",
            "url": None,
            "format": "png",
            "sizeBytes": 0,
        }

    return {
        "status": "ready",
        "url": f"/assets/models/thumbnails/{asset_id}.png",
        "format": "png",
        "sizeBytes": thumbnail_path.stat().st_size,
    }


def catalog_item(glb_path: Path, model_dir: Path) -> dict:
    metadata_path = glb_path.with_suffix(".json")
    metadata = read_json(metadata_path)
    stat = glb_path.stat()
    asset_id = glb_path.stem
    missing_fields = [field for field in REQUIRED_METADATA_FIELDS if not metadata.get(field)]
    placement_rules = metadata.get("placementRules", {})
    if not isinstance(placement_rules, dict):
        placement_rules = {}
    tags = infer_tags(metadata, asset_id)
    quality = metadata.get("quality", {}) if isinstance(metadata.get("quality"), dict) else {}
    asset_audit = quality.get("assetAudit", {}) if isinstance(quality.get("assetAudit"), dict) else {}
    audit_counts = asset_audit.get("counts", {}) if isinstance(asset_audit.get("counts"), dict) else {}
    mesh_count = metadata.get("meshCount", 0) or audit_counts.get("meshes", 0)
    entity_counts = metadata.get("entityCounts", {}) if isinstance(metadata.get("entityCounts"), dict) else {}
    compression = compression_profile(asset_id, glb_path, model_dir)
    runtime_size = compression["optimizedSizeBytes"] if compression["usesOptimizedRuntime"] else stat.st_size
    perf = performance_profile(runtime_size, mesh_count, tags)
    thumbnail = thumbnail_profile(asset_id, model_dir)

    return {
        "id": metadata.get("id", asset_id),
        "label": metadata.get("label", asset_id.replace("-", " ").title()),
        "type": metadata.get("type", "unknown"),
        "componentKind": metadata.get("componentKind") or metadata.get("component", {}).get("kind"),
        "bimType": metadata.get("bimType") or metadata.get("component", {}).get("bimType"),
        "format": metadata.get("format", "glb"),
        "sourceType": metadata.get("sourceType", "unknown"),
        "sourceMode": metadata.get("sourceMode", ""),
        "url": compression["runtimeUrl"],
        "originalUrl": compression["originalUrl"],
        "optimizedUrl": compression["optimizedUrl"],
        "metadataUrl": f"/assets/models/{metadata_path.name}" if metadata_path.exists() else None,
        "sizeBytes": runtime_size,
        "sizeLabel": size_label(runtime_size),
        "originalSizeBytes": stat.st_size,
        "originalSizeLabel": size_label(stat.st_size),
        "source": public_source_label(metadata),
        "scaleUnit": metadata.get("scaleUnit", ""),
        "anchor": metadata.get("anchor", ""),
        "compatibleZones": metadata.get("compatibleZones", []),
        "placementRules": {
            **placement_rules,
            "rotatable": bool(placement_rules.get("rotatable", True)),
            "snappable": bool(placement_rules.get("snappable", True)),
            "requiresGround": bool(placement_rules.get("requiresGround", True)),
        },
        "license": metadata.get("license", ""),
        "schema": metadata.get("schema", ""),
        "generationSchema": metadata.get("generationSchema", ""),
        "parcel": metadata.get("parcel", {}),
        "concept": metadata.get("concept", {}),
        "designPreset": metadata.get("designPreset", {}),
        "materialPreset": metadata.get("materialPreset", {}),
        "quality": quality,
        "assetAudit": asset_audit,
        "technicalGrade": quality.get("technicalGrade") or asset_audit.get("technicalGrade"),
        "technicalScore": quality.get("technicalScore") or asset_audit.get("technicalScore"),
        "interactionReadiness": quality.get("interactionReadiness") or asset_audit.get("interactionReadiness"),
        "auditIssues": asset_audit.get("issues", []),
        "auditChecks": asset_audit.get("checks", []),
        "sourceProjectStats": metadata.get("sourceProjectStats", {}),
        "sourceEntities": metadata.get("sourceEntities", []),
        "component": metadata.get("component", {}),
        "meshCount": mesh_count,
        "entityCounts": entity_counts,
        "tags": tags,
        "reviewStatus": metadata.get("reviewStatus", "needs-review"),
        "metadataComplete": not missing_fields,
        "missingMetadataFields": missing_fields,
        "runtimePolicy": perf["loadStrategy"],
        "performance": perf,
        "compression": compression,
        "compressionStatus": compression["status"],
        "compressionMethod": compression["method"],
        "thumbnailUrl": thumbnail["url"],
        "thumbnailStatus": thumbnail["status"],
        "thumbnail": thumbnail,
        "relativePath": str((model_dir / compression["runtimeUrl"].replace("/assets/models/", "")).relative_to(model_dir.parent.parent)).replace("\\", "/"),
    }


def build_catalog(model_dir: Path, output_path: Path) -> dict:
    assets = [
        catalog_item(path, model_dir)
        for path in sorted(model_dir.glob("*.glb"))
    ]

    catalog = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "strategy": "local-first-glb-catalog",
        "assets": assets,
        "counts": {
            "assets": len(assets),
            "needsReview": sum(1 for item in assets if item["reviewStatus"] != "approved"),
            "metadataIncomplete": sum(1 for item in assets if not item["metadataComplete"]),
            "ifcDerived": sum(1 for item in assets if "ifc-derived" in item["tags"]),
            "hotPreview": sum(1 for item in assets if item["performance"]["tier"] == "hot"),
            "requiresCompression": sum(1 for item in assets if item["performance"]["compressionRequired"]),
            "deferred": sum(1 for item in assets if item["performance"]["tier"] == "deferred"),
            "thumbnailReady": sum(1 for item in assets if item["thumbnailStatus"] == "ready"),
            "thumbnailMissing": sum(1 for item in assets if item["thumbnailStatus"] != "ready"),
            "compressionReady": sum(1 for item in assets if item["compressionStatus"] == "ready"),
            "optimizedRuntime": sum(1 for item in assets if item["compression"]["usesOptimizedRuntime"]),
            "originalBytes": sum(item["originalSizeBytes"] for item in assets),
            "runtimeBytes": sum(item["sizeBytes"] for item in assets),
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the PLOT:ON local GLB asset catalog.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    output_path = args.output or args.model_dir / "catalog.json"
    catalog = build_catalog(args.model_dir, output_path)
    print(json.dumps({
        "output": str(output_path),
        "assets": catalog["counts"]["assets"],
        "needsReview": catalog["counts"]["needsReview"],
        "metadataIncomplete": catalog["counts"]["metadataIncomplete"],
        "ifcDerived": catalog["counts"]["ifcDerived"],
        "hotPreview": catalog["counts"]["hotPreview"],
        "requiresCompression": catalog["counts"]["requiresCompression"],
        "deferred": catalog["counts"]["deferred"],
        "thumbnailReady": catalog["counts"]["thumbnailReady"],
        "thumbnailMissing": catalog["counts"]["thumbnailMissing"],
        "compressionReady": catalog["counts"]["compressionReady"],
        "optimizedRuntime": catalog["counts"]["optimizedRuntime"],
        "originalBytes": catalog["counts"]["originalBytes"],
        "runtimeBytes": catalog["counts"]["runtimeBytes"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
