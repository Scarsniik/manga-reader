import path from "path";
import { dataDir } from "../../utils";
import type { OcrQueueJobPriority } from "./types";

export const OCR_CACHE_DIR = path.join(dataDir, "ocr-cache");
export const OCR_TEMP_DIR = path.join(dataDir, "ocr-temp");
export const CACHE_SCHEMA_VERSION = "mokuro-page-v7";
export const MANGA_OCR_FILE_NAME = ".manga-helper.ocr.json";
export const MANGA_OCR_SCHEMA_VERSION = "manga-ocr-file-v1";
export const MANGA_OCR_PAGE_SCHEMA_VERSION = "manga-ocr-page-v4";
export const MANGA_OCR_PROFILE_FILE_NAME = ".manga-helper.ocr.profile.json";
export const MANGA_OCR_PROFILE_SCHEMA_VERSION = "manga-ocr-profile-v1";
export const MANGA_VOCABULARY_FILE_NAME = ".manga-helper.vocabulary.json";
export const MANGA_VOCABULARY_SCHEMA_VERSION = "manga-vocabulary-v1";
export const WORKER_BOOT_TIMEOUT_MS = 20_000;
export const WORKER_REQUEST_TIMEOUT_MS = 5 * 60_000;
export const WORKER_PREWARM_TIMEOUT_MS = 10 * 60_000;
export const OCR_QUEUE_PRIORITY_WEIGHT: Record<OcrQueueJobPriority, number> = {
  background: 0,
  user_requested: 1,
  user_waiting: 2,
};
export const OCR_STATUS_POLL_MS = 1_000;
export const OCR_STATUS_WAIT_TIMEOUT_MS = 60 * 60_000;
export const JPDB_PARSE_CONCURRENCY = 1;
export const JPDB_PARSE_THROTTLE_MS = 350;
export const JPDB_PARSE_MAX_ATTEMPTS = 5;
export const MANGA_OCR_CHECKPOINT_PAGE_INTERVAL = 8;
export const MANGA_OCR_CHECKPOINT_INTERVAL_MS = 10_000;
export const WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS = [80, 160, 320, 640, 1_000, 1_600];
export const WINDOWS_TRANSIENT_FS_ERROR_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY", "EEXIST"]);
