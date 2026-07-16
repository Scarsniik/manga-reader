#!/usr/bin/env python3
"""Benchmark the OCR worker against annotations already stored in the manga library."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import statistics
import subprocess
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any


OCR_FILE_NAME = ".manga-helper.ocr.json"
DEFAULT_MANUAL_PAGE_COUNT = 24
DETECTION_OVERLAP_THRESHOLD = 0.50

def parse_args() -> argparse.Namespace:
    local_app_data = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library-file", type=Path, default=(
        local_app_data / "scaramanga-userdata/data/mangas.json"
    ))
    parser.add_argument("--runtime-root", type=Path, default=(
        local_app_data / "Manga Helper/ocr-runtime"
    ))
    parser.add_argument("--worker-script", type=Path, default=Path(__file__).with_name("ocr_worker.py"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--manual-pages", type=int, default=DEFAULT_MANUAL_PAGE_COUNT)
    parser.add_argument("--pass-profile", choices=("standard", "heavy"), default="standard")
    parser.add_argument("--force-cpu", action="store_true")
    parser.add_argument("--runtime-child", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args()

def run_with_runtime_python(args: argparse.Namespace) -> None:
    runtime_python = args.runtime_root / "python/python.exe"
    if args.runtime_child or not runtime_python.is_file():
        return

    command = [str(runtime_python), str(Path(__file__).resolve()), *sys.argv[1:], "--runtime-child"]
    raise SystemExit(subprocess.call(command, cwd=Path.cwd()))

def configure_runtime_environment(args: argparse.Namespace) -> None:
    python_home = args.runtime_root / "python"
    site_packages = python_home / "Lib/site-packages"
    path_entries = [
        python_home,
        python_home / "DLLs",
        site_packages,
        site_packages / "torch/lib",
        site_packages / "numpy.libs",
        site_packages / "PIL.libs",
        site_packages / "pillow.libs",
        site_packages / "opencv_python.libs",
    ]
    existing_path_entries = [str(entry) for entry in path_entries if entry.exists()]

    os.environ.update({
        "PYTHONHOME": str(python_home),
        "PYTHONNOUSERSITE": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        "MANGA_HELPER_OCR_CANDIDATE_ROOTS": str(args.runtime_root / "repos"),
        "MANGA_HELPER_OCR_CACHE_ROOT": str(args.runtime_root / "cache/manga-ocr"),
        "MANGA_HELPER_OCR_MODEL": str(args.runtime_root / "models/manga-ocr-base"),
        "MANGA_HELPER_OCR_FORCE_CPU": "1" if args.force_cpu else "0",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_HUB_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
    })
    os.environ["PYTHONPATH"] = os.pathsep.join([
        str(python_home / "Lib"),
        str(site_packages),
        os.environ.get("PYTHONPATH", ""),
    ])
    os.environ["PATH"] = os.pathsep.join([
        *existing_path_entries,
        os.environ.get("PATH", ""),
    ])


def load_worker(worker_script: Path):
    spec = importlib.util.spec_from_file_location("manga_helper_ocr_worker", worker_script.resolve())
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import OCR worker from {worker_script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def load_json(file_path: Path) -> Any:
    return json.loads(file_path.read_text(encoding="utf-8-sig"))


def is_valid_bbox(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if not all(math.isfinite(float(value.get(key, math.nan))) for key in ("x", "y", "w", "h")):
        return False
    return float(value["w"]) > 0 and float(value["h"]) > 0


def build_annotation(kind: str, source: dict[str, Any]) -> dict[str, Any] | None:
    bbox = source.get("bbox")
    if not is_valid_bbox(bbox):
        return None
    return {
        "kind": kind,
        "bbox": {key: float(bbox[key]) for key in ("x", "y", "w", "h")},
        "text": str(source.get("text") or "") if kind == "edited" else None,
        "sourceId": str(source.get("id") or ""),
    }

def collect_annotated_pages(library_file: Path) -> list[dict[str, Any]]:
    library = load_json(library_file)
    mangas = library if isinstance(library, list) else library.get("mangas", [])
    pages_by_image: dict[str, dict[str, Any]] = {}

    for manga in mangas:
        manga_path = Path(str(manga.get("path") or ""))
        ocr_file_path = manga_path / OCR_FILE_NAME
        if not ocr_file_path.is_file():
            continue
        try:
            ocr_file = load_json(ocr_file_path)
        except (OSError, ValueError):
            continue

        for page in (ocr_file.get("pages") or {}).values():
            image_path = Path(str(page.get("imagePath") or ""))
            if not image_path.is_file():
                continue

            annotations = []
            for block in page.get("blocks") or []:
                if block and block.get("textEditedAt"):
                    annotation = build_annotation("edited", block)
                    if annotation:
                        annotations.append(annotation)
            for manual_box in page.get("manualBoxes") or []:
                if manual_box:
                    annotation = build_annotation("manual", manual_box)
                    if annotation:
                        annotations.append(annotation)
                    if manual_box.get("textEditedAt"):
                        edited_annotation = build_annotation("edited", manual_box)
                        if edited_annotation:
                            annotations.append(edited_annotation)
            if not annotations:
                continue

            image_key = str(image_path.resolve()).casefold()
            target = pages_by_image.setdefault(image_key, {
                "imagePath": str(image_path.resolve()),
                "mangaTitle": str(manga.get("title") or manga_path.name),
                "pageNumber": int(page.get("pageNumber") or 0),
                "annotations": [],
            })
            target["annotations"].extend(annotations)

    return list(pages_by_image.values())


def select_pages(pages: list[dict[str, Any]], manual_page_count: int) -> list[dict[str, Any]]:
    edited_pages = [page for page in pages if any(item["kind"] == "edited" for item in page["annotations"])]
    edited_paths = {page["imagePath"].casefold() for page in edited_pages}
    manual_only = [
        page
        for page in pages
        if page["imagePath"].casefold() not in edited_paths
        and any(item["kind"] == "manual" for item in page["annotations"])
    ]
    manual_only.sort(key=lambda page: hashlib.sha1(page["imagePath"].encode("utf-8")).hexdigest())
    if manual_page_count >= 0:
        manual_only = manual_only[:manual_page_count]
    return sorted([*edited_pages, *manual_only], key=lambda page: page["imagePath"].casefold())

def load_baseline_pages(baseline_path: Path) -> list[dict[str, Any]]:
    baseline = load_json(baseline_path)
    return [
        {
            "imagePath": page["imagePath"],
            "mangaTitle": page.get("mangaTitle", ""),
            "pageNumber": int(page.get("pageNumber") or 0),
            "annotations": page.get("annotations") or [],
        }
        for page in baseline.get("pages") or []
    ]


def box_coordinates(bbox: dict[str, float]) -> tuple[float, float, float, float]:
    x1 = float(bbox["x"])
    y1 = float(bbox["y"])
    return x1, y1, x1 + float(bbox["w"]), y1 + float(bbox["h"])


def overlap_on_smaller(left: dict[str, float], right: dict[str, float]) -> float:
    lx1, ly1, lx2, ly2 = box_coordinates(left)
    rx1, ry1, rx2, ry2 = box_coordinates(right)
    intersection_width = max(0.0, min(lx2, rx2) - max(lx1, rx1))
    intersection_height = max(0.0, min(ly2, ry2) - max(ly1, ry1))
    intersection = intersection_width * intersection_height
    left_area = max(1e-9, (lx2 - lx1) * (ly2 - ly1))
    right_area = max(1e-9, (rx2 - rx1) * (ry2 - ry1))
    return intersection / min(left_area, right_area)


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    return "".join(character for character in normalized if not character.isspace())


def levenshtein_distance(left: str, right: str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(min(
                current[-1] + 1,
                previous[right_index] + 1,
                previous[right_index - 1] + (left_character != right_character),
            ))
        previous = current
    return previous[-1]


def normalize_blocks(raw_result: dict[str, Any]) -> list[dict[str, Any]]:
    width = max(1.0, float(raw_result.get("img_width") or 0))
    height = max(1.0, float(raw_result.get("img_height") or 0))
    blocks = []
    for block in raw_result.get("blocks") or []:
        box = block.get("box") or [0, 0, 0, 0]
        if len(box) < 4:
            continue
        blocks.append({
            "bbox": {
                "x": float(box[0]) / width,
                "y": float(box[1]) / height,
                "w": max(0.0, float(box[2]) - float(box[0])) / width,
                "h": max(0.0, float(box[3]) - float(box[1])) / height,
            },
            "text": "".join(str(line or "") for line in block.get("lines") or []),
            "vertical": bool(block.get("vertical")),
        })
    return blocks


def evaluate_annotations(annotations: list[dict[str, Any]], blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evaluations = []
    for annotation in annotations:
        matches = [
            (overlap_on_smaller(annotation["bbox"], block["bbox"]), block)
            for block in blocks
        ]
        best_overlap, best_block = max(matches, default=(0.0, None), key=lambda item: item[0])
        detected = best_overlap >= DETECTION_OVERLAP_THRESHOLD
        evaluation = {
            **annotation,
            "detected": detected,
            "bestOverlap": round(best_overlap, 6),
            "recognizedText": best_block["text"] if detected and best_block else None,
        }
        if annotation["kind"] == "edited":
            expected = normalize_text(annotation.get("text") or "")
            actual = normalize_text(evaluation.get("recognizedText") or "")
            evaluation["expectedChars"] = len(expected)
            evaluation["editDistance"] = levenshtein_distance(expected, actual)
            evaluation["exact"] = detected and expected == actual
        evaluations.append(evaluation)
    return evaluations


def percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * ratio) - 1))
    return ordered[index]


def build_summary(pages: list[dict[str, Any]]) -> dict[str, Any]:
    annotations = [item for page in pages for item in page["evaluations"]]
    manual = [item for item in annotations if item["kind"] == "manual"]
    edited = [item for item in annotations if item["kind"] == "edited"]
    durations = [float(page["profile"].get("duration_ms") or 0) for page in pages]
    expected_chars = sum(int(item.get("expectedChars") or 0) for item in edited)
    edit_distance = sum(int(item.get("editDistance") or 0) for item in edited)

    def detection_recall(items: list[dict[str, Any]]) -> float:
        return sum(bool(item["detected"]) for item in items) / len(items) if items else 0.0

    return {
        "pageCount": len(pages),
        "annotationCount": len(annotations),
        "manualAnnotationCount": len(manual),
        "editedAnnotationCount": len(edited),
        "manualDetectionRecall": detection_recall(manual),
        "editedDetectionRecall": detection_recall(edited),
        "editedCharacterErrorRate": edit_distance / expected_chars if expected_chars else 0.0,
        "editedExactRate": sum(bool(item.get("exact")) for item in edited) / len(edited) if edited else 0.0,
        "totalDurationMs": sum(durations),
        "meanDurationMs": statistics.fmean(durations) if durations else 0.0,
        "medianDurationMs": statistics.median(durations) if durations else 0.0,
        "p90DurationMs": percentile(durations, 0.90),
        "meanBlockCount": statistics.fmean(page["blockCount"] for page in pages) if pages else 0.0,
        "meanMocrCalls": statistics.fmean(
            float(page["profile"].get("mocr", {}).get("calls") or 0) for page in pages
        ) if pages else 0.0,
        "meanDetectorCalls": statistics.fmean(
            float(page["profile"].get("text_detector", {}).get("calls") or 0) for page in pages
        ) if pages else 0.0,
    }


def build_comparison(baseline_path: Path, candidate_summary: dict[str, Any]) -> dict[str, Any]:
    baseline_summary = load_json(baseline_path).get("summary") or {}
    keys = (
        "manualDetectionRecall",
        "editedDetectionRecall",
        "editedCharacterErrorRate",
        "editedExactRate",
        "meanDurationMs",
        "medianDurationMs",
        "p90DurationMs",
        "meanBlockCount",
        "meanMocrCalls",
        "meanDetectorCalls",
    )
    return {
        key: {
            "baseline": baseline_summary.get(key),
            "candidate": candidate_summary.get(key),
            "delta": float(candidate_summary.get(key) or 0) - float(baseline_summary.get(key) or 0),
        }
        for key in keys
    }


def main() -> None:
    args = parse_args()
    run_with_runtime_python(args)
    configure_runtime_environment(args)
    worker = load_worker(args.worker_script)
    selected_pages = load_baseline_pages(args.baseline) if args.baseline else select_pages(
        collect_annotated_pages(args.library_file),
        args.manual_pages,
    )
    if not selected_pages:
        raise RuntimeError("No accessible OCR annotations were found")

    output_pages = []
    benchmark_started = time.perf_counter()
    worker.build_engine()
    for index, page in enumerate(selected_pages, start=1):
        print(f"[{index}/{len(selected_pages)}] {page['mangaTitle']} - page {page['pageNumber']}", file=sys.stderr)
        profile = worker.create_empty_page_profile()
        raw_result = worker.recognize_with_metadata(
            page["imagePath"],
            profile=profile,
            pass_profile=args.pass_profile,
        )
        blocks = normalize_blocks(raw_result)
        output_pages.append({
            **page,
            "evaluations": evaluate_annotations(page["annotations"], blocks),
            "blocks": blocks,
            "blockCount": len(blocks),
            "profile": profile,
        })

    summary = build_summary(output_pages)
    output = {
        "version": "manga-helper-ocr-benchmark-v1",
        "workerScript": str(args.worker_script.resolve()),
        "passProfile": args.pass_profile,
        "forceCpu": args.force_cpu,
        "wallDurationMs": round((time.perf_counter() - benchmark_started) * 1000.0, 3),
        "summary": summary,
        "pages": output_pages,
    }
    if args.baseline:
        output["comparison"] = build_comparison(args.baseline, summary)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": summary, "comparison": output.get("comparison")}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
