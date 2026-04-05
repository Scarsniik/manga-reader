#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import site
import sys
import sysconfig
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path


LIB_PRUNE_DIRS = {
    "__pycache__",
    "ensurepip",
    "idlelib",
    "test",
    "tests",
    "tkinter",
    "turtledemo",
    "venv",
}

SITE_PACKAGES_PRUNE_DIRS = {
    "__pycache__",
    ".pytest_cache",
}

SKIP_FILE_PATTERNS = (
    "*.pyc",
    "*.pyo",
    "*.whl",
)

RUNTIME_ROOT_GLOBS = (
    "*.dll",
    "*.exe",
    "*.pyd",
    "*.txt",
    "pyvenv.cfg",
)

OPTIONAL_REPO_CHILDREN = (
    "mokuro-upstream",
    "manga-ocr-upstream",
    "mokuro-master",
    "manga-ocr-master",
)

BUNDLE_VERSION = 2
MANIFEST_FILE_NAME = "manifest.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage a standalone OCR bundle for electron-builder.")
    parser.add_argument("--output-root", required=True, help="Target directory for the staged OCR bundle.")
    parser.add_argument("--python-executable", default=sys.executable, help="Python interpreter to bundle.")
    parser.add_argument("--worker-script", required=True, help="Path to scripts/ocr_worker.py.")
    parser.add_argument("--hf-model-root", required=True, help="Source HuggingFace cache or local model directory for manga-ocr.")
    parser.add_argument("--mokuro-cache-root", required=True, help="Source mokuro cache directory containing comictextdetector.pt.")
    parser.add_argument("--repo-root", default="", help="Optional root containing mokuro/manga-ocr source folders.")
    parser.add_argument("--clean", action="store_true", help="Delete the target bundle directory before staging.")
    parser.add_argument("--skip-if-fresh", action="store_true", help="Reuse the existing bundle when the OCR sources match the current manifest.")
    return parser.parse_args()


def ensure_clean_dir(path: Path, clean: bool) -> None:
    if clean and path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def should_skip_file(file_name: str, relative_path: Path) -> bool:
    rel_posix = relative_path.as_posix()
    return any(
        fnmatch(file_name, pattern) or fnmatch(rel_posix, pattern)
        for pattern in SKIP_FILE_PATTERNS
    )


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_tree_filtered(
    src: Path,
    dst: Path,
    prune_dir_names: set[str] | None = None,
) -> dict[str, int]:
    prune_dir_names = prune_dir_names or set()
    copied_files = 0
    copied_bytes = 0

    if not src.exists():
        return {"files": 0, "bytes": 0}

    for root, dir_names, file_names in os.walk(src):
        root_path = Path(root)
        rel_root = root_path.relative_to(src)

        dir_names[:] = [name for name in dir_names if name not in prune_dir_names]

        target_dir = dst / rel_root
        target_dir.mkdir(parents=True, exist_ok=True)

        for file_name in file_names:
            rel_path = rel_root / file_name
            if should_skip_file(file_name, rel_path):
                continue

            src_file = root_path / file_name
            dst_file = target_dir / file_name
            copy_file(src_file, dst_file)
            copied_files += 1
            try:
                copied_bytes += src_file.stat().st_size
            except OSError:
                pass

    return {"files": copied_files, "bytes": copied_bytes}


def copy_matching_root_files(src_root: Path, dst_root: Path) -> dict[str, int]:
    copied_files = 0
    copied_bytes = 0

    for child in src_root.iterdir():
        if child.is_dir():
            continue
        if not any(fnmatch(child.name, pattern) for pattern in RUNTIME_ROOT_GLOBS):
            continue
        dst_file = dst_root / child.name
        copy_file(child, dst_file)
        copied_files += 1
        try:
            copied_bytes += child.stat().st_size
        except OSError:
            pass

    return {"files": copied_files, "bytes": copied_bytes}


def unique_existing_dirs(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for path in paths:
        key = str(path.resolve()) if path.exists() else str(path)
        if key in seen:
            continue
        seen.add(key)
        if path.exists():
            result.append(path)
    return result


def is_site_packages_dir(path: Path) -> bool:
    return path.name.lower() == "site-packages"


def find_manga_ocr_snapshot_dir(root: Path) -> Path:
    if not root.exists():
        raise FileNotFoundError(f"manga-ocr model source not found: {root}")

    required_any = ("pytorch_model.bin", "model.safetensors")
    required_all = ("config.json", "tokenizer_config.json")

    def is_model_dir(path: Path) -> bool:
        return all((path / name).is_file() for name in required_all) and any((path / name).is_file() for name in required_any)

    if is_model_dir(root):
        return root

    snapshots_dir = root / "snapshots"
    if not snapshots_dir.is_dir():
        raise FileNotFoundError(
            "Could not locate a local manga-ocr model snapshot. "
            f"Checked {root}"
        )

    candidates: list[tuple[int, int, Path]] = []
    for child in snapshots_dir.iterdir():
        if not child.is_dir():
            continue
        score = sum(1 for name in (*required_all, *required_any, "special_tokens_map.json", "vocab.txt") if (child / name).is_file())
        if score <= 0:
            continue
        if is_model_dir(child):
            weight_size = 0
            for name in required_any:
                if (child / name).is_file():
                    weight_size = max(weight_size, (child / name).stat().st_size)
            candidates.append((score, weight_size, child))

    if not candidates:
        raise FileNotFoundError(
            "Could not locate a usable manga-ocr snapshot inside the HuggingFace cache. "
            f"Checked {snapshots_dir}"
        )

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def copy_optional_repos(repo_root: Path, target_root: Path) -> list[str]:
    copied: list[str] = []
    if not repo_root.exists():
        return copied

    for child_name in OPTIONAL_REPO_CHILDREN:
        src = repo_root / child_name
        if not src.is_dir():
            continue
        dst = target_root / child_name
        copy_tree_filtered(src, dst, prune_dir_names={"__pycache__", ".git"})
        copied.append(child_name)

    return copied


def load_json(path: Path) -> dict | None:
    if not path.is_file():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def file_signature(path: Path) -> dict[str, int | str]:
    stat = path.stat()
    return {
        "path": str(path),
        "size": stat.st_size,
        "mtimeNs": stat.st_mtime_ns,
    }


def dir_signature(path: Path) -> dict[str, int | str] | None:
    if not path.exists():
        return None

    stat = path.stat()
    return {
        "path": str(path),
        "mtimeNs": stat.st_mtime_ns,
    }


def build_model_file_signatures(model_source_dir: Path) -> dict[str, dict[str, int | str]]:
    result: dict[str, dict[str, int | str]] = {}
    for file_name in (
        "config.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "preprocessor_config.json",
        "vocab.txt",
        "pytorch_model.bin",
        "model.safetensors",
    ):
        candidate = model_source_dir / file_name
        if candidate.is_file():
            result[file_name] = file_signature(candidate)
    return result


def build_source_fingerprint(
    *,
    python_executable: Path,
    python_root: Path,
    worker_script: Path,
    model_source_dir: Path,
    detector_model: Path,
    repo_root: Path | None,
    site_package_sources: list[Path],
) -> dict:
    repo_children = []
    if repo_root and repo_root.exists():
        for child_name in OPTIONAL_REPO_CHILDREN:
            child = repo_root / child_name
            if child.is_dir():
                signature = dir_signature(child)
                if signature:
                    repo_children.append(signature)

    return {
        "bundleVersion": BUNDLE_VERSION,
        "python": {
            "executable": file_signature(python_executable),
            "root": str(python_root),
            "version": sys.version,
            "sitePackageSources": [str(path) for path in site_package_sources],
            "sitePackageRoots": [signature for path in site_package_sources if (signature := dir_signature(path))],
        },
        "workerScript": file_signature(worker_script),
        "models": {
            "mangaOcrModelSource": str(model_source_dir),
            "mangaOcrModelFiles": build_model_file_signatures(model_source_dir),
            "comicTextDetector": file_signature(detector_model),
        },
        "repos": {
            "sourceRoot": str(repo_root) if repo_root else None,
            "availableChildren": repo_children,
        },
    }


def bundle_has_expected_structure(output_root: Path) -> bool:
    expected_paths = (
        output_root / "python" / "python.exe",
        output_root / "scripts" / "ocr_worker.py",
        output_root / "models" / "manga-ocr-base" / "config.json",
        output_root / "models" / "manga-ocr-base" / "tokenizer_config.json",
        output_root / "cache" / "manga-ocr" / "comictextdetector.pt",
    )
    if not all(path.is_file() for path in expected_paths):
        return False

    model_root = output_root / "models" / "manga-ocr-base"
    return any((model_root / name).is_file() for name in ("pytorch_model.bin", "model.safetensors"))


def file_matches_signature(path: Path, signature: dict[str, int | str]) -> bool:
    if not path.is_file():
        return False

    stat = path.stat()
    return stat.st_size == signature.get("size") and stat.st_mtime_ns == signature.get("mtimeNs")


def can_adopt_existing_bundle(output_root: Path, source_fingerprint: dict) -> bool:
    if not bundle_has_expected_structure(output_root):
        return False

    python_signature = source_fingerprint["python"]["executable"]
    if not file_matches_signature(output_root / "python" / "python.exe", python_signature):
        return False

    if not file_matches_signature(output_root / "scripts" / "ocr_worker.py", source_fingerprint["workerScript"]):
        return False

    if not file_matches_signature(
        output_root / "cache" / "manga-ocr" / "comictextdetector.pt",
        source_fingerprint["models"]["comicTextDetector"],
    ):
        return False

    model_output_root = output_root / "models" / "manga-ocr-base"
    for file_name, signature in source_fingerprint["models"]["mangaOcrModelFiles"].items():
        if not file_matches_signature(model_output_root / file_name, signature):
            return False

    return True


def build_cached_manifest(
    *,
    output_root: Path,
    source_fingerprint: dict,
    reused_existing_bundle: bool,
) -> Path:
    manifest = build_manifest(
        bundleVersion=BUNDLE_VERSION,
        sourceFingerprint=source_fingerprint,
        reusedExistingBundle=reused_existing_bundle,
    )
    manifest_path = output_root / MANIFEST_FILE_NAME
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest_path


def build_manifest(**kwargs) -> dict:
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        **kwargs,
    }


def main() -> int:
    args = parse_args()

    output_root = Path(args.output_root).resolve()
    worker_script = Path(args.worker_script).resolve()
    python_executable = Path(args.python_executable).resolve()
    python_root = python_executable.parent
    hf_model_root = Path(args.hf_model_root).expanduser().resolve()
    mokuro_cache_root = Path(args.mokuro_cache_root).expanduser().resolve()
    repo_root = Path(args.repo_root).expanduser().resolve() if args.repo_root else None

    if not worker_script.is_file():
        raise FileNotFoundError(f"OCR worker script not found: {worker_script}")
    if not python_executable.is_file():
        raise FileNotFoundError(f"Python executable not found: {python_executable}")
    if not mokuro_cache_root.is_dir():
        raise FileNotFoundError(f"mokuro cache root not found: {mokuro_cache_root}")

    site_package_sources = unique_existing_dirs(
        [
            Path(path)
            for path in [
                sysconfig.get_paths().get("platlib"),
                sysconfig.get_paths().get("purelib"),
                *site.getsitepackages(),
                site.getusersitepackages(),
            ]
            if path and is_site_packages_dir(Path(path))
        ]
    )

    model_source_dir = find_manga_ocr_snapshot_dir(hf_model_root)
    detector_model = mokuro_cache_root / "comictextdetector.pt"
    if not detector_model.is_file():
        raise FileNotFoundError(f"comictextdetector.pt not found in {mokuro_cache_root}")

    source_fingerprint = build_source_fingerprint(
        python_executable=python_executable,
        python_root=python_root,
        worker_script=worker_script,
        model_source_dir=model_source_dir,
        detector_model=detector_model,
        repo_root=repo_root,
        site_package_sources=site_package_sources,
    )

    manifest_path = output_root / MANIFEST_FILE_NAME
    existing_manifest = load_json(manifest_path)

    if args.skip_if_fresh and bundle_has_expected_structure(output_root):
        if existing_manifest and existing_manifest.get("sourceFingerprint") == source_fingerprint:
            print(json.dumps({
                "ok": True,
                "outputRoot": str(output_root),
                "manifest": str(manifest_path),
                "reused": True,
                "reason": "fresh-manifest",
            }, ensure_ascii=False))
            return 0

        if existing_manifest is None and can_adopt_existing_bundle(output_root, source_fingerprint):
            adopted_manifest_path = build_cached_manifest(
                output_root=output_root,
                source_fingerprint=source_fingerprint,
                reused_existing_bundle=True,
            )
            print(json.dumps({
                "ok": True,
                "outputRoot": str(output_root),
                "manifest": str(adopted_manifest_path),
                "reused": True,
                "reason": "adopted-existing-bundle",
            }, ensure_ascii=False))
            return 0

    ensure_clean_dir(output_root, clean=args.clean)

    python_home_out = output_root / "python"
    scripts_out = output_root / "scripts"
    models_out = output_root / "models" / "manga-ocr-base"
    cache_out = output_root / "cache" / "manga-ocr"
    repos_out = output_root / "repos"

    python_home_out.mkdir(parents=True, exist_ok=True)
    scripts_out.mkdir(parents=True, exist_ok=True)
    models_out.mkdir(parents=True, exist_ok=True)
    cache_out.mkdir(parents=True, exist_ok=True)

    root_copy = copy_matching_root_files(python_root, python_home_out)
    libs_copy = copy_tree_filtered(python_root / "Lib", python_home_out / "Lib", prune_dir_names=LIB_PRUNE_DIRS | {"site-packages"})
    dlls_copy = copy_tree_filtered(python_root / "DLLs", python_home_out / "DLLs", prune_dir_names={"__pycache__"})
    libs_dir_copy = copy_tree_filtered(python_root / "libs", python_home_out / "libs", prune_dir_names={"__pycache__"})

    target_site_packages = python_home_out / "Lib" / "site-packages"
    site_packages_copy = {"files": 0, "bytes": 0}
    for source in site_package_sources:
        stats = copy_tree_filtered(source, target_site_packages, prune_dir_names=SITE_PACKAGES_PRUNE_DIRS)
        site_packages_copy["files"] += stats["files"]
        site_packages_copy["bytes"] += stats["bytes"]

    copy_file(worker_script, scripts_out / "ocr_worker.py")

    model_copy = copy_tree_filtered(model_source_dir, models_out, prune_dir_names={"__pycache__"})

    copy_file(detector_model, cache_out / "comictextdetector.pt")

    copied_repos = copy_optional_repos(repo_root, repos_out) if repo_root else []

    manifest = build_manifest(
        bundleVersion=BUNDLE_VERSION,
        sourceFingerprint=source_fingerprint,
        python={
            "executable": str(python_executable),
            "root": str(python_root),
            "version": sys.version,
            "sitePackageSources": [str(path) for path in site_package_sources],
        },
        workerScript=str(worker_script),
        models={
            "mangaOcrModelSource": str(model_source_dir),
            "comicTextDetectorSource": str(detector_model),
        },
        repos={
            "sourceRoot": str(repo_root) if repo_root else None,
            "copiedChildren": copied_repos,
        },
        stats={
            "pythonRootFiles": root_copy,
            "pythonLib": libs_copy,
            "pythonDlls": dlls_copy,
            "pythonLibsDir": libs_dir_copy,
            "sitePackages": site_packages_copy,
            "mangaOcrModel": model_copy,
        },
    )

    manifest_path = output_root / MANIFEST_FILE_NAME
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, "outputRoot": str(output_root), "manifest": str(manifest_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
