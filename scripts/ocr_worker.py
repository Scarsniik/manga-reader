#!/usr/bin/env python3
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


def build_engine():
    global ENGINE

    if ENGINE is not None:
        return ENGINE

    from mokuro.manga_page_ocr import MangaPageOcr

    pretrained_model_name_or_path = os.environ.get("MANGA_HELPER_OCR_MODEL", "kha-white/manga-ocr-base")
    force_cpu = bool_from_env("MANGA_HELPER_OCR_FORCE_CPU", default=False)

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


def recognize_with_metadata(image_path: str):
    import cv2
    from PIL import Image
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

            result_blk["lines_coords"].append(line.tolist())
            result_blk["lines"].append(line_text)

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

            if request_type == "terminate":
                write_message({"id": request_id, "ok": True, "result": {"status": "terminating"}})
                break

            raise ValueError(f"Unsupported request type: {request_type}")
        except Exception as exc:  # noqa: BLE001
            write_message(build_error_payload(request_id, exc))


if __name__ == "__main__":
    main()
