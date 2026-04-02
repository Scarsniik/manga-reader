#!/usr/bin/env python3
import copy
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any, Iterable


ENGINE = None

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def bool_from_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def iter_candidate_roots() -> Iterable[Path]:
    raw = os.environ.get("MANGA_HELPER_OCR_CANDIDATE_ROOTS", "")
    for chunk in raw.split(os.pathsep):
        chunk = chunk.strip()
        if not chunk:
            continue
        yield Path(chunk).expanduser()


def expand_candidate_paths(root: Path) -> Iterable[Path]:
    yield root

    candidate_children = (
        "mokuro-upstream",
        "manga-ocr-upstream",
        "mokuro-master",
        "manga-ocr-master",
    )

    for child in candidate_children:
        yield root / child


def configure_python_path() -> list[str]:
    added = []
    seen = set()

    for root in iter_candidate_roots():
        for candidate in expand_candidate_paths(root):
            try:
                resolved = candidate.resolve()
            except OSError:
                resolved = candidate

            key = str(resolved)
            if key in seen:
                continue
            seen.add(key)

            if not resolved.is_dir():
                continue

            if str(resolved) not in sys.path:
                sys.path.insert(0, str(resolved))
            added.append(str(resolved))

    return added


ADDED_PATHS = configure_python_path()


def configure_runtime_overrides():
    cache_root_raw = os.environ.get("MANGA_HELPER_OCR_CACHE_ROOT", "").strip()
    detector_cache_root = None

    if cache_root_raw:
        detector_cache_root = Path(cache_root_raw).expanduser()
        detector_cache_root.mkdir(parents=True, exist_ok=True)

        from mokuro.cache import cache as mokuro_cache

        mokuro_cache.root = detector_cache_root

    return detector_cache_root


def build_engine():
    global ENGINE

    if ENGINE is not None:
        return ENGINE

    detector_cache_root = configure_runtime_overrides()
    from mokuro.manga_page_ocr import MangaPageOcr

    pretrained_model_name_or_path = os.environ.get("MANGA_HELPER_OCR_MODEL", "kha-white/manga-ocr-base")
    force_cpu = bool_from_env("MANGA_HELPER_OCR_FORCE_CPU", default=False)

    if detector_cache_root is not None:
        detector_model_path = detector_cache_root / "comictextdetector.pt"
        if not detector_model_path.is_file():
            raise FileNotFoundError(
                f"Bundled comic text detector model missing: {detector_model_path}"
            )

    model_path = Path(pretrained_model_name_or_path).expanduser()
    if pretrained_model_name_or_path and model_path.exists():
        pretrained_model_name_or_path = str(model_path)

    ENGINE = MangaPageOcr(
        pretrained_model_name_or_path=pretrained_model_name_or_path,
        force_cpu=force_cpu,
    )
    return ENGINE


def normalize_pass_profile(value: Any) -> str:
    return "heavy" if str(value or "").strip().lower() == "heavy" else "standard"


def is_heavy_pass_profile(pass_profile: str) -> bool:
    return normalize_pass_profile(pass_profile) == "heavy"


def elapsed_ms(start_time: float) -> float:
    return round((time.perf_counter() - start_time) * 1000.0, 3)


def increment_counter(counter: dict[str, float], key: str, amount: float = 1.0) -> None:
    if not key:
        return
    counter[key] = float(counter.get(key, 0.0) or 0.0) + float(amount)


def create_empty_page_profile() -> dict[str, Any]:
    return {
        "version": "manga-ocr-profile-v1",
        "duration_ms": 0.0,
        "text_detector": {
            "calls": 0,
            "total_ms": 0.0,
        },
        "mocr": {
            "calls": 0,
            "total_ms": 0.0,
        },
        "line_variants": {
            "chunks_total": 0,
            "variant_triggered_chunks": 0,
            "variant_skipped_chunks": 0,
            "selected_total": {},
            "selected_when_triggered": {},
            "candidate_evaluations": {},
            "improved_selections": 0,
            "score_gain_total": 0.0,
        },
        "truncated_refine": {
            "calls": 0,
            "accepted": 0,
        },
        "passes": [],
        "final_blocks": {
            "count": 0,
            "by_origin": {},
        },
    }


def build_pass_profile_entry(kind: str, name: str, duration_ms: float, blocks_detected: int) -> dict[str, Any]:
    return {
        "kind": kind,
        "name": name,
        "duration_ms": duration_ms,
        "blocks_detected": blocks_detected,
        "candidate_count": 0,
        "accepted_candidates": 0,
        "added_candidates": 0,
        "replaced_candidates": 0,
        "replaced_blocks": 0,
        "skipped_candidates": 0,
        "final_blocks": 0,
    }


def build_merge_stats(candidate_count: int) -> dict[str, int]:
    return {
        "candidate_count": candidate_count,
        "accepted_candidates": 0,
        "added_candidates": 0,
        "replaced_candidates": 0,
        "replaced_blocks": 0,
        "skipped_candidates": 0,
        "final_blocks": 0,
    }


def merge_pass_profile_entry(pass_entry: dict[str, Any], stats: dict[str, int], final_blocks: int) -> None:
    pass_entry["candidate_count"] = int(pass_entry.get("candidate_count", 0)) + int(stats.get("candidate_count", 0))
    pass_entry["accepted_candidates"] = int(pass_entry.get("accepted_candidates", 0)) + int(stats.get("accepted_candidates", 0))
    pass_entry["added_candidates"] = int(pass_entry.get("added_candidates", 0)) + int(stats.get("added_candidates", 0))
    pass_entry["replaced_candidates"] = int(pass_entry.get("replaced_candidates", 0)) + int(stats.get("replaced_candidates", 0))
    pass_entry["replaced_blocks"] = int(pass_entry.get("replaced_blocks", 0)) + int(stats.get("replaced_blocks", 0))
    pass_entry["skipped_candidates"] = int(pass_entry.get("skipped_candidates", 0)) + int(stats.get("skipped_candidates", 0))
    pass_entry["final_blocks"] = int(final_blocks)


def collect_final_block_origins(blocks) -> dict[str, float]:
    origins: dict[str, float] = {}

    for block in blocks:
        origin = str(block.get("_profile_origin") or "unknown")
        increment_counter(origins, origin, 1.0)

    return origins


def strip_profile_metadata(blocks) -> None:
    for block in blocks:
        block.pop("_profile_origin", None)


def safe_float(value: Any):
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def safe_bbox_mask_score(mask_refined, xyxy):
    try:
        x1, y1, x2, y2 = [int(v) for v in xyxy]
        if x2 <= x1 or y2 <= y1:
            return None
        block_mask = mask_refined[y1:y2, x1:x2]
        if block_mask is None or getattr(block_mask, "size", 0) == 0:
            return None
        return float(block_mask.mean() / 255.0)
    except Exception:
        return None


def safe_aspect_ratio(blk):
    try:
        return float(blk.aspect_ratio())
    except Exception:
        return None


def count_meaningful_chars(text: str) -> int:
    return sum(1 for ch in text if ch.isalnum() or "\u3040" <= ch <= "\u9fff")


def normalize_compare_text(text: str) -> str:
    return "".join(ch for ch in text if ch.isalnum() or "\u3040" <= ch <= "\u9fff")


def count_japanese_chars(text: str) -> int:
    return sum(
        1
        for ch in text
        if ("\u3040" <= ch <= "\u30ff") or ("\u3400" <= ch <= "\u9fff")
    )


def count_latin_chars(text: str) -> int:
    return sum(1 for ch in text if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))


def has_suspicious_repeated_char_run(text: str) -> bool:
    if not text:
        return False

    last_char = None
    run_length = 0
    for char in text:
        if char == last_char:
            run_length += 1
            if run_length >= 6:
                return True
        else:
            last_char = char
            run_length = 1

    return False


def score_text_quality(text: str) -> float:
    compact = "".join(ch for ch in text if not ch.isspace())
    if not compact:
        return -100.0

    meaningful = count_meaningful_chars(compact)
    japanese = count_japanese_chars(compact)
    latin = count_latin_chars(compact)
    punctuation = max(0, len(compact) - meaningful)

    score = (
        meaningful * 2.0
        + japanese * 1.35
        + min(latin, meaningful) * 0.4
        - punctuation * 1.15
    )

    if meaningful == 0:
        score -= 20.0
    if len(compact) <= 2:
        score -= 6.0
    if has_suspicious_repeated_char_run(compact):
        score -= 10.0

    return score


def score_raw_result(result: dict[str, Any]) -> float:
    blocks = result.get("blocks") or []
    if not blocks:
        return -100.0

    score = 0.0
    for block in blocks:
        for line in block.get("lines") or []:
            score += score_text_quality(str(line or ""))

    if len(blocks) > 2:
        score -= (len(blocks) - 2) * 1.25

    return score


def compact_text(text: str) -> str:
    return "".join(ch for ch in text if not ch.isspace())


def score_block_candidate(block: dict[str, Any]) -> float:
    text = "".join(str(line or "") for line in (block.get("lines") or []))
    compact = compact_text(text)
    if not compact:
        return -100.0

    meaningful = count_meaningful_chars(compact)
    japanese = count_japanese_chars(compact)
    latin = count_latin_chars(compact)
    punctuation = max(0, len(compact) - meaningful)
    line_count = len([line for line in (block.get("lines") or []) if str(line or "").strip()])
    mask_score = safe_float(block.get("mask_score"))

    score = (
        japanese * 2.8
        + max(meaningful - japanese, 0) * 1.1
        + line_count * 3.5
        - latin * 1.8
        - punctuation * 1.3
    )

    if japanese > 0 and latin > 0:
        score -= min(japanese, latin) * 1.15
    if japanese == 0 and latin > 0:
        score -= 6.0
    if mask_score is not None:
        score += mask_score * 8.0

    return score


def block_box_tuple(block: dict[str, Any]):
    box = block.get("box") or [0, 0, 0, 0]
    return tuple(int(v) for v in box[:4])


def box_overlap_metrics(left_box, right_box):
    lx1, ly1, lx2, ly2 = left_box
    rx1, ry1, rx2, ry2 = right_box

    ix1 = max(lx1, rx1)
    iy1 = max(ly1, ry1)
    ix2 = min(lx2, rx2)
    iy2 = min(ly2, ry2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0, 0.0

    intersection = float((ix2 - ix1) * (iy2 - iy1))
    left_area = max(1.0, float((lx2 - lx1) * (ly2 - ly1)))
    right_area = max(1.0, float((rx2 - rx1) * (ry2 - ry1)))
    union = max(1.0, left_area + right_area - intersection)
    return intersection / min(left_area, right_area), intersection / union


def estimate_page_colorfulness(img) -> float:
    import numpy as np

    if img.ndim < 3 or img.shape[2] < 3:
        return 0.0

    return float(np.std(img.astype(np.float32), axis=2).mean() / 255.0)


def build_line_crop_variants(line_crop, pass_profile: str = "standard"):
    import cv2

    if line_crop.ndim == 2:
        gray = line_crop
    else:
        gray = cv2.cvtColor(line_crop, cv2.COLOR_RGB2GRAY)

    normalized = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    adaptive = cv2.adaptiveThreshold(
        normalized,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )
    adaptive_inv = cv2.bitwise_not(adaptive)

    variants = [
        ("orig", line_crop if line_crop.ndim == 3 else cv2.cvtColor(line_crop, cv2.COLOR_GRAY2RGB)),
        ("adaptive_inv", cv2.cvtColor(adaptive_inv, cv2.COLOR_GRAY2RGB)),
    ]

    if is_heavy_pass_profile(pass_profile):
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
        variants.insert(1, ("clahe", cv2.cvtColor(clahe, cv2.COLOR_GRAY2RGB)))

    return variants


def should_try_line_variants(blk, line_crop, baseline_text: str) -> bool:
    font_size = safe_float(getattr(blk, "font_size", None)) or 0.0
    baseline_score = score_text_quality(baseline_text)
    height, width = line_crop.shape[:2]
    crop_ratio = (max(height, width) / max(1, min(height, width)))

    if baseline_score < 18.0:
        return True
    if getattr(blk, "vertical", False) and font_size <= 32:
        return True
    if getattr(blk, "vertical", False) and crop_ratio >= 2.2:
        return True
    return False


def recognize_line_crop_best(engine, blk, line_crop, profile=None, pass_profile: str = "standard"):
    from PIL import Image

    line_profile = profile.get("line_variants") if isinstance(profile, dict) else None
    baseline_text = engine.mocr(Image.fromarray(line_crop))
    baseline_score = score_text_quality(baseline_text)

    if line_profile is not None:
        line_profile["chunks_total"] = int(line_profile.get("chunks_total", 0)) + 1
        increment_counter(line_profile["candidate_evaluations"], "orig", 1.0)

    if not should_try_line_variants(blk, line_crop, baseline_text):
        if line_profile is not None:
            line_profile["variant_skipped_chunks"] = int(line_profile.get("variant_skipped_chunks", 0)) + 1
            increment_counter(line_profile["selected_total"], "orig", 1.0)
        return baseline_text

    if line_profile is not None:
        line_profile["variant_triggered_chunks"] = int(line_profile.get("variant_triggered_chunks", 0)) + 1

    best_name = "orig"
    best_text = baseline_text
    best_score = baseline_score

    for variant_name, variant_img in build_line_crop_variants(line_crop, pass_profile=pass_profile)[1:]:
        candidate_text = engine.mocr(Image.fromarray(variant_img))
        candidate_score = score_text_quality(candidate_text)
        if line_profile is not None:
            increment_counter(line_profile["candidate_evaluations"], variant_name, 1.0)
        if candidate_score > best_score + 0.75:
            best_name = variant_name
            best_text = candidate_text
            best_score = candidate_score

    if line_profile is not None:
        increment_counter(line_profile["selected_total"], best_name, 1.0)
        increment_counter(line_profile["selected_when_triggered"], best_name, 1.0)
        if best_name != "orig" and best_score > baseline_score:
            line_profile["improved_selections"] = int(line_profile.get("improved_selections", 0)) + 1
            line_profile["score_gain_total"] = float(line_profile.get("score_gain_total", 0.0)) + float(best_score - baseline_score)

    return best_text


def line_axis_and_edges(line_poly, vertical: bool):
    import numpy as np

    poly = np.array(line_poly, dtype=np.float32)
    if vertical:
        start_mid = (poly[0] + poly[1]) / 2.0
        end_mid = (poly[3] + poly[2]) / 2.0
        start_edge = (0, 1)
        end_edge = (3, 2)
    else:
        start_mid = (poly[0] + poly[3]) / 2.0
        end_mid = (poly[1] + poly[2]) / 2.0
        start_edge = (0, 3)
        end_edge = (1, 2)

    axis = end_mid - start_mid
    norm = float((axis[0] ** 2 + axis[1] ** 2) ** 0.5)
    if norm <= 1e-6:
        return None, None, None
    axis_u = axis / norm
    return poly, axis_u, (start_edge, end_edge)


def polygon_mask_mean(mask, polygon) -> float:
    import cv2
    import numpy as np

    poly = np.array(polygon, dtype=np.int32)
    min_xy = poly.min(axis=0)
    max_xy = poly.max(axis=0)
    x1, y1 = int(min_xy[0]), int(min_xy[1])
    x2, y2 = int(max_xy[0]), int(max_xy[1])

    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(mask.shape[1] - 1, x2)
    y2 = min(mask.shape[0] - 1, y2)
    if x2 < x1 or y2 < y1:
        return 0.0

    roi = mask[y1:y2 + 1, x1:x2 + 1]
    canvas = np.zeros(roi.shape[:2], dtype=np.uint8)
    shifted = (poly - np.array([x1, y1])).astype(np.int32)
    cv2.fillPoly(canvas, [shifted], 255)
    values = roi[canvas > 0]
    return float(values.mean() / 255.0) if values.size else 0.0


def clip_polygon_to_image(polygon, width: int, height: int):
    import numpy as np

    poly = np.array(polygon, dtype=np.float32)
    poly[:, 0] = np.clip(poly[:, 0], 0, width - 1)
    poly[:, 1] = np.clip(poly[:, 1], 0, height - 1)
    return poly


def extend_line_with_mask(mask_refined, line_poly, font_size: float, vertical: bool, image_shape):
    import numpy as np

    if font_size <= 0:
        return None

    poly, axis_u, edges = line_axis_and_edges(line_poly, vertical)
    if poly is None or axis_u is None or edges is None:
        return None

    start_edge, end_edge = edges
    height, width = image_shape[:2]
    step = max(12.0, float(font_size) * 0.35)
    threshold = 0.10
    max_steps = 8
    extended = poly.copy()
    total_start_extension = 0.0
    total_end_extension = 0.0

    for _ in range(max_steps):
        candidate = extended.copy()
        candidate[start_edge[0]] = candidate[start_edge[0]] - axis_u * step
        candidate[start_edge[1]] = candidate[start_edge[1]] - axis_u * step
        candidate = clip_polygon_to_image(candidate, width, height)
        strip = np.array([
            candidate[start_edge[0]],
            candidate[start_edge[1]],
            extended[start_edge[1]],
            extended[start_edge[0]],
        ], dtype=np.float32)
        if polygon_mask_mean(mask_refined, strip) < threshold:
            break
        extended = candidate
        total_start_extension += step

    for _ in range(max_steps):
        candidate = extended.copy()
        candidate[end_edge[0]] = candidate[end_edge[0]] + axis_u * step
        candidate[end_edge[1]] = candidate[end_edge[1]] + axis_u * step
        candidate = clip_polygon_to_image(candidate, width, height)
        strip = np.array([
            extended[end_edge[0]],
            extended[end_edge[1]],
            candidate[end_edge[1]],
            candidate[end_edge[0]],
        ], dtype=np.float32)
        if polygon_mask_mean(mask_refined, strip) < threshold:
            break
        extended = candidate
        total_end_extension += step

    if total_start_extension <= 0 and total_end_extension <= 0:
        return None

    return extended.astype(np.int32).tolist()


def recognize_block_lines(engine, img, mask_refined, blk, profile=None, pass_profile: str = "standard"):
    import cv2

    lines_coords = []
    lines_text = []

    for line_idx, line in enumerate(blk.lines_array()):
        max_ratio = engine.max_ratio_vert if blk.vertical else engine.max_ratio_hor
        line_crops, _cut_points = engine.split_into_chunks(
            img,
            mask_refined,
            blk,
            line_idx,
            textheight=engine.text_height,
            max_ratio=max_ratio,
            anchor_window=engine.anchor_window,
        )

        line_text = ""
        for line_crop in line_crops:
            if blk.vertical:
                line_crop = cv2.rotate(line_crop, cv2.ROTATE_90_CLOCKWISE)
            line_text += recognize_line_crop_best(engine, blk, line_crop, profile=profile, pass_profile=pass_profile)

        lines_coords.append(line.tolist())
        lines_text.append(line_text)

    return lines_coords, lines_text


def maybe_refine_truncated_large_block(engine, img, mask_refined, blk, original_lines, profile=None, pass_profile: str = "standard"):
    if len(getattr(blk, "lines", [])) != 1:
        return None

    font_size = safe_float(getattr(blk, "font_size", None))
    if font_size is None or font_size < 72:
        return None

    original_text = "".join(original_lines)
    original_norm = normalize_compare_text(original_text)
    if not original_norm:
        return None

    extended_line = extend_line_with_mask(
        mask_refined,
        blk.lines[0],
        font_size,
        bool(getattr(blk, "vertical", False)),
        img.shape,
    )
    if not extended_line:
        return None

    refined_blk = copy.deepcopy(blk)
    refined_blk.lines = [extended_line]
    try:
        refined_blk.adjust_bbox(with_bbox=False)
    except Exception:
        return None

    if isinstance(profile, dict):
        truncated_profile = profile.get("truncated_refine") or {}
        truncated_profile["calls"] = int(truncated_profile.get("calls", 0)) + 1
        profile["truncated_refine"] = truncated_profile

    refined_lines_coords, refined_lines = recognize_block_lines(
        engine,
        img,
        mask_refined,
        refined_blk,
        profile=profile,
        pass_profile=pass_profile,
    )
    refined_text = "".join(refined_lines)
    refined_norm = normalize_compare_text(refined_text)

    if not refined_norm:
        return None
    if len(refined_norm) < len(original_norm):
        return None
    if len(refined_norm) > len(original_norm) + max(6, len(original_norm)):
        return None
    if original_norm not in refined_norm:
        return None
    if count_meaningful_chars(refined_text) <= count_meaningful_chars(original_text):
        return None

    if isinstance(profile, dict):
        truncated_profile = profile.get("truncated_refine") or {}
        truncated_profile["accepted"] = int(truncated_profile.get("accepted", 0)) + 1
        profile["truncated_refine"] = truncated_profile

    return refined_blk, refined_lines_coords, refined_lines


def upscale_for_manual_crop(img):
    import cv2

    height, width = img.shape[:2]
    if height <= 0 or width <= 0:
        return img

    longest_side = max(height, width)
    scale = min(2.5, max(1.0, 1400.0 / float(longest_side)))
    if scale <= 1.05:
        return img

    target_width = max(1, int(round(width * scale)))
    target_height = max(1, int(round(height * scale)))
    return cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_CUBIC)


def ensure_three_channels(img):
    import cv2

    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)
    return img


def build_manual_crop_variants(img):
    import cv2

    base = upscale_for_manual_crop(img)
    base_rgb = ensure_three_channels(base)
    gray = cv2.cvtColor(base_rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    _otsu_threshold, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    inverted = cv2.bitwise_not(binary)

    variants = [
        ("original", base_rgb),
        ("binary", cv2.cvtColor(binary, cv2.COLOR_GRAY2RGB)),
        ("binary_inverted", cv2.cvtColor(inverted, cv2.COLOR_GRAY2RGB)),
    ]

    height, width = base_rgb.shape[:2]
    if height >= width * 1.3 or width >= height * 1.3:
        rotated = cv2.rotate(base_rgb, cv2.ROTATE_90_CLOCKWISE)
        rotated_binary = cv2.rotate(binary, cv2.ROTATE_90_CLOCKWISE)
        variants.extend([
            ("rotated_original", rotated),
            ("rotated_binary", cv2.cvtColor(rotated_binary, cv2.COLOR_GRAY2RGB)),
        ])

    return variants


def build_manual_crop_result(version: str, img_shape, text: str, variant_name: str):
    height, width = img_shape[:2]
    box = [0, 0, width, height]
    polygon = [[0, 0], [width, 0], [width, height], [0, height]]
    vertical = height >= width * 1.2 and not variant_name.startswith("rotated_")

    return {
        "version": version,
        "img_width": width,
        "img_height": height,
        "blocks": [
            {
                "box": box,
                "vertical": vertical,
                "font_size": None,
                "angle": None,
                "prob": None,
                "language": "ja",
                "aspect_ratio": float(height / width) if width else None,
                "mask_score": None,
                "lines_coords": [polygon],
                "lines": [text],
            }
        ],
    }


def recognize_manual_crop(image_path: str):
    from mokuro import __version__
    from mokuro.utils import imread
    from PIL import Image

    engine = build_engine()
    img = imread(image_path)
    if img is None:
        raise ValueError("Invalid or unsupported image")

    best_variant_name = None
    best_text = ""
    best_score = -1000.0

    for variant_name, variant_img in build_manual_crop_variants(img):
        candidate_text = engine.mocr(Image.fromarray(variant_img))
        candidate_score = score_text_quality(candidate_text)
        if candidate_score > best_score:
            best_score = candidate_score
            best_text = candidate_text
            best_variant_name = variant_name

    direct_result = build_manual_crop_result(__version__, img.shape, best_text, best_variant_name or "original")
    direct_score = score_raw_result(direct_result)

    detected_result = recognize_with_metadata(image_path)
    detected_score = score_raw_result(detected_result)
    detected_blocks = detected_result.get("blocks") or []

    if detected_blocks and detected_score >= max(8.0, direct_score - 3.0):
        return detected_result

    if direct_score > detected_score:
        return direct_result

    return detected_result


def build_page_detection_variants(img, base_block_count: int, pass_profile: str = "standard"):
    import cv2

    normalized_profile = normalize_pass_profile(pass_profile)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    normalized = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    adaptive = cv2.adaptiveThreshold(
        normalized,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        41,
        11,
    )
    adaptive_inv = cv2.bitwise_not(adaptive)

    colorfulness = estimate_page_colorfulness(img)
    variants = []

    if normalized_profile == "heavy" and base_block_count <= 14:
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
        variants.append(("clahe", cv2.cvtColor(clahe, cv2.COLOR_GRAY2RGB)))

    if base_block_count <= 14 or colorfulness < 0.015:
        variants.append(("adaptive_inv", cv2.cvtColor(adaptive_inv, cv2.COLOR_GRAY2RGB)))

    return variants


def recognize_blocks_for_variant(
    engine,
    detect_img,
    recognition_img=None,
    *,
    profile=None,
    pass_kind: str = "base",
    pass_name: str = "base",
    origin_name: str | None = None,
    pass_profile: str = "standard",
):
    if recognition_img is None:
        recognition_img = detect_img

    pass_start = time.perf_counter()
    _mask, mask_refined, blk_list = engine.text_detector(detect_img, refine_mode=1, keep_undetected_mask=True)
    result_blocks = []
    profile_origin = origin_name or pass_name

    for blk in blk_list:
        result_blk = {
            "box": list(blk.xyxy),
            "vertical": blk.vertical,
            "font_size": blk.font_size,
            "angle": safe_float(getattr(blk, "angle", None)),
            "prob": safe_float(getattr(blk, "prob", None)),
            "language": getattr(blk, "language", None),
            "aspect_ratio": safe_aspect_ratio(blk),
            "mask_score": safe_bbox_mask_score(mask_refined, blk.xyxy),
            "lines_coords": [],
            "lines": [],
            "_profile_origin": profile_origin,
        }

        result_blk["lines_coords"], result_blk["lines"] = recognize_block_lines(
            engine,
            recognition_img,
            mask_refined,
            blk,
            profile=profile,
            pass_profile=pass_profile,
        )

        refined_block = maybe_refine_truncated_large_block(
            engine,
            recognition_img,
            mask_refined,
            blk,
            result_blk["lines"],
            profile=profile,
            pass_profile=pass_profile,
        )
        if refined_block is not None:
            refined_blk, refined_lines_coords, refined_lines = refined_block
            result_blk["box"] = list(refined_blk.xyxy)
            result_blk["lines_coords"] = refined_lines_coords
            result_blk["lines"] = refined_lines
            result_blk["mask_score"] = safe_bbox_mask_score(mask_refined, refined_blk.xyxy)
            result_blk["aspect_ratio"] = safe_aspect_ratio(refined_blk)

        result_blocks.append(result_blk)

    pass_entry = build_pass_profile_entry(pass_kind, pass_name, elapsed_ms(pass_start), len(result_blocks))
    if isinstance(profile, dict):
        profile["passes"].append(pass_entry)

    return result_blocks, pass_entry


def merge_variant_blocks(base_blocks, variant_blocks):
    merged_blocks = [copy.deepcopy(block) for block in base_blocks]
    stats = build_merge_stats(len(variant_blocks))

    for candidate in variant_blocks:
        candidate_text = "".join(str(line or "") for line in (candidate.get("lines") or [])).strip()
        candidate_score = score_block_candidate(candidate)
        if not candidate_text or candidate_score < 6.0:
            stats["skipped_candidates"] += 1
            continue

        candidate_box = block_box_tuple(candidate)
        replace_indexes = []
        skip_candidate = False

        for idx, existing in enumerate(merged_blocks):
            overlap_on_smaller, iou = box_overlap_metrics(candidate_box, block_box_tuple(existing))
            if iou < 0.80 and overlap_on_smaller < 0.72:
                continue

            existing_score = score_block_candidate(existing)
            if candidate_score > existing_score + 4.0:
                replace_indexes.append(idx)
                continue

            skip_candidate = True
            break

        if skip_candidate:
            stats["skipped_candidates"] += 1
            continue

        for idx in reversed(replace_indexes):
            merged_blocks.pop(idx)

        stats["accepted_candidates"] += 1
        if replace_indexes:
            stats["replaced_candidates"] += 1
            stats["replaced_blocks"] += len(replace_indexes)
        else:
            stats["added_candidates"] += 1

        merged_blocks.append(candidate)

    stats["final_blocks"] = len(merged_blocks)
    return merged_blocks, stats


def build_focus_regions(width: int, height: int, base_block_count: int, colorfulness: float, pass_profile: str = "standard"):
    if not is_heavy_pass_profile(pass_profile):
        return []

    if base_block_count > 14 or colorfulness >= 0.02:
        return []

    top = int(round(height * 0.14))
    bottom = int(round(height * 0.94))
    left_focus = (0, top, int(round(width * 0.62)), bottom)
    right_focus = (int(round(width * 0.38)), top, width, bottom)
    return [left_focus, right_focus]


def offset_block_coordinates(blocks, offset_x: int, offset_y: int):
    shifted_blocks = []

    for block in blocks:
        shifted = copy.deepcopy(block)
        box = shifted.get("box") or [0, 0, 0, 0]
        shifted["box"] = [
            int(box[0]) + offset_x,
            int(box[1]) + offset_y,
            int(box[2]) + offset_x,
            int(box[3]) + offset_y,
        ]

        shifted_lines = []
        for polygon in shifted.get("lines_coords") or []:
            shifted_polygon = []
            for point in polygon:
                shifted_polygon.append([
                    int(point[0]) + offset_x,
                    int(point[1]) + offset_y,
                ])
            shifted_lines.append(shifted_polygon)
        shifted["lines_coords"] = shifted_lines
        shifted_blocks.append(shifted)

    return shifted_blocks


def recognize_with_metadata(image_path: str, profile=None, pass_profile: str = "standard"):
    from mokuro import __version__
    from mokuro.utils import imread

    engine = build_engine()
    img = imread(image_path)
    if img is None:
        raise ValueError("Invalid or unsupported image")

    height, width, *_ = img.shape
    result = {"version": __version__, "img_width": width, "img_height": height, "blocks": []}
    profile_start = time.perf_counter()
    pass_profile = normalize_pass_profile(pass_profile)
    original_mocr = None
    original_text_detector = None

    if isinstance(profile, dict):
        original_mocr = engine.mocr
        original_text_detector = engine.text_detector

        def profiled_mocr(*args, **kwargs):
            call_start = time.perf_counter()
            value = original_mocr(*args, **kwargs)
            profile["mocr"]["calls"] = int(profile["mocr"].get("calls", 0)) + 1
            profile["mocr"]["total_ms"] = float(profile["mocr"].get("total_ms", 0.0)) + elapsed_ms(call_start)
            return value

        def profiled_text_detector(*args, **kwargs):
            call_start = time.perf_counter()
            value = original_text_detector(*args, **kwargs)
            profile["text_detector"]["calls"] = int(profile["text_detector"].get("calls", 0)) + 1
            profile["text_detector"]["total_ms"] = float(profile["text_detector"].get("total_ms", 0.0)) + elapsed_ms(call_start)
            return value

        engine.mocr = profiled_mocr
        engine.text_detector = profiled_text_detector

    try:
        if getattr(engine, "disable_ocr", False):
            return result

        colorfulness = estimate_page_colorfulness(img)
        merged_blocks, base_pass = recognize_blocks_for_variant(
            engine,
            img,
            img,
            profile=profile,
            pass_kind="base",
            pass_name="base",
            origin_name="base",
            pass_profile=pass_profile,
        )
        base_pass["final_blocks"] = len(merged_blocks)

        for variant_name, variant_img in build_page_detection_variants(img, len(merged_blocks), pass_profile=pass_profile):
            variant_blocks, pass_entry = recognize_blocks_for_variant(
                engine,
                variant_img,
                img,
                profile=profile,
                pass_kind="page_variant",
                pass_name=variant_name,
                origin_name=variant_name,
                pass_profile=pass_profile,
            )
            merged_blocks, merge_stats = merge_variant_blocks(merged_blocks, variant_blocks)
            merge_pass_profile_entry(pass_entry, merge_stats, len(merged_blocks))

        focus_regions = build_focus_regions(width, height, len(merged_blocks), colorfulness, pass_profile=pass_profile)
        for region_index, (x1, y1, x2, y2) in enumerate(focus_regions):
            region_img = img[y1:y2, x1:x2]
            if region_img is None or getattr(region_img, "size", 0) == 0:
                continue

            region_name = "focus_left" if region_index == 0 else "focus_right" if region_index == 1 else f"focus_{region_index + 1}"
            region_blocks, pass_entry = recognize_blocks_for_variant(
                engine,
                region_img,
                region_img,
                profile=profile,
                pass_kind="focus_region",
                pass_name=region_name,
                origin_name=region_name,
                pass_profile=pass_profile,
            )
            shifted_blocks = offset_block_coordinates(region_blocks, x1, y1)
            merged_blocks, merge_stats = merge_variant_blocks(merged_blocks, shifted_blocks)
            merge_pass_profile_entry(pass_entry, merge_stats, len(merged_blocks))

        if isinstance(profile, dict):
            profile["final_blocks"]["count"] = len(merged_blocks)
            profile["final_blocks"]["by_origin"] = collect_final_block_origins(merged_blocks)
        strip_profile_metadata(merged_blocks)
        result["blocks"] = merged_blocks

        return result
    finally:
        if original_mocr is not None:
            engine.mocr = original_mocr
        if original_text_detector is not None:
            engine.text_detector = original_text_detector
        if isinstance(profile, dict):
            profile["duration_ms"] = elapsed_ms(profile_start)


def write_message(payload):
    sys.stdout.write(json.dumps(to_jsonable(payload), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def to_jsonable(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}

    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]

    item_method = getattr(value, "item", None)
    if callable(item_method):
        try:
            return to_jsonable(item_method())
        except Exception:
            pass

    tolist_method = getattr(value, "tolist", None)
    if callable(tolist_method):
        try:
            return to_jsonable(tolist_method())
        except Exception:
            pass

    return str(value)


def build_error_payload(request_id, exc: Exception):
    return {
        "id": request_id,
        "ok": False,
        "error": f"{type(exc).__name__}: {exc}",
        "python": sys.executable,
        "candidatePaths": ADDED_PATHS,
        "traceback": traceback.format_exc(),
    }


def handle_ping(request_id):
    return {
        "id": request_id,
        "ok": True,
        "result": {
            "status": "ready",
            "python": sys.executable,
            "candidatePaths": ADDED_PATHS,
        },
    }


def handle_prewarm(request_id):
    engine = build_engine()
    return {
        "id": request_id,
        "ok": True,
        "result": {
            "status": "prewarmed",
            "python": sys.executable,
            "candidatePaths": ADDED_PATHS,
            "engineReady": engine is not None,
        },
    }


def handle_recognize(request_id, payload):
    image_path = payload.get("imagePath")
    if not image_path:
        raise ValueError("Missing imagePath")

    enable_profile = bool(payload.get("profile"))
    pass_profile = normalize_pass_profile(payload.get("passProfile"))
    if payload.get("mode") == "manual_crop":
        result = recognize_manual_crop(image_path)
    else:
        profile = create_empty_page_profile() if enable_profile else None
        result = recognize_with_metadata(image_path, profile=profile, pass_profile=pass_profile)
        if profile is not None:
            result["profile"] = profile

    return {
        "id": request_id,
        "ok": True,
        "result": result,
    }


def main():
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        request_id = None
        try:
            payload = json.loads(raw_line)
            request_id = payload.get("id")
            request_type = payload.get("type")

            if request_type == "ping":
                write_message(handle_ping(request_id))
                continue

            if request_type == "recognize":
                write_message(handle_recognize(request_id, payload))
                continue

            if request_type == "prewarm":
                write_message(handle_prewarm(request_id))
                continue

            if request_type == "terminate":
                write_message({"id": request_id, "ok": True, "result": {"status": "terminating"}})
                break

            raise ValueError(f"Unsupported request type: {request_type}")
        except Exception as exc:  # noqa: BLE001
            write_message(build_error_payload(request_id, exc))


if __name__ == "__main__":
    main()
