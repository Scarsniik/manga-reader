import path from "path";
import type { OcrRuntimeConfigState, OcrRuntimeInstallMode, OcrRuntimeItemKind } from "./types";

export const OCR_RUNTIME_CONFIG_FILE_NAME = "ocr-runtime.json";
export const OCR_RUNTIME_METADATA_FILE_NAME = "runtime-metadata.json";
export const OCR_RUNTIME_CONFIG_SCHEMA_VERSION = 1;

export const SUPPORTED_CONFIG_STATES = new Set<OcrRuntimeConfigState>([
    "unknown",
    "skipped",
    "installing",
    "installed",
    "failed",
    "uninstalling",
]);

export const SUPPORTED_INSTALL_MODES = new Set<OcrRuntimeInstallMode>(["user", "portable", "env"]);

export const REQUIRED_RUNTIME_ITEMS: Array<{ label: string; kind: OcrRuntimeItemKind; relativePath: string }> = [
    { label: "Python executable", kind: "file", relativePath: path.join("python", "python.exe") },
    { label: "OCR worker script", kind: "file", relativePath: path.join("scripts", "ocr_worker.py") },
    { label: "manga-ocr model directory", kind: "directory", relativePath: path.join("models", "manga-ocr-base") },
    { label: "comic text detector model", kind: "file", relativePath: path.join("cache", "manga-ocr", "comictextdetector.pt") },
];
