#!/usr/bin/env python3
import copy
import json
import os
import sys
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


def recognize_block_lines(engine, img, mask_refined, blk):
    import cv2
    from PIL import Image

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
            line_text += engine.mocr(Image.fromarray(line_crop))

        lines_coords.append(line.tolist())
        lines_text.append(line_text)

    return lines_coords, lines_text


def maybe_refine_truncated_large_block(engine, img, mask_refined, blk, original_lines):
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

    refined_lines_coords, refined_lines = recognize_block_lines(engine, img, mask_refined, refined_blk)
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

    return refined_blk, refined_lines_coords, refined_lines


def recognize_with_metadata(image_path: str):
    from mokuro import __version__
    from mokuro.utils import imread

    engine = build_engine()
    img = imread(image_path)
    if img is None:
        raise ValueError("Invalid or unsupported image")

    height, width, *_ = img.shape
    result = {"version": __version__, "img_width": width, "img_height": height, "blocks": []}

    if getattr(engine, "disable_ocr", False):
        return result

    _mask, mask_refined, blk_list = engine.text_detector(img, refine_mode=1, keep_undetected_mask=True)

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
        }

        result_blk["lines_coords"], result_blk["lines"] = recognize_block_lines(engine, img, mask_refined, blk)

        refined_block = maybe_refine_truncated_large_block(engine, img, mask_refined, blk, result_blk["lines"])
        if refined_block is not None:
            refined_blk, refined_lines_coords, refined_lines = refined_block
            result_blk["box"] = list(refined_blk.xyxy)
            result_blk["lines_coords"] = refined_lines_coords
            result_blk["lines"] = refined_lines
            result_blk["mask_score"] = safe_bbox_mask_score(mask_refined, refined_blk.xyxy)
            result_blk["aspect_ratio"] = safe_aspect_ratio(refined_blk)

        result["blocks"].append(result_blk)

    return result


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

    result = recognize_with_metadata(image_path)

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
