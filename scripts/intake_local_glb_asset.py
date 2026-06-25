from __future__ import annotations

import argparse
import json
import re
import shutil
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
SOURCE_TYPES = {
    "ifc",
    "bim",
    "trellis",
    "trellis2",
    "hunyuan3d",
    "stable-fast-3d",
    "tripo-sr",
    "blender",
    "manual",
    "photogrammetry",
    "ploton-generated",
}
REVIEW_STATUSES = {"needs-review", "approved", "research-only", "blocked"}


def parse_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9가-힣_-]+", "-", value.strip()).strip("-_").lower()
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug:
        raise ValueError("Asset id could not be inferred. Pass --id explicitly.")
    return slug


def read_json(path: Path | None) -> dict:
    if not path:
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid metadata JSON: {path} ({error})") from error


def read_glb_header(path: Path) -> dict:
    with path.open("rb") as file:
        header = file.read(12)
    if len(header) < 12:
        raise ValueError("GLB file is too small to contain a valid header.")
    magic = header[:4]
    version = int.from_bytes(header[4:8], "little")
    declared_length = int.from_bytes(header[8:12], "little")
    if magic != b"glTF":
        raise ValueError("File does not start with the GLB magic bytes 'glTF'.")
    if version != 2:
        raise ValueError(f"Only GLB version 2 is supported. Found version {version}.")
    return {
        "magic": "glTF",
        "version": version,
        "declaredLengthBytes": declared_length,
    }


def default_tags(source_type: str, tags: list[str]) -> list[str]:
    values = set(tags)
    values.update({"glb", "local-asset", "local-intake"})
    if source_type in {"trellis", "trellis2", "hunyuan3d", "stable-fast-3d", "tripo-sr"}:
        values.update({"local-ai-generated", "needs-visual-review"})
    if source_type in {"photogrammetry"}:
        values.update({"photo-derived", "needs-visual-review"})
    if source_type in {"trellis", "trellis2"}:
        values.add("trellis")
    return sorted(values)


def build_metadata(args: argparse.Namespace, source_path: Path, source_size: int, header: dict) -> dict:
    metadata = read_json(args.metadata)
    asset_id = args.asset_id or metadata.get("id") or slugify(args.label or source_path.stem)
    label = args.label or metadata.get("label") or asset_id.replace("-", " ").title()
    source_type = args.source_type or metadata.get("sourceType") or "manual"
    review_status = args.review_status or metadata.get("reviewStatus") or "needs-review"
    if source_type not in SOURCE_TYPES:
        raise ValueError(f"Unsupported sourceType '{source_type}'.")
    if review_status not in REVIEW_STATUSES:
        raise ValueError(f"Unsupported reviewStatus '{review_status}'.")

    placement_rules = metadata.get("placementRules") if isinstance(metadata.get("placementRules"), dict) else {}
    placement_rules = {
        "rotatable": bool(placement_rules.get("rotatable", True)),
        "snappable": bool(placement_rules.get("snappable", True)),
        "requiresGround": bool(placement_rules.get("requiresGround", True)),
        **{key: value for key, value in placement_rules.items() if key not in {"rotatable", "snappable", "requiresGround"}},
    }

    merged = {
        **metadata,
        "assetSchemaVersion": metadata.get("assetSchemaVersion", 1),
        "id": asset_id,
        "label": label,
        "type": args.asset_type or metadata.get("type") or "house-shell",
        "format": "glb",
        "sourceType": source_type,
        "source": args.source_note or metadata.get("source") or source_path.name,
        "scaleUnit": args.scale_unit or metadata.get("scaleUnit") or "meter",
        "anchor": args.anchor or metadata.get("anchor") or "ground-center",
        "tags": default_tags(source_type, parse_csv(args.tags) or metadata.get("tags", [])),
        "compatibleZones": parse_csv(args.compatible_zones) or metadata.get("compatibleZones", []),
        "placementRules": placement_rules,
        "reviewStatus": review_status,
        "license": args.license or metadata.get("license") or "source-review-required",
        "meshCount": metadata.get("meshCount", 0),
        "entityCounts": metadata.get("entityCounts", {}),
        "quality": {
            **(metadata.get("quality") if isinstance(metadata.get("quality"), dict) else {}),
            "limitation": "Local intake asset for exterior concept preview only. It does not guarantee permit, structure, or construction feasibility.",
        },
        "intake": {
            "status": "staged",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sourceFileName": source_path.name,
            "sourcePath": str(source_path),
            "sourceSizeBytes": source_size,
            "glbHeader": header,
            "visualReviewRequired": review_status != "approved",
            "recommendedNextCommands": [
                f"npm run assets:optimize -- --only {asset_id}",
                f"npm run assets:thumbnails -- --only {asset_id}",
                "npm run assets:catalog",
            ],
        },
    }

    missing = [field for field in REQUIRED_METADATA_FIELDS if not merged.get(field)]
    if missing:
        raise ValueError(f"Metadata is missing required fields: {', '.join(missing)}")
    return merged


def intake_asset(args: argparse.Namespace) -> dict:
    source_path = args.source_glb.resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"Source GLB not found: {source_path}")
    if source_path.suffix.lower() != ".glb":
        raise ValueError("Source asset must be a .glb file.")

    header = read_glb_header(source_path)
    source_size = source_path.stat().st_size
    metadata = build_metadata(args, source_path, source_size, header)
    asset_id = metadata["id"]
    model_dir = args.model_dir.resolve()
    output_glb = model_dir / f"{asset_id}.glb"
    output_json = model_dir / f"{asset_id}.json"

    if not args.overwrite and (output_glb.exists() or output_json.exists()):
        raise FileExistsError(f"Asset id '{asset_id}' already exists. Pass --overwrite to replace it.")

    result = {
        "id": asset_id,
        "label": metadata["label"],
        "source": str(source_path),
        "outputGlb": str(output_glb),
        "outputJson": str(output_json),
        "sourceSizeBytes": source_size,
        "reviewStatus": metadata["reviewStatus"],
        "sourceType": metadata["sourceType"],
        "dryRun": args.dry_run,
        "nextCommands": metadata["intake"]["recommendedNextCommands"],
    }

    if args.dry_run:
        result["metadataPreview"] = metadata
        return result

    model_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, output_glb)
    output_json.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage a local GLB as a PLOT:ON runtime asset.")
    parser.add_argument("source_glb", type=Path)
    parser.add_argument("--metadata", type=Path, help="Optional metadata JSON to merge before writing the sidecar.")
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--id", dest="asset_id")
    parser.add_argument("--label")
    parser.add_argument("--type", dest="asset_type")
    parser.add_argument("--source-type", choices=sorted(SOURCE_TYPES))
    parser.add_argument("--source-note")
    parser.add_argument("--tags", help="Comma-separated style/recommendation tags.")
    parser.add_argument("--compatible-zones", help="Comma-separated Korean land-use zone labels.")
    parser.add_argument("--license")
    parser.add_argument("--review-status", choices=sorted(REVIEW_STATUSES))
    parser.add_argument("--scale-unit")
    parser.add_argument("--anchor")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    result = intake_asset(args)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
