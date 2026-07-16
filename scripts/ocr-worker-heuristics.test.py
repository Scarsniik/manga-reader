#!/usr/bin/env python3
"""Unit tests for the OCR worker heuristics that do not require model loading."""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path

sys.dont_write_bytecode = True


def load_worker():
    worker_path = Path(__file__).with_name("ocr_worker.py")
    spec = importlib.util.spec_from_file_location("ocr_worker_under_test", worker_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import {worker_path}")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


WORKER = load_worker()


def block(box, text, mask_score=0.5):
    return {
        "box": list(box),
        "lines": [text],
        "mask_score": mask_score,
    }


class FakeBlock:
    xyxy = (10, 10, 30, 70)
    vertical = True
    font_size = 30
    prob = None
    language = "ja"
    angle = None
    lines = []

    def aspect_ratio(self):
        return 3.0


class FakeDetector:
    def __call__(self, _image, **_kwargs):
        return None, None, [FakeBlock()]


class FakeEngine:
    text_detector = FakeDetector()


class OcrWorkerHeuristicTests(unittest.TestCase):
    def test_nfkc_counts_fullwidth_alphanumeric_characters(self):
        self.assertEqual(WORKER.count_meaningful_chars("ＡＢＣ１２３"), 6)
        self.assertEqual(WORKER.count_latin_chars("ＡＢＣ１２３"), 3)

    def test_line_variants_only_run_for_weak_or_small_vertical_text(self):
        strong_text = "これは十分に長い日本語です"
        strong_block = type("Block", (), {"font_size": 30, "vertical": True})()
        small_block = type("Block", (), {"font_size": 20, "vertical": True})()

        self.assertFalse(WORKER.should_try_line_variants(strong_block, None, strong_text))
        self.assertTrue(WORKER.should_try_line_variants(small_block, None, strong_text))
        self.assertTrue(WORKER.should_try_line_variants(strong_block, None, "?"))

    def test_color_crop_is_converted_from_opencv_bgr_to_rgb(self):
        fake_cv2 = types.ModuleType("cv2")
        fake_cv2.COLOR_BGR2RGB = "bgr-to-rgb"
        calls = []
        fake_cv2.cvtColor = lambda image, conversion: calls.append((image, conversion)) or "rgb"
        crop = type("Crop", (), {"ndim": 3})()
        previous_cv2 = sys.modules.get("cv2")
        sys.modules["cv2"] = fake_cv2
        try:
            converted = WORKER.convert_crop_to_rgb(crop)
        finally:
            if previous_cv2 is None:
                sys.modules.pop("cv2", None)
            else:
                sys.modules["cv2"] = previous_cv2

        self.assertEqual(converted, "rgb")
        self.assertEqual(calls, [(crop, "bgr-to-rgb")])

    def test_variant_gate_skips_good_duplicate_but_retries_weak_one(self):
        candidate = (10, 10, 30, 70)
        strong = block(candidate, "これは十分に長い日本語です")
        weak = block(candidate, "?")

        self.assertFalse(WORKER.should_recognize_variant_block(candidate, [strong]))
        self.assertTrue(WORKER.should_recognize_variant_block(candidate, [weak]))
        self.assertTrue(WORKER.should_recognize_variant_block((100, 100, 140, 180), [strong]))

    def test_single_kana_variant_remains_eligible(self):
        candidate = block((10, 10, 30, 40), "あ", mask_score=0.0)

        self.assertGreaterEqual(WORKER.score_block_candidate(candidate), 6.0)
        merged, stats = WORKER.merge_variant_blocks([], [candidate])
        self.assertEqual(merged, [candidate])
        self.assertEqual(stats["added_candidates"], 1)

    def test_focus_gate_applies_page_coordinate_offset_before_recognition(self):
        existing = block((110, 210, 130, 270), "これは十分に長い日本語です")
        original_recognize = WORKER.recognize_block_lines
        original_refine = WORKER.maybe_refine_truncated_large_block
        WORKER.recognize_block_lines = lambda *_args, **_kwargs: ([], ["unused"])
        WORKER.maybe_refine_truncated_large_block = lambda *_args, **_kwargs: None
        try:
            results, profile = WORKER.recognize_blocks_for_variant(
                FakeEngine(),
                object(),
                existing_blocks=[existing],
                existing_block_offset=(100, 200),
            )
        finally:
            WORKER.recognize_block_lines = original_recognize
            WORKER.maybe_refine_truncated_large_block = original_refine

        self.assertEqual(results, [])
        self.assertEqual(profile["blocks_detected"], 1)

    def test_replacement_keeps_the_original_reading_order(self):
        first = block((0, 0, 50, 100), "あ")
        second = block((100, 0, 150, 100), "次のブロックです")
        replacement = block((0, 0, 50, 100), "これは改善された長い日本語です")

        merged, stats = WORKER.merge_variant_blocks([first, second], [replacement])

        self.assertEqual(merged[0]["lines"], replacement["lines"])
        self.assertEqual(merged[1]["lines"], second["lines"])
        self.assertEqual(stats["replaced_blocks"], 1)


if __name__ == "__main__":
    unittest.main()
