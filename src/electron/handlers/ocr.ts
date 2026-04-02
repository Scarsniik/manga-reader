import { IpcMainInvokeEvent, Notification, app, net } from "electron";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import readline from "readline";
import { dataDir, ensureDataDir, getImageSize } from "../utils";
import { getSettings } from "./params";
import { listImageFiles } from "./pages";
import { getMangaById, getMangas, patchMangaById } from "./mangas";

type RawOcrBlock = {
  box?: [number, number, number, number] | number[];
  vertical?: boolean;
  font_size?: number;
  angle?: number | null;
  prob?: number | null;
  language?: string | null;
  aspect_ratio?: number | null;
  mask_score?: number | null;
  lines?: string[];
  lines_coords?: Array<Array<[number, number]>>;
};

type RawOcrResult = {
  version?: string;
  img_width?: number;
  img_height?: number;
  blocks?: RawOcrBlock[];
  profile?: OcrWorkerPageProfile | null;
};

type NormalizedBox = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  vertical?: boolean;
  lines?: string[];
  manual?: boolean;
};

type NormalizedPageBlock = {
  id: string;
  text: string;
  bboxPx: { x1: number; y1: number; x2: number; y2: number };
  bbox: { x: number; y: number; w: number; h: number };
  vertical: boolean;
  fontSize?: number;
  angle?: number | null;
  detectorConfidence?: number | null;
  language?: string | null;
  aspectRatio?: number | null;
  maskScore?: number | null;
  lines: Array<{ text: string; polygon?: Array<[number, number]> }>;
  confidence?: number | null;
  filteredOut?: boolean;
  filterReason?: string | null;
};

type NormalizedOcrResult = {
  engine: "mokuro";
  width: number;
  height: number;
  boxes: NormalizedBox[];
  fromCache?: boolean;
  debug?: {
    cacheKey: string;
    computedAt: string;
    forceRefreshUsed: boolean;
    fromCache: boolean;
    source?: "manga-file" | "app-cache" | "backend";
  };
  page?: {
    version: string;
    engine: "mokuro";
    source: {
      imagePath: string;
      width: number;
      height: number;
    };
    fromCache: boolean;
    blocks: NormalizedPageBlock[];
  };
};

type OcrLanguageDetectionStatus = "not_run" | "likely_japanese" | "likely_non_japanese" | "uncertain";

type OcrLanguageDetectionSample = {
  pageIndex: number;
  imagePath: string;
  localUrl: string;
  previewText: string;
  japaneseChars: number;
  latinChars: number;
  meaningfulChars: number;
  ratioJapanese: number | null;
};

type OcrLanguageDetection = {
  status: OcrLanguageDetectionStatus;
  score: number | null;
  sampledPages: number[];
  sampledAt?: string;
  appliedLanguageTag?: boolean;
  source?: "metadata" | "ocr-samples" | "reader-page";
  sampleDetails?: OcrLanguageDetectionSample[];
};

type MangaOcrPageEntry = {
  schemaVersion?: string;
  status: "pending" | "done" | "error";
  pageIndex: number;
  pageNumber: number;
  fileName: string;
  imagePath: string;
  sourceSize?: number;
  sourceMtimeMs?: number;
  width?: number;
  height?: number;
  boxes?: NormalizedBox[];
  blocks?: NormalizedPageBlock[];
  manualBoxes?: NormalizedBox[];
  computedAt?: string;
  errorMessage?: string;
  passProfile?: OcrPassProfile;
};

type MangaOcrFile = {
  version: string;
  engine: "mokuro";
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  languageDetection: OcrLanguageDetection;
  progress: {
    totalPages: number;
    completedPages: number;
    failedPages: number;
    lastProcessedPage?: number;
    mode?: "on_demand" | "full_manga";
    updatedAt?: string;
  };
  pages: Record<string, MangaOcrPageEntry>;
};

type OcrQueueJobStatus = "queued" | "detecting_language" | "running" | "paused" | "completed" | "error" | "cancelled";
type OcrQueueJobMode = "on_demand" | "full_manga";
type OcrQueueJobPriority = "background" | "user_requested" | "user_waiting";
type MangaVocabularyMode = "unique" | "all";

type JpdbParseToken = [number | number[] | null, number, number, unknown];

type JpdbParseResult = {
  tokens?: JpdbParseToken[];
  vocabulary?: unknown[];
};

type OcrQueueJob = {
  id: string;
  mangaId: string;
  mangaTitle: string;
  mangaPath: string;
  status: OcrQueueJobStatus;
  mode: OcrQueueJobMode;
  overwrite: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  currentPage?: number;
  currentPagePath?: string;
  message?: string | null;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  languageDetection?: OcrLanguageDetection | null;
  priority: OcrQueueJobPriority;
  heavyPass?: boolean;
};

type OcrPassProfile = "standard" | "heavy";

type OcrNumericRecord = Record<string, number>;

type OcrWorkerPageProfilePass = {
  name?: string;
  kind?: string;
  duration_ms?: number;
  blocks_detected?: number;
  candidate_count?: number;
  accepted_candidates?: number;
  added_candidates?: number;
  replaced_candidates?: number;
  replaced_blocks?: number;
  skipped_candidates?: number;
  final_blocks?: number;
};

type OcrWorkerPageProfile = {
  version?: string;
  duration_ms?: number;
  text_detector?: {
    calls?: number;
    total_ms?: number;
  };
  mocr?: {
    calls?: number;
    total_ms?: number;
  };
  line_variants?: {
    chunks_total?: number;
    variant_triggered_chunks?: number;
    variant_skipped_chunks?: number;
    selected_total?: OcrNumericRecord;
    selected_when_triggered?: OcrNumericRecord;
    candidate_evaluations?: OcrNumericRecord;
    improved_selections?: number;
    score_gain_total?: number;
  };
  truncated_refine?: {
    calls?: number;
    accepted?: number;
  };
  passes?: OcrWorkerPageProfilePass[];
  final_blocks?: {
    count?: number;
    by_origin?: OcrNumericRecord;
  };
};

type MangaOcrProfilePageEntry = {
  pageIndex: number;
  pageNumber: number;
  imagePath: string;
  source: "backend" | "app-cache" | "manga-file";
  computedAt: string;
  status?: "done" | "error";
  errorMessage?: string;
  profile?: OcrWorkerPageProfile | null;
};

type MangaOcrProfileSummaryPass = {
  kind: string;
  name: string;
  runs: number;
  durationMs: number;
  blocksDetected: number;
  candidateCount: number;
  acceptedCandidates: number;
  addedCandidates: number;
  replacedCandidates: number;
  replacedBlocks: number;
  skippedCandidates: number;
  finalBlocks: number;
};

type MangaOcrProfileSummary = {
  backendPages: number;
  appCachePages: number;
  mangaFilePages: number;
  profiledPages: number;
  totalDurationMs: number;
  totalMocrCalls: number;
  totalMocrMs: number;
  totalTextDetectorCalls: number;
  totalTextDetectorMs: number;
  lineSelectedTotal: OcrNumericRecord;
  lineSelectedWhenTriggered: OcrNumericRecord;
  lineCandidateEvaluations: OcrNumericRecord;
  finalBlockOrigins: OcrNumericRecord;
  truncatedRefineCalls: number;
  truncatedRefineAccepted: number;
  passes: Record<string, MangaOcrProfileSummaryPass>;
};

type MangaOcrProfileFile = {
  version: string;
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  session: {
    id: string;
    mode: OcrQueueJobMode;
    overwrite: boolean;
    heavyPass: boolean;
    status: OcrQueueJobStatus;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    totalPages: number;
    pages: Record<string, MangaOcrProfilePageEntry>;
    summary: MangaOcrProfileSummary;
  };
};

type MangaVocabularyFile = {
  version: string;
  manga: {
    id: string;
    title: string;
    rootPath: string;
  };
  source: {
    mode: MangaVocabularyMode;
    extractedAt: string;
    ocrFilePath: string;
    ocrUpdatedAt?: string;
    phraseCount: number;
    processedPages: number;
    failedPages: number;
  };
  counts: {
    allTokens: number;
    uniqueTokens: number;
    outputTokens: number;
  };
  tokens: string[];
};

type MangaVocabularyStatus = {
  exists: boolean;
  filePath: string;
  mode: MangaVocabularyMode | null;
  extractedAt?: string;
  allTokens: number;
  uniqueTokens: number;
  outputTokens: number;
};

type OcrMangaStatus = {
  exists: boolean;
  filePath: string;
  progress: MangaOcrFile["progress"];
  languageDetection: OcrLanguageDetection;
  activeJob: OcrQueueJobSnapshot | null;
  completedPages: number;
  totalPages: number;
  vocabulary: MangaVocabularyStatus;
};

type OcrQueueJobSnapshot = Omit<OcrQueueJob, "pauseRequested" | "cancelRequested">;

type WorkerResponse = {
  id?: string;
  ok?: boolean;
  error?: string;
  traceback?: string;
  python?: string;
  candidatePaths?: string[];
  result?: any;
};

type PendingRequest = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

type OcrWorkerState = {
  process: ChildProcessWithoutNullStreams;
  pending: Map<string, PendingRequest>;
  stderrLines: string[];
};

type BundledOcrAssets = {
  root: string;
  workerScriptPath?: string;
  pythonExecutable?: string;
  pythonHome?: string;
  pythonLib?: string;
  pythonSitePackages?: string;
  modelDir?: string;
  cacheRoot?: string;
  repoRoot?: string;
  pathEntries: string[];
};

const OCR_CACHE_DIR = path.join(dataDir, "ocr-cache");
const OCR_TEMP_DIR = path.join(dataDir, "ocr-temp");
const CACHE_SCHEMA_VERSION = "mokuro-page-v7";
const MANGA_OCR_FILE_NAME = ".manga-helper.ocr.json";
const MANGA_OCR_SCHEMA_VERSION = "manga-ocr-file-v1";
const MANGA_OCR_PAGE_SCHEMA_VERSION = "manga-ocr-page-v4";
const MANGA_OCR_PROFILE_FILE_NAME = ".manga-helper.ocr.profile.json";
const MANGA_OCR_PROFILE_SCHEMA_VERSION = "manga-ocr-profile-v1";
const MANGA_VOCABULARY_FILE_NAME = ".manga-helper.vocabulary.json";
const MANGA_VOCABULARY_SCHEMA_VERSION = "manga-vocabulary-v1";
const WORKER_BOOT_TIMEOUT_MS = 20_000;
const WORKER_REQUEST_TIMEOUT_MS = 5 * 60_000;
const WORKER_PREWARM_TIMEOUT_MS = 10 * 60_000;
const OCR_QUEUE_PRIORITY_WEIGHT: Record<OcrQueueJobPriority, number> = {
  background: 0,
  user_requested: 1,
  user_waiting: 2,
};
const OCR_STATUS_POLL_MS = 1_000;
const OCR_STATUS_WAIT_TIMEOUT_MS = 60 * 60_000;
const JPDB_PARSE_CONCURRENCY = 1;
const JPDB_PARSE_THROTTLE_MS = 350;
const JPDB_PARSE_MAX_ATTEMPTS = 5;
const MANGA_OCR_CHECKPOINT_PAGE_INTERVAL = 8;
const MANGA_OCR_CHECKPOINT_INTERVAL_MS = 10_000;
const WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS = [80, 160, 320, 640, 1_000, 1_600];
const WINDOWS_TRANSIENT_FS_ERROR_CODES = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY", "EEXIST"]);

let workerState: OcrWorkerState | null = null;
let workerPrewarmPromise: Promise<boolean> | null = null;
const ocrQueueJobs = new Map<string, OcrQueueJob>();
let ocrQueueOrder: string[] = [];
let ocrQueueRunnerPromise: Promise<void> | null = null;
let jpdbParseQueue: Promise<void> = Promise.resolve();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const OCR_TEXT_SEGMENT_SPLIT_RE = /[\s\u3000、。．，,・･…‥！？!?：:；;「」『』（）()［］\[\]【】〈〉《》]+/u;
const OCR_WORD_LIKE_CHAR_RE = /[0-9A-Za-z\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/u;

const countMeaningfulOcrChars = (text: string) => (
  Array.from(text).reduce((count, char) => count + (OCR_WORD_LIKE_CHAR_RE.test(char) ? 1 : 0), 0)
);

const getSuspiciousRepeatedSegment = (text: string): string | null => {
  const segments = text
    .split(OCR_TEXT_SEGMENT_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 3);

  if (segments.length < 3) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const segment of segments) {
    counts.set(segment, (counts.get(segment) || 0) + 1);
  }

  for (const [segment, count] of counts.entries()) {
    const coverage = segment.length * count;
    if (count >= 3 && coverage >= Math.max(10, text.length * 0.45)) {
      return segment;
    }
  }

  return null;
};

const hasSuspiciousRepeatedCharRun = (text: string) => /(.)\1{5,}/u.test(text);

const countPunctuationOnlyLines = (block: NormalizedPageBlock) => (
  block.lines.reduce((count, line) => {
    const compactText = line.text.replace(/\s+/g, "");
    if (!compactText) {
      return count;
    }
    return count + (countMeaningfulOcrChars(compactText) === 0 ? 1 : 0);
  }, 0)
);

const isTextDensitySuspicious = (block: NormalizedPageBlock, meaningfulChars: number) => {
  if (!block.fontSize || block.fontSize <= 0 || meaningfulChars < 10) {
    return false;
  }

  const blockWidth = Math.max(1, block.bboxPx.x2 - block.bboxPx.x1);
  const blockHeight = Math.max(1, block.bboxPx.y2 - block.bboxPx.y1);
  const lineCount = Math.max(1, block.lines.length);
  const charsPerLineCapacity = block.vertical
    ? blockHeight / block.fontSize
    : blockWidth / block.fontSize;
  const expectedChars = Math.max(1, charsPerLineCapacity * lineCount);

  return meaningfulChars > Math.max(14, expectedChars * 2.75);
};

const isMaskCoverageSuspicious = (block: NormalizedPageBlock, meaningfulChars: number) => {
  if (block.maskScore == null || meaningfulChars < 10) {
    return false;
  }

  const blockAreaRatio = block.bbox.w * block.bbox.h;
  return block.maskScore < 0.12 && blockAreaRatio < 0.08;
};

const isUnknownShortFragmentWithPunctuation = (
  block: NormalizedPageBlock,
  meaningfulChars: number
) => {
  if (block.language !== "unknown") {
    return false;
  }

  const punctuationOnlyLineCount = countPunctuationOnlyLines(block);
  if (punctuationOnlyLineCount === 0 || block.lines.length > 2) {
    return false;
  }

  const blockAreaRatio = block.bbox.w * block.bbox.h;
  return meaningfulChars <= 5 && blockAreaRatio < 0.01;
};

const getOcrBlockFilterReason = (block: NormalizedPageBlock): string | null => {
  const compactText = block.text.replace(/\s+/g, "");
  if (!compactText) {
    return "empty-text";
  }

  const totalChars = Array.from(compactText).length;
  const meaningfulChars = countMeaningfulOcrChars(compactText);
  if (meaningfulChars === 0 && totalChars >= 2) {
    return "punctuation-only";
  }

  if (totalChars >= 6 && meaningfulChars / totalChars < 0.25) {
    return "mostly-punctuation";
  }

  if (hasSuspiciousRepeatedCharRun(compactText)) {
    return "repeated-char-run";
  }

  const repeatedSegment = getSuspiciousRepeatedSegment(compactText);
  if (repeatedSegment) {
    return `repeated-segment:${repeatedSegment}`;
  }

  if (isTextDensitySuspicious(block, meaningfulChars)) {
    return "text-density-mismatch";
  }

  if (isMaskCoverageSuspicious(block, meaningfulChars)) {
    return "low-mask-coverage";
  }

  if (isUnknownShortFragmentWithPunctuation(block, meaningfulChars)) {
    return "short-fragment-with-punctuation";
  }

  return null;
};

const resolveImagePath = (imagePathOrDataUrl: string): string => {
  if (!imagePathOrDataUrl) {
    throw new Error("Missing image path");
  }

  if (imagePathOrDataUrl.startsWith("local://")) {
    let localPath = imagePathOrDataUrl.replace(/^local:\/\//, "");
    if (localPath.startsWith("/")) {
      localPath = localPath.slice(1);
    }
    return path.normalize(decodeURI(localPath));
  }

  if (imagePathOrDataUrl.startsWith("file://")) {
    return fileURLToPath(imagePathOrDataUrl);
  }

  return path.normalize(imagePathOrDataUrl);
};

const extensionFromDataUrl = (dataUrl: string): string => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  const mime = match?.[1]?.toLowerCase();

  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/bmp") return ".bmp";
  if (mime === "image/tiff") return ".tiff";
  return ".jpg";
};

async function ensureOcrDirs() {
  await ensureDataDir();
  await fs.mkdir(OCR_CACHE_DIR, { recursive: true });
  await fs.mkdir(OCR_TEMP_DIR, { recursive: true });
}

async function resolveWorkerInput(imagePathOrDataUrl: string): Promise<{ imagePath: string; cleanup?: () => Promise<void> }> {
  if (!imagePathOrDataUrl.startsWith("data:image/")) {
    return { imagePath: resolveImagePath(imagePathOrDataUrl) };
  }

  await ensureOcrDirs();

  const extension = extensionFromDataUrl(imagePathOrDataUrl);
  const fileName = `${randomUUID()}${extension}`;
  const targetPath = path.join(OCR_TEMP_DIR, fileName);
  const commaIndex = imagePathOrDataUrl.indexOf(",");
  const base64 = imagePathOrDataUrl.slice(commaIndex + 1);

  await fs.writeFile(targetPath, Buffer.from(base64, "base64"));

  return {
    imagePath: targetPath,
    cleanup: async () => {
      try {
        await fs.unlink(targetPath);
      } catch {
        // ignore temp cleanup failures
      }
    },
  };
}

async function getImageFingerprint(imagePath: string) {
  const stat = await fs.stat(imagePath);
  return {
    imagePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function normalizeOcrPassProfile(value: unknown): OcrPassProfile {
  return value === "heavy" ? "heavy" : "standard";
}

function getStoredEntryPassProfile(entry?: MangaOcrPageEntry | null): OcrPassProfile {
  return normalizeOcrPassProfile(entry?.passProfile ?? "heavy");
}

function doesStoredPassProfileSatisfy(requested: OcrPassProfile, stored?: OcrPassProfile | null) {
  const normalizedRequested = normalizeOcrPassProfile(requested);
  const normalizedStored = normalizeOcrPassProfile(stored ?? "heavy");
  if (normalizedRequested === "standard") {
    return normalizedStored === "standard" || normalizedStored === "heavy";
  }
  return normalizedStored === "heavy";
}

function buildCacheKey(
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  passProfile: OcrPassProfile = "standard"
) {
  return createHash("sha1")
    .update(CACHE_SCHEMA_VERSION)
    .update("\0")
    .update(fingerprint.imagePath)
    .update("\0")
    .update(String(fingerprint.size))
    .update("\0")
    .update(String(fingerprint.mtimeMs))
    .update("\0")
    .update(normalizeOcrPassProfile(passProfile))
    .digest("hex");
}

function getCachePath(cacheKey: string) {
  return path.join(OCR_CACHE_DIR, cacheKey.slice(0, 2), `${cacheKey}.json`);
}

async function readCache(cacheKey: string): Promise<NormalizedOcrResult | null> {
  const cachePath = getCachePath(cacheKey);

  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as NormalizedOcrResult;
    return {
      ...parsed,
      fromCache: true,
      debug: {
        cacheKey,
        computedAt: parsed.debug?.computedAt || new Date(0).toISOString(),
        forceRefreshUsed: !!parsed.debug?.forceRefreshUsed,
        fromCache: true,
        source: "app-cache",
      },
    };
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, result: NormalizedOcrResult) {
  const cachePath = getCachePath(cacheKey);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(result, null, 2), "utf-8");
}

async function deleteCache(cacheKey: string) {
  const cachePath = getCachePath(cacheKey);
  try {
    await fs.unlink(cachePath);
  } catch {
    // ignore missing cache entries
  }
}

async function invalidateCacheForImagePath(imagePath: string) {
  try {
    const fingerprint = await getImageFingerprint(imagePath);
    await Promise.all([
      deleteCache(buildCacheKey(fingerprint, "standard")),
      deleteCache(buildCacheKey(fingerprint, "heavy")),
    ]);
  } catch {
    // ignore cache invalidation failures
  }
}

const getMangaOcrFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_OCR_FILE_NAME);
const getMangaOcrProfileFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_OCR_PROFILE_FILE_NAME);
const getMangaVocabularyFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_VOCABULARY_FILE_NAME);

const toLocalFileUrl = (filePath: string) => pathToFileURL(filePath).href.replace(/^file:\/\//, "local://");

const createEmptyLanguageDetection = (): OcrLanguageDetection => ({
  status: "not_run",
  score: null,
  sampledPages: [],
  appliedLanguageTag: false,
  source: "ocr-samples",
  sampleDetails: [],
});

const createEmptyMangaOcrFile = (manga: { id: string; title: string; path: string }, totalPages: number): MangaOcrFile => ({
  version: MANGA_OCR_SCHEMA_VERSION,
  engine: "mokuro",
  manga: {
    id: String(manga.id),
    title: String(manga.title || path.basename(manga.path)),
    rootPath: manga.path,
  },
  languageDetection: createEmptyLanguageDetection(),
  progress: {
    totalPages,
    completedPages: 0,
    failedPages: 0,
    mode: "on_demand",
    updatedAt: new Date().toISOString(),
  },
  pages: {},
});

async function readMangaOcrFile(mangaPath: string): Promise<MangaOcrFile | null> {
  const targetPath = getMangaOcrFilePath(mangaPath);

  try {
    const raw = await fs.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(raw) as MangaOcrFile;
    const normalizedFile: MangaOcrFile = {
      ...createEmptyMangaOcrFile({
        id: parsed?.manga?.id || path.basename(mangaPath),
        title: parsed?.manga?.title || path.basename(mangaPath),
        path: mangaPath,
      }, Number(parsed?.progress?.totalPages || 0)),
      ...(parsed || {}),
      manga: {
        id: parsed?.manga?.id || path.basename(mangaPath),
        title: parsed?.manga?.title || path.basename(mangaPath),
        rootPath: mangaPath,
      },
      languageDetection: {
        ...createEmptyLanguageDetection(),
        ...(parsed?.languageDetection || {}),
      },
      progress: {
        totalPages: Number(parsed?.progress?.totalPages || 0),
        completedPages: Number(parsed?.progress?.completedPages || 0),
        failedPages: Number(parsed?.progress?.failedPages || 0),
        lastProcessedPage: parsed?.progress?.lastProcessedPage,
        mode: parsed?.progress?.mode,
        updatedAt: parsed?.progress?.updatedAt,
      },
      pages: parsed?.pages || {},
    };
    ensureMangaFileProgress(
      normalizedFile,
      Number(normalizedFile.progress?.totalPages || 0),
      normalizedFile.progress?.mode || "on_demand",
    );
    return normalizedFile;
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeMangaOcrFile(mangaPath: string, file: MangaOcrFile) {
  const targetPath = getMangaOcrFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaOcrFile = {
    ...file,
    version: MANGA_OCR_SCHEMA_VERSION,
    engine: "mokuro",
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    progress: {
      ...(file?.progress || {}),
      updatedAt: new Date().toISOString(),
    },
  };
  ensureMangaFileProgress(
    nextFile,
    Number(nextFile.progress?.totalPages || 0),
    nextFile.progress?.mode || "on_demand",
  );
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

function createEmptyMangaOcrProfileSummary(): MangaOcrProfileSummary {
  return {
    backendPages: 0,
    appCachePages: 0,
    mangaFilePages: 0,
    profiledPages: 0,
    totalDurationMs: 0,
    totalMocrCalls: 0,
    totalMocrMs: 0,
    totalTextDetectorCalls: 0,
    totalTextDetectorMs: 0,
    lineSelectedTotal: {},
    lineSelectedWhenTriggered: {},
    lineCandidateEvaluations: {},
    finalBlockOrigins: {},
    truncatedRefineCalls: 0,
    truncatedRefineAccepted: 0,
    passes: {},
  };
}

function addProfileCounters(target: OcrNumericRecord, source?: OcrNumericRecord | null) {
  for (const [key, rawValue] of Object.entries(source || {})) {
    const value = Number(rawValue || 0);
    if (!Number.isFinite(value) || value === 0) {
      continue;
    }
    target[key] = Number(target[key] || 0) + value;
  }
}

function buildMangaOcrProfileSummary(session: MangaOcrProfileFile["session"]): MangaOcrProfileSummary {
  const summary = createEmptyMangaOcrProfileSummary();

  for (const page of Object.values(session.pages || {})) {
    if (page.source === "backend") {
      summary.backendPages += 1;
    } else if (page.source === "app-cache") {
      summary.appCachePages += 1;
    } else if (page.source === "manga-file") {
      summary.mangaFilePages += 1;
    }

    const profile = page.profile;
    if (!profile) {
      continue;
    }

    summary.profiledPages += 1;
    summary.totalDurationMs += Number(profile.duration_ms || 0);
    summary.totalMocrCalls += Number(profile.mocr?.calls || 0);
    summary.totalMocrMs += Number(profile.mocr?.total_ms || 0);
    summary.totalTextDetectorCalls += Number(profile.text_detector?.calls || 0);
    summary.totalTextDetectorMs += Number(profile.text_detector?.total_ms || 0);
    summary.truncatedRefineCalls += Number(profile.truncated_refine?.calls || 0);
    summary.truncatedRefineAccepted += Number(profile.truncated_refine?.accepted || 0);

    addProfileCounters(summary.lineSelectedTotal, profile.line_variants?.selected_total);
    addProfileCounters(summary.lineSelectedWhenTriggered, profile.line_variants?.selected_when_triggered);
    addProfileCounters(summary.lineCandidateEvaluations, profile.line_variants?.candidate_evaluations);
    addProfileCounters(summary.finalBlockOrigins, profile.final_blocks?.by_origin);

    for (const pass of profile.passes || []) {
      const kind = String(pass.kind || "unknown");
      const name = String(pass.name || "unknown");
      const summaryKey = `${kind}:${name}`;
      const current = summary.passes[summaryKey] || {
        kind,
        name,
        runs: 0,
        durationMs: 0,
        blocksDetected: 0,
        candidateCount: 0,
        acceptedCandidates: 0,
        addedCandidates: 0,
        replacedCandidates: 0,
        replacedBlocks: 0,
        skippedCandidates: 0,
        finalBlocks: 0,
      };

      current.runs += 1;
      current.durationMs += Number(pass.duration_ms || 0);
      current.blocksDetected += Number(pass.blocks_detected || 0);
      current.candidateCount += Number(pass.candidate_count || 0);
      current.acceptedCandidates += Number(pass.accepted_candidates || 0);
      current.addedCandidates += Number(pass.added_candidates || 0);
      current.replacedCandidates += Number(pass.replaced_candidates || 0);
      current.replacedBlocks += Number(pass.replaced_blocks || 0);
      current.skippedCandidates += Number(pass.skipped_candidates || 0);
      current.finalBlocks += Number(pass.final_blocks || 0);
      summary.passes[summaryKey] = current;
    }
  }

  return summary;
}

function createEmptyMangaOcrProfileFile(job: OcrQueueJob, manga: any, totalPages: number): MangaOcrProfileFile {
  const startedAt = job.startedAt || new Date().toISOString();
  return {
    version: MANGA_OCR_PROFILE_SCHEMA_VERSION,
    manga: {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    },
    session: {
      id: job.id,
      mode: job.mode,
      overwrite: !!job.overwrite,
      heavyPass: !!job.heavyPass,
      status: job.status,
      startedAt,
      updatedAt: startedAt,
      totalPages,
      pages: {},
      summary: createEmptyMangaOcrProfileSummary(),
    },
  };
}

function syncMangaOcrProfileSession(file: MangaOcrProfileFile, job: OcrQueueJob, totalPages: number) {
  const nextSession: MangaOcrProfileFile["session"] = {
    ...file.session,
    status: job.status,
    heavyPass: !!job.heavyPass,
    totalPages: Math.max(0, Number(totalPages || file.session.totalPages || 0)),
    updatedAt: new Date().toISOString(),
  };

  if (job.completedAt) {
    nextSession.completedAt = job.completedAt;
  } else {
    delete nextSession.completedAt;
  }

  file.session = nextSession;
  return file.session;
}

async function writeMangaOcrProfileFile(mangaPath: string, file: MangaOcrProfileFile) {
  const targetPath = getMangaOcrProfileFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaOcrProfileFile = {
    ...file,
    version: MANGA_OCR_PROFILE_SCHEMA_VERSION,
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    session: {
      ...(file?.session || {}),
      heavyPass: !!file?.session?.heavyPass,
      totalPages: Math.max(0, Number(file?.session?.totalPages || 0)),
      updatedAt: new Date().toISOString(),
      pages: file?.session?.pages || {},
      summary: buildMangaOcrProfileSummary(file.session),
    },
  };
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

function showQueueJobCompletionNotification(job: OcrQueueJob) {
  if (job.mode !== "full_manga" || !Notification.isSupported()) {
    return;
  }

  let title = "OCR termine";
  if (job.status === "error") {
    title = "OCR en erreur";
  } else if (job.status === "completed" && Number(job.failedPages || 0) > 0) {
    title = "OCR termine avec erreurs";
  } else if (job.status !== "completed") {
    return;
  }

  const processedPages = Number(job.completedPages || 0) + Number(job.failedPages || 0);
  const totalPages = Number(job.totalPages || 0);
  const progressText = totalPages > 0
    ? `${processedPages}/${totalPages} page(s)`
    : `${processedPages} page(s)`;
  const bodyParts = [
    String(job.mangaTitle || "Manga inconnu"),
    progressText,
  ];

  if (job.status === "completed" && Number(job.failedPages || 0) > 0) {
    bodyParts.push(`${Number(job.failedPages || 0)} page(s) en erreur`);
  } else if (job.status === "error" && job.message) {
    bodyParts.push(String(job.message).slice(0, 180));
  }

  try {
    new Notification({
      title,
      body: bodyParts.join("\n"),
      silent: false,
    }).show();
  } catch (error) {
    console.warn("[ocr] Unable to show completion notification", {
      mangaId: job.mangaId,
      error,
    });
  }
}

function buildEmptyMangaVocabularyStatus(mangaPath: string): MangaVocabularyStatus {
  return {
    exists: false,
    filePath: getMangaVocabularyFilePath(mangaPath),
    mode: null,
    extractedAt: undefined,
    allTokens: 0,
    uniqueTokens: 0,
    outputTokens: 0,
  };
}

function getMangaVocabularyStatusSnapshot(mangaPath: string, file?: MangaVocabularyFile | null): MangaVocabularyStatus {
  if (!file) {
    return buildEmptyMangaVocabularyStatus(mangaPath);
  }

  return {
    exists: true,
    filePath: getMangaVocabularyFilePath(mangaPath),
    mode: file.source?.mode === "all" ? "all" : "unique",
    extractedAt: file.source?.extractedAt,
    allTokens: Number(file.counts?.allTokens || 0),
    uniqueTokens: Number(file.counts?.uniqueTokens || 0),
    outputTokens: Number(file.counts?.outputTokens || 0),
  };
}

async function readMangaVocabularyFile(mangaPath: string): Promise<MangaVocabularyFile | null> {
  const targetPath = getMangaVocabularyFilePath(mangaPath);

  try {
    const raw = await fs.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(raw) as MangaVocabularyFile;
    const normalizedTokens = Array.isArray(parsed?.tokens)
      ? parsed.tokens.filter((token): token is string => typeof token === "string" && token.length > 0)
      : [];

    return {
      version: parsed?.version || MANGA_VOCABULARY_SCHEMA_VERSION,
      manga: {
        id: String(parsed?.manga?.id || path.basename(mangaPath)),
        title: String(parsed?.manga?.title || path.basename(mangaPath)),
        rootPath: mangaPath,
      },
      source: {
        mode: parsed?.source?.mode === "all" ? "all" : "unique",
        extractedAt: String(parsed?.source?.extractedAt || new Date(0).toISOString()),
        ocrFilePath: String(parsed?.source?.ocrFilePath || getMangaOcrFilePath(mangaPath)),
        ocrUpdatedAt: parsed?.source?.ocrUpdatedAt,
        phraseCount: Number(parsed?.source?.phraseCount || 0),
        processedPages: Number(parsed?.source?.processedPages || 0),
        failedPages: Number(parsed?.source?.failedPages || 0),
      },
      counts: {
        allTokens: Number(parsed?.counts?.allTokens || normalizedTokens.length),
        uniqueTokens: Number(parsed?.counts?.uniqueTokens || new Set(normalizedTokens).size),
        outputTokens: Number(parsed?.counts?.outputTokens || normalizedTokens.length),
      },
      tokens: normalizedTokens,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeMangaVocabularyFile(mangaPath: string, file: MangaVocabularyFile) {
  const targetPath = getMangaVocabularyFilePath(mangaPath);
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  const nextFile: MangaVocabularyFile = {
    ...file,
    version: MANGA_VOCABULARY_SCHEMA_VERSION,
    manga: {
      ...(file?.manga || {}),
      rootPath: mangaPath,
    },
    tokens: Array.isArray(file?.tokens)
      ? file.tokens.filter((token): token is string => typeof token === "string" && token.length > 0)
      : [],
  };
  const serialized = JSON.stringify(nextFile, null, 2);

  await writeJsonFileAtomically(targetPath, tempPath, serialized);
  return nextFile;
}

async function writeJsonFileAtomically(targetPath: string, tempPath: string, content: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(tempPath, content, "utf-8");

  let lastError: any = null;

  for (let attempt = 0; attempt <= WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (error: any) {
      lastError = error;
      const code = String(error?.code || "");
      if (!WINDOWS_TRANSIENT_FS_ERROR_CODES.has(code)) {
        break;
      }

      // On Windows, replacing an existing file can temporarily fail if the target
      // is still touched by AV/indexing or another reader. Try a best-effort remove
      // before retrying the rename.
      try {
        await fs.unlink(targetPath);
      } catch {
        // ignore: file may not exist yet, or may still be locked
      }

      if (attempt < WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS.length) {
        await delay(WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  try {
    await fs.writeFile(targetPath, content, "utf-8");
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore temp cleanup failures
    }
    return;
  } catch (fallbackError: any) {
    lastError = fallbackError;
  }

  try {
    await fs.unlink(tempPath);
  } catch {
    // ignore temp cleanup failures
  }

  throw lastError;
}

function normalizeManualBoxes(boxes: unknown): NormalizedBox[] {
  if (!Array.isArray(boxes)) {
    return [];
  }

  return boxes.reduce<NormalizedBox[]>((acc, box, index) => {
      const candidate = box as Partial<NormalizedBox>;
      const text = typeof candidate?.text === "string" ? candidate.text.trim() : "";
      const bbox = candidate?.bbox;
      const x = Number(bbox?.x);
      const y = Number(bbox?.y);
      const w = Number(bbox?.w);
      const h = Number(bbox?.h);

      if (!text || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
        return acc;
      }

      const normalizedBox: NormalizedBox = {
        id: typeof candidate.id === "string" && candidate.id.trim().length > 0
          ? candidate.id
          : `manual-${randomUUID()}-${index}`,
        text,
        bbox: {
          x: clamp(x, 0, 1),
          y: clamp(y, 0, 1),
          w: clamp(w, 0, 1),
          h: clamp(h, 0, 1),
        },
        vertical: !!candidate.vertical,
        lines: Array.isArray(candidate.lines)
          ? candidate.lines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
          : undefined,
        manual: true,
      };

      if (normalizedBox.bbox.w > 0 && normalizedBox.bbox.h > 0) {
        acc.push(normalizedBox);
      }

      return acc;
    }, []);
}

function buildMangaPageKey(pageIndex?: number | null, imagePath?: string | null) {
  if (typeof pageIndex === "number" && Number.isFinite(pageIndex) && pageIndex >= 0) {
    return String(pageIndex + 1).padStart(4, "0");
  }

  if (imagePath) {
    return path.basename(imagePath);
  }

  return randomUUID();
}

function normalizeMangaOcrProgressMode(value: unknown): OcrQueueJobMode {
  return value === "full_manga" ? "full_manga" : "on_demand";
}

function getTrackedMangaOcrStatus(entry?: MangaOcrPageEntry | null): "done" | "error" | null {
  if (entry?.status === "done" || entry?.status === "error") {
    return entry.status;
  }
  return null;
}

function getHighestStoredMangaPageNumber(file: MangaOcrFile): number | undefined {
  let highestPageNumber = 0;

  for (const entry of Object.values(file.pages || {})) {
    const pageNumber = Number(entry?.pageNumber || 0);
    if (Number.isFinite(pageNumber) && pageNumber > highestPageNumber) {
      highestPageNumber = Math.floor(pageNumber);
    }
  }

  return highestPageNumber > 0 ? highestPageNumber : undefined;
}

function rebuildMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  let completedPages = 0;
  let failedPages = 0;
  let lastProcessedPage = 0;

  for (const entry of Object.values(file.pages || {})) {
    if (entry?.status === "done") {
      completedPages += 1;
    } else if (entry?.status === "error") {
      failedPages += 1;
    }

    const pageNumber = Number(entry?.pageNumber || 0);
    if (Number.isFinite(pageNumber) && pageNumber > lastProcessedPage) {
      lastProcessedPage = Math.floor(pageNumber);
    }
  }

  const computedTotalPages = Math.max(totalPages, completedPages + failedPages, lastProcessedPage);
  file.progress = {
    ...file.progress,
    totalPages: computedTotalPages,
    completedPages,
    failedPages,
    lastProcessedPage: lastProcessedPage > 0 ? lastProcessedPage : undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

function ensureMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  const progress = file.progress || {
    totalPages,
    completedPages: 0,
    failedPages: 0,
    lastProcessedPage: undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };
  const normalizedMode = normalizeMangaOcrProgressMode(progress.mode || mode);
  const completedPages = Number(progress.completedPages);
  const failedPages = Number(progress.failedPages);
  const lastProcessedPage = Number(progress.lastProcessedPage || 0);
  const computedTotalPages = Math.max(
    totalPages,
    Number(progress.totalPages || 0),
    Number.isFinite(completedPages) ? Math.floor(completedPages) : 0,
    Number.isFinite(failedPages) ? Math.floor(failedPages) : 0,
    Number.isFinite(lastProcessedPage) ? Math.floor(lastProcessedPage) : 0,
  );
  const hasValidCounts = Number.isFinite(completedPages)
    && completedPages >= 0
    && Number.isFinite(failedPages)
    && failedPages >= 0
    && (completedPages + failedPages) <= computedTotalPages;

  if (!hasValidCounts) {
    return rebuildMangaFileProgress(file, totalPages, normalizedMode);
  }

  let normalizedLastProcessedPage = Number.isFinite(lastProcessedPage) && lastProcessedPage > 0
    ? Math.floor(lastProcessedPage)
    : undefined;

  if (normalizedLastProcessedPage === undefined && Object.keys(file.pages || {}).length > 0) {
    normalizedLastProcessedPage = getHighestStoredMangaPageNumber(file);
  }

  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    completedPages: Math.floor(completedPages),
    failedPages: Math.floor(failedPages),
    lastProcessedPage: normalizedLastProcessedPage,
    mode: normalizedMode,
    updatedAt: progress.updatedAt || new Date().toISOString(),
  };

  return file.progress;
}

function touchMangaFileProgress(file: MangaOcrFile, totalPages: number, mode: OcrQueueJobMode | "on_demand") {
  const progress = ensureMangaFileProgress(file, totalPages, mode);
  const normalizedMode = normalizeMangaOcrProgressMode(mode);
  const computedTotalPages = Math.max(
    totalPages,
    Number(progress.totalPages || 0),
    Number(progress.completedPages || 0) + Number(progress.failedPages || 0),
    Number(progress.lastProcessedPage || 0),
  );

  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    mode: normalizedMode,
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

function updateMangaFileProgressForPageChange(
  file: MangaOcrFile,
  totalPages: number,
  mode: OcrQueueJobMode | "on_demand",
  previousEntry?: MangaOcrPageEntry,
  nextEntry?: MangaOcrPageEntry,
) {
  const progress = ensureMangaFileProgress(file, totalPages, mode);
  let completedPages = Number(progress.completedPages || 0);
  let failedPages = Number(progress.failedPages || 0);

  const previousStatus = getTrackedMangaOcrStatus(previousEntry);
  const nextStatus = getTrackedMangaOcrStatus(nextEntry);

  if (previousStatus === "done") {
    completedPages = Math.max(0, completedPages - 1);
  } else if (previousStatus === "error") {
    failedPages = Math.max(0, failedPages - 1);
  }

  if (nextStatus === "done") {
    completedPages += 1;
  } else if (nextStatus === "error") {
    failedPages += 1;
  }

  const previousLastProcessedPage = Number(progress.lastProcessedPage || 0);
  const nextPageNumber = Number(nextEntry?.pageNumber || 0);
  const previousPageNumber = Number(previousEntry?.pageNumber || 0);
  let lastProcessedPage = previousLastProcessedPage > 0 ? previousLastProcessedPage : 0;

  if (Number.isFinite(nextPageNumber) && nextPageNumber > 0) {
    lastProcessedPage = Math.max(lastProcessedPage, Math.floor(nextPageNumber));
  } else if (!nextEntry && previousPageNumber === previousLastProcessedPage) {
    lastProcessedPage = getHighestStoredMangaPageNumber(file) || 0;
  }

  const computedTotalPages = Math.max(totalPages, completedPages + failedPages, lastProcessedPage);
  file.progress = {
    ...progress,
    totalPages: computedTotalPages,
    completedPages,
    failedPages,
    lastProcessedPage: lastProcessedPage > 0 ? lastProcessedPage : undefined,
    mode: normalizeMangaOcrProgressMode(mode),
    updatedAt: new Date().toISOString(),
  };

  return file.progress;
}

function setMangaOcrPageEntry(
  file: MangaOcrFile,
  pageKey: string,
  entry: MangaOcrPageEntry,
  totalPages: number,
  mode: OcrQueueJobMode | "on_demand",
) {
  const previousEntry = file.pages?.[pageKey];
  file.pages[pageKey] = entry;
  updateMangaFileProgressForPageChange(file, totalPages, mode, previousEntry, entry);
  return file.pages[pageKey];
}

function pageEntryToNormalized(entry: MangaOcrPageEntry, imagePath: string, source: "manga-file" | "app-cache" | "backend"): NormalizedOcrResult | null {
  if (entry.status !== "done" || !entry.width || !entry.height) {
    return null;
  }

  const autoBoxes = Array.isArray(entry.boxes) ? entry.boxes : [];
  const manualBoxes = Array.isArray(entry.manualBoxes)
    ? entry.manualBoxes.map((box) => ({ ...box, manual: true }))
    : [];
  const boxes = [...autoBoxes, ...manualBoxes];
  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];

  return {
    engine: "mokuro",
    width: entry.width,
    height: entry.height,
    boxes,
    fromCache: source !== "backend",
    debug: {
      cacheKey: "",
      computedAt: entry.computedAt || new Date(0).toISOString(),
      forceRefreshUsed: false,
      fromCache: source !== "backend",
      source,
    },
    page: {
      version: MANGA_OCR_SCHEMA_VERSION,
      engine: "mokuro",
      source: {
        imagePath,
        width: entry.width,
        height: entry.height,
      },
      fromCache: source !== "backend",
      blocks,
    },
  };
}

function isStoredPageUpToDate(
  entry: MangaOcrPageEntry | undefined,
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  passProfile: OcrPassProfile = "standard"
) {
  if (!entry || entry.status !== "done") {
    return false;
  }

  if (entry.schemaVersion !== MANGA_OCR_PAGE_SCHEMA_VERSION) {
    return false;
  }

  return entry.imagePath === fingerprint.imagePath
    && Number(entry.sourceSize || 0) === Number(fingerprint.size)
    && Number(entry.sourceMtimeMs || 0) === Number(fingerprint.mtimeMs)
    && doesStoredPassProfileSatisfy(passProfile, getStoredEntryPassProfile(entry));
}

function countJapaneseChars(text: string) {
  return Array.from(text).reduce((count, char) => {
    const code = char.codePointAt(0) || 0;
    const isHiragana = code >= 0x3040 && code <= 0x309f;
    const isKatakana = code >= 0x30a0 && code <= 0x30ff;
    const isKanji = (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
    return count + (isHiragana || isKatakana || isKanji ? 1 : 0);
  }, 0);
}

function countLatinChars(text: string) {
  return Array.from(text).reduce((count, char) => count + (/[A-Za-z]/.test(char) ? 1 : 0), 0);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

function normalizeVocabularyMode(value: unknown): MangaVocabularyMode {
  return value === "all" ? "all" : "unique";
}

function getJpdbTokenSurfaceFromText(text: string, token: JpdbParseToken): string {
  const position = token?.[1];
  const length = token?.[2];

  if (typeof position !== "number" || typeof length !== "number" || length <= 0) {
    return "";
  }

  return text.slice(position, position + length);
}

async function parseTextWithJpdbInMain(text: string, apiKey: string): Promise<JpdbParseResult> {
  await app.whenReady();

  const body = JSON.stringify({
    text,
    token_fields: ["vocabulary_index", "position", "length", "furigana"],
    position_length_encoding: "utf16",
    vocabulary_fields: ["vid", "sid", "rid", "spelling", "reading", "frequency_rank", "meanings"],
  });

  let releaseQueue = () => {};
  const previousQueue = jpdbParseQueue;
  jpdbParseQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousQueue;

  try {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= JPDB_PARSE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await net.fetch("https://jpdb.io/api/v1/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });

        if (!response.ok) {
          const details = await response.text();
          throw new Error(`JPDB API error ${response.status}: ${details}`);
        }

        return await response.json() as JpdbParseResult;
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || error || "");
        const isApiResponseError = message.includes("JPDB API error");
        const isLastAttempt = attempt >= JPDB_PARSE_MAX_ATTEMPTS;

        if (isApiResponseError || isLastAttempt) {
          break;
        }

        await delay(700 * attempt);
      }
    }

    throw new Error(String(lastError && (lastError as any).message ? (lastError as any).message : lastError || "JPDB network error"));
  } finally {
    await delay(JPDB_PARSE_THROTTLE_MS);
    releaseQueue();
  }
}

function extractTokenLabelsFromParse(text: string, parseResult: JpdbParseResult): string[] {
  if (!Array.isArray(parseResult?.tokens)) {
    return [];
  }

  return parseResult.tokens
    .map((token) => getJpdbTokenSurfaceFromText(text, token))
    .filter((surface) => surface.length > 0);
}

function collectTextsFromMangaOcrFile(file: MangaOcrFile): { phrases: string[]; processedPages: number } {
  const pageEntries = Object.values(file.pages || {})
    .filter((entry) => entry.status === "done")
    .sort((left, right) => {
      const pageNumberDelta = Number(left.pageIndex || 0) - Number(right.pageIndex || 0);
      if (pageNumberDelta !== 0) {
        return pageNumberDelta;
      }
      return String(left.fileName || "").localeCompare(String(right.fileName || ""));
    });

  const phrases = pageEntries.flatMap((entry) => {
    const boxes = [
      ...(Array.isArray(entry.boxes) ? entry.boxes : []),
      ...(Array.isArray(entry.manualBoxes) ? entry.manualBoxes : []),
    ];

    return boxes
      .map((box) => (typeof box?.text === "string" ? box.text.trim() : ""))
      .filter((text) => text.length > 0);
  });

  return {
    phrases,
    processedPages: pageEntries.length,
  };
}

function buildLanguageDetectionFromTexts(
  texts: string[],
  options?: {
    source?: OcrLanguageDetection["source"];
    sampledPages?: number[];
    sampleDetails?: OcrLanguageDetectionSample[];
  }
): OcrLanguageDetection {
  const combinedText = texts.join("\n");
  const japaneseChars = countJapaneseChars(combinedText);
  const latinChars = countLatinChars(combinedText);
  const meaningfulChars = countMeaningfulOcrChars(combinedText);
  const ratioJapanese = meaningfulChars > 0 ? japaneseChars / meaningfulChars : null;

  let status: OcrLanguageDetectionStatus = "uncertain";
  if (meaningfulChars < 8) {
    status = "uncertain";
  } else if (japaneseChars >= 8 && ratioJapanese !== null && ratioJapanese >= 0.45) {
    status = "likely_japanese";
  } else if (latinChars >= 8 && ratioJapanese !== null && ratioJapanese <= 0.15) {
    status = "likely_non_japanese";
  }

  return {
    status,
    score: ratioJapanese,
    sampledPages: options?.sampledPages || [],
    sampledAt: new Date().toISOString(),
    appliedLanguageTag: false,
    source: options?.source || "ocr-samples",
    sampleDetails: options?.sampleDetails || [],
  };
}

function getMetadataLanguageDetection(manga: any): OcrLanguageDetection | null {
  const language = typeof manga?.language === "string" ? manga.language.trim().toLowerCase() : "";
  if (!language) {
    return null;
  }

  if (language === "ja") {
    return {
      status: "likely_japanese",
      score: 1,
      sampledPages: [],
      sampledAt: new Date().toISOString(),
      appliedLanguageTag: true,
      source: "metadata",
      sampleDetails: [],
    };
  }

  return {
    status: "likely_non_japanese",
    score: 0,
    sampledPages: [],
    sampledAt: new Date().toISOString(),
    appliedLanguageTag: false,
    source: "metadata",
    sampleDetails: [],
  };
}

function pickSamplePageIndices(totalPages: number, seedInput: string, sampleCount: number = 3) {
  if (totalPages <= 0) {
    return [];
  }

  if (totalPages <= sampleCount) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const digest = createHash("sha1").update(seedInput).digest();
  const selected = new Set<number>();
  let cursor = 0;

  while (selected.size < Math.min(sampleCount, totalPages) && cursor < digest.length * 4) {
    const byte = digest[cursor % digest.length] || 0;
    const candidate = byte % totalPages;
    selected.add(candidate);
    cursor += 1;
  }

  if (selected.size < sampleCount) {
    selected.add(0);
    selected.add(Math.floor(totalPages / 2));
    selected.add(totalPages - 1);
  }

  return Array.from(selected).sort((a, b) => a - b).slice(0, sampleCount);
}

async function applyAutoJapaneseLanguageIfNeeded(mangaId: string, detection: OcrLanguageDetection, settings: any) {
  if (!settings?.ocrAutoAssignJapaneseLanguage) {
    return false;
  }

  if (detection.status !== "likely_japanese") {
    return false;
  }

  const manga = await getMangaById(mangaId);
  if (!manga) {
    return false;
  }

  if (String(manga.language || "").toLowerCase() === "ja") {
    return false;
  }

  await patchMangaById(mangaId, { language: "ja" });
  return true;
}

async function ensureMangaOcrFile(manga: any, totalPages: number) {
  const existing = await readMangaOcrFile(manga.path);
  if (existing) {
    existing.manga = {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    };
    touchMangaFileProgress(existing, totalPages, existing.progress.mode || "on_demand");
    return existing;
  }

  const file = createEmptyMangaOcrFile(manga, totalPages);
  touchMangaFileProgress(file, totalPages, file.progress.mode || "on_demand");
  return file;
}

async function detectLanguageForManga(manga: any, pageFiles: string[], settings: any, forceResample: boolean = false): Promise<OcrLanguageDetection> {
  const totalPages = pageFiles.length;
  const file = await ensureMangaOcrFile(manga, totalPages);

  if (!forceResample && file.languageDetection && file.languageDetection.status !== "not_run") {
    return file.languageDetection;
  }

  const metadataDetection = getMetadataLanguageDetection(manga);
  if (metadataDetection && !forceResample) {
    file.languageDetection = metadataDetection;
    file.languageDetection.appliedLanguageTag = metadataDetection.status === "likely_japanese";
    await writeMangaOcrFile(manga.path, file);
    return file.languageDetection;
  }

  const sampleIndices = pickSamplePageIndices(totalPages, `${manga.id}:${manga.path}`);
  const sampleDetails: OcrLanguageDetectionSample[] = [];
  const sampleTexts: string[] = [];

  for (const index of sampleIndices) {
    const imagePath = pageFiles[index];
    if (!imagePath) {
      continue;
    }

    const raw = await callWorkerRecognize(imagePath, settings);
    const texts = Array.isArray(raw?.blocks)
      ? raw.blocks.flatMap((block) => Array.isArray(block.lines) ? block.lines.map((line) => String(line)) : [])
      : [];
    const previewText = texts.join("").slice(0, 120);
    const meaningfulChars = countMeaningfulOcrChars(previewText);
    const japaneseChars = countJapaneseChars(previewText);
    const latinChars = countLatinChars(previewText);

    sampleTexts.push(texts.join("\n"));
    sampleDetails.push({
      pageIndex: index,
      imagePath,
      localUrl: toLocalFileUrl(imagePath),
      previewText,
      japaneseChars,
      latinChars,
      meaningfulChars,
      ratioJapanese: meaningfulChars > 0 ? japaneseChars / meaningfulChars : null,
    });
  }

  const detection = buildLanguageDetectionFromTexts(sampleTexts, {
    source: "ocr-samples",
    sampledPages: sampleIndices.map((index) => index + 1),
    sampleDetails,
  });

  detection.appliedLanguageTag = await applyAutoJapaneseLanguageIfNeeded(manga.id, detection, settings);
  file.languageDetection = detection;
  await writeMangaOcrFile(manga.path, file);
  return detection;
}

async function updateLanguageDetectionFromRecognizedPage(
  manga: any,
  file: MangaOcrFile,
  pageIndex: number,
  imagePath: string,
  result: NormalizedOcrResult,
  settings: any
) {
  const texts = Array.isArray(result.page?.blocks)
    ? result.page.blocks.map((block) => block.text)
    : Array.isArray(result.boxes)
      ? result.boxes.map((box) => box.text)
      : [];
  const detection = buildLanguageDetectionFromTexts(texts, {
    source: "reader-page",
    sampledPages: [pageIndex + 1],
    sampleDetails: [{
      pageIndex,
      imagePath,
      localUrl: toLocalFileUrl(imagePath),
      previewText: texts.join("").slice(0, 120),
      japaneseChars: countJapaneseChars(texts.join("")),
      latinChars: countLatinChars(texts.join("")),
      meaningfulChars: countMeaningfulOcrChars(texts.join("")),
      ratioJapanese: countMeaningfulOcrChars(texts.join("")) > 0 ? countJapaneseChars(texts.join("")) / countMeaningfulOcrChars(texts.join("")) : null,
    }],
  });

  if (detection.status !== "likely_japanese") {
    return file.languageDetection;
  }

  const currentStatus = file.languageDetection?.status || "not_run";
  if (currentStatus !== "likely_japanese") {
    detection.appliedLanguageTag = await applyAutoJapaneseLanguageIfNeeded(manga.id, detection, settings);
    file.languageDetection = detection;
  }

  return file.languageDetection;
}

async function persistPageResultForManga(
  manga: any,
  imagePath: string,
  pageIndex: number,
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  result: NormalizedOcrResult,
  mode: OcrQueueJobMode | "on_demand",
  settings: any,
  passProfile: OcrPassProfile = "standard"
) {
  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const existingEntry = file.pages[pageKey];
  const blocks = Array.isArray(result.page?.blocks) ? result.page?.blocks : [];
  const boxes = Array.isArray(result.boxes) ? result.boxes : [];

  const nextEntry: MangaOcrPageEntry = {
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    status: "done",
    pageIndex,
    pageNumber: pageIndex + 1,
    fileName: path.basename(imagePath),
    imagePath,
    sourceSize: fingerprint.size,
    sourceMtimeMs: fingerprint.mtimeMs,
    width: result.width,
    height: result.height,
    boxes,
    blocks,
    manualBoxes: Array.isArray(existingEntry?.manualBoxes) ? existingEntry.manualBoxes : [],
    computedAt: result.debug?.computedAt || new Date().toISOString(),
    passProfile: normalizeOcrPassProfile(passProfile),
  };

  await updateLanguageDetectionFromRecognizedPage(manga, file, pageIndex, imagePath, result, settings);
  setMangaOcrPageEntry(file, pageKey, nextEntry, pageFiles.length, mode);
  await writeMangaOcrFile(manga.path, file);
  return file;
}

async function readStoredPageFromMangaFile(
  mangaPath: string,
  imagePath: string,
  pageIndex: number,
  passProfile: OcrPassProfile = "standard"
) {
  const file = await readMangaOcrFile(mangaPath);
  if (!file) {
    return null;
  }

  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const entry = file.pages?.[pageKey];
  if (!entry) {
    return null;
  }

  const fingerprint = await getImageFingerprint(imagePath);
  if (!isStoredPageUpToDate(entry, fingerprint, passProfile)) {
    return null;
  }

  return pageEntryToNormalized(entry, imagePath, "manga-file");
}

async function addManualBoxesToMangaPage(
  manga: any,
  imagePath: string,
  pageIndex: number,
  boxes: NormalizedBox[]
) {
  const normalizedBoxes = normalizeManualBoxes(boxes);
  if (normalizedBoxes.length === 0) {
    throw new Error("No manual OCR boxes to save");
  }

  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const fingerprint = await getImageFingerprint(imagePath);
  const imageSize = await getImageSize(imagePath);
  const existingEntry = file.pages[pageKey];
  const existingManualBoxes = Array.isArray(existingEntry?.manualBoxes) ? existingEntry.manualBoxes : [];

  const nextEntry: MangaOcrPageEntry = {
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    status: existingEntry?.status === "error" ? "done" : (existingEntry?.status || "done"),
    pageIndex,
    pageNumber: pageIndex + 1,
    fileName: path.basename(imagePath),
    imagePath,
    sourceSize: fingerprint.size,
    sourceMtimeMs: fingerprint.mtimeMs,
    width: Number(existingEntry?.width || imageSize.width || 0),
    height: Number(existingEntry?.height || imageSize.height || 0),
    boxes: Array.isArray(existingEntry?.boxes) ? existingEntry.boxes : [],
    blocks: Array.isArray(existingEntry?.blocks) ? existingEntry.blocks : [],
    manualBoxes: [...existingManualBoxes, ...normalizedBoxes],
    computedAt: existingEntry?.computedAt || new Date().toISOString(),
    errorMessage: undefined,
    passProfile: existingEntry?.passProfile,
  };

  setMangaOcrPageEntry(file, pageKey, nextEntry, pageFiles.length, file.progress.mode || "on_demand");
  await writeMangaOcrFile(manga.path, file);
  await invalidateCacheForImagePath(imagePath);
  return pageEntryToNormalized(file.pages[pageKey], imagePath, "manga-file");
}

async function removeManualBoxFromMangaPage(
  manga: any,
  imagePath: string,
  pageIndex: number,
  boxId: string
) {
  const pageFiles = await listImageFiles(manga.path);
  const file = await ensureMangaOcrFile(manga, pageFiles.length);
  const pageKey = buildMangaPageKey(pageIndex, imagePath);
  const entry = file.pages[pageKey];
  if (!entry) {
    throw new Error("No OCR data stored for this page");
  }

  const manualBoxes = Array.isArray(entry.manualBoxes) ? entry.manualBoxes : [];
  const nextManualBoxes = manualBoxes.filter((box) => box.id !== boxId);
  if (nextManualBoxes.length === manualBoxes.length) {
    throw new Error("Manual OCR selection not found");
  }

  const nextEntry: MangaOcrPageEntry = {
    ...entry,
    schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
    manualBoxes: nextManualBoxes,
  };
  setMangaOcrPageEntry(file, pageKey, nextEntry, pageFiles.length, file.progress.mode || "on_demand");
  await writeMangaOcrFile(manga.path, file);
  await invalidateCacheForImagePath(imagePath);
  return pageEntryToNormalized(nextEntry, imagePath, "manga-file");
}

async function findExistingPath(candidates: string[]) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // ignore missing candidates
    }
  }
  return null;
}

function collectAncestorDirs(startPath: string) {
  const dirs: string[] = [];
  let current = path.resolve(startPath);

  while (true) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return dirs;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getBundledOcrRootCandidates() {
  return uniqueStrings([
    process.env.MANGA_HELPER_OCR_BUNDLE_DIR || "",
    process.resourcesPath ? path.join(process.resourcesPath, "ocr-bundle") : "",
    path.join(path.dirname(app.getAppPath()), "ocr-bundle"),
    path.join(app.getAppPath(), "ocr-bundle"),
    path.join(process.cwd(), "build-resources", "ocr-bundle"),
  ]);
}

async function collectExistingPaths(candidates: string[]) {
  const existing: string[] = [];

  for (const candidate of uniqueStrings(candidates)) {
    if (!candidate) {
      continue;
    }

    try {
      await fs.access(candidate);
      existing.push(candidate);
    } catch {
      // ignore missing candidates
    }
  }

  return existing;
}

async function resolveBundledOcrAssets(): Promise<BundledOcrAssets | null> {
  for (const root of getBundledOcrRootCandidates()) {
    try {
      await fs.access(root);
    } catch {
      continue;
    }

    const workerScriptPath = await findExistingPath([
      path.join(root, "scripts", "ocr_worker.py"),
      path.join(root, "ocr_worker.py"),
    ]);
    const pythonExecutable = await findExistingPath([
      path.join(root, "python", "python.exe"),
    ]);
    const pythonHome = pythonExecutable ? path.dirname(pythonExecutable) : undefined;
    const pythonLib = pythonHome ? path.join(pythonHome, "Lib") : undefined;
    const pythonSitePackages = pythonHome
      ? await findExistingPath([
        path.join(pythonHome, "Lib", "site-packages"),
      ]) || undefined
      : undefined;
    const repoRoot = await findExistingPath([
      path.join(root, "repos"),
    ]) || undefined;
    const modelDir = await findExistingPath([
      path.join(root, "models", "manga-ocr-base"),
    ]) || undefined;
    const cacheRoot = await findExistingPath([
      path.join(root, "cache", "manga-ocr"),
    ]) || undefined;
    const pathEntries = await collectExistingPaths([
      pythonHome || "",
      pythonHome ? path.join(pythonHome, "DLLs") : "",
      pythonSitePackages || "",
      pythonSitePackages ? path.join(pythonSitePackages, "torch", "lib") : "",
      pythonSitePackages ? path.join(pythonSitePackages, "numpy.libs") : "",
      pythonSitePackages ? path.join(pythonSitePackages, "PIL.libs") : "",
      pythonSitePackages ? path.join(pythonSitePackages, "pillow.libs") : "",
      pythonSitePackages ? path.join(pythonSitePackages, "opencv_python.libs") : "",
    ]);

    return {
      root,
      workerScriptPath: workerScriptPath || undefined,
      pythonExecutable: pythonExecutable || undefined,
      pythonHome,
      pythonLib,
      pythonSitePackages,
      modelDir,
      cacheRoot,
      repoRoot,
      pathEntries,
    };
  }

  return null;
}

async function resolveWorkerScriptPath(bundledAssets?: BundledOcrAssets | null) {
  return findExistingPath([
    path.join(app.getAppPath(), "scripts", "ocr_worker.py"),
    path.join(process.cwd(), "scripts", "ocr_worker.py"),
    bundledAssets?.workerScriptPath || "",
  ]);
}

function buildCandidateRoots(settings: any, bundledAssets?: BundledOcrAssets | null): string[] {
  const roots: string[] = [];
  const appRoots = uniqueStrings([app.getAppPath(), process.cwd()]);

  if (bundledAssets?.repoRoot) {
    roots.push(bundledAssets.repoRoot);
  }

  for (const base of appRoots) {
    const ancestors = collectAncestorDirs(base);
    for (const dir of ancestors) {
      roots.push(path.join(dir, "projects", "Manga OCR"));
      roots.push(path.join(dir, "Manga OCR"));
      roots.push(path.join(dir, "ressources"));
    }
  }

  if (settings?.ocrRepoPath) {
    roots.unshift(String(settings.ocrRepoPath));
  }

  return uniqueStrings(roots);
}

async function buildWorkerEnvironment(settings: any, bundledAssets?: BundledOcrAssets | null) {
  const candidateRoots = buildCandidateRoots(settings, bundledAssets);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    MANGA_HELPER_OCR_CANDIDATE_ROOTS: candidateRoots.join(path.delimiter),
    MANGA_HELPER_OCR_FORCE_CPU: settings?.ocrForceCpu ? "1" : "0",
  };

  if (bundledAssets?.pythonHome) {
    env.PYTHONHOME = bundledAssets.pythonHome;
    env.PYTHONNOUSERSITE = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
    env.PYTHONPYCACHEPREFIX = path.join(dataDir, "python-cache");

    const pythonPathEntries = uniqueStrings([
      bundledAssets.pythonLib || "",
      bundledAssets.pythonSitePackages || "",
      process.env.PYTHONPATH || "",
    ]);
    if (pythonPathEntries.length > 0) {
      env.PYTHONPATH = pythonPathEntries.join(path.delimiter);
    }

    const pathEntries = uniqueStrings([
      ...bundledAssets.pathEntries,
      process.env.PATH || "",
    ]);
    if (pathEntries.length > 0) {
      env.PATH = pathEntries.join(path.delimiter);
    }
  }

  if (bundledAssets?.cacheRoot) {
    env.MANGA_HELPER_OCR_CACHE_ROOT = bundledAssets.cacheRoot;
  }

  if (bundledAssets?.modelDir) {
    env.MANGA_HELPER_OCR_MODEL = bundledAssets.modelDir;
    env.TRANSFORMERS_OFFLINE = "1";
    env.HF_HUB_OFFLINE = "1";
    env.HF_HUB_DISABLE_TELEMETRY = "1";
  }

  return env;
}

function wireWorkerOutput(state: OcrWorkerState) {
  state.process.stdout.setEncoding("utf8");
  state.process.stderr.setEncoding("utf8");

  const stdoutReader = readline.createInterface({ input: state.process.stdout });
  const stderrReader = readline.createInterface({ input: state.process.stderr });

  stdoutReader.on("line", (line: string) => {
    let payload: WorkerResponse;

    try {
      payload = JSON.parse(line);
    } catch (error) {
      console.warn("[ocr] Failed to parse worker stdout line:", line);
      return;
    }

    const requestId = payload.id;
    if (!requestId) {
      return;
    }

    const pending = state.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    state.pending.delete(requestId);
    pending.resolve(payload);
  });

  stderrReader.on("line", (line: string) => {
    state.stderrLines.push(line);
    if (state.stderrLines.length > 50) {
      state.stderrLines.shift();
    }
    console.warn("[ocr][python]", line);
  });

  const rejectPending = (reason: string) => {
    for (const [requestId, pending] of state.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
      state.pending.delete(requestId);
    }
  };

  state.process.on("error", (error) => {
    rejectPending(`OCR worker process error: ${error.message}`);
    workerState = null;
  });

  state.process.on("exit", (code, signal) => {
    const details = `OCR worker exited (code=${String(code)}, signal=${String(signal)})`;
    rejectPending(details);
    workerState = null;
  });
}

function sendWorkerRequest(
  state: OcrWorkerState,
  payload: Record<string, any>,
  timeoutMs: number = WORKER_REQUEST_TIMEOUT_MS
): Promise<WorkerResponse> {
  const requestId = randomUUID();
  const request = { ...payload, id: requestId };

  return new Promise<WorkerResponse>((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error(`OCR worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    state.pending.set(requestId, { resolve, reject, timeout });
    state.process.stdin.write(`${JSON.stringify(request)}\n`, "utf8");
  });
}

async function ensureWorker(settings: any): Promise<OcrWorkerState> {
  if (workerState && !workerState.process.killed && workerState.process.exitCode == null) {
    return workerState;
  }

  const bundledAssets = await resolveBundledOcrAssets();
  const scriptPath = await resolveWorkerScriptPath(bundledAssets);
  if (!scriptPath) {
    throw new Error("OCR worker script not found. Expected scripts/ocr_worker.py or a packaged ocr-bundle.");
  }

  const pythonExecutable = String(
    settings?.ocrPythonPath
    || process.env.MANGA_HELPER_PYTHON
    || bundledAssets?.pythonExecutable
    || process.env.PYTHON
    || "python"
  );

  const proc = spawn(pythonExecutable, ["-u", scriptPath], {
    cwd: bundledAssets?.root || path.dirname(scriptPath),
    env: await buildWorkerEnvironment(settings, bundledAssets),
    stdio: ["pipe", "pipe", "pipe"],
  });

  const nextState: OcrWorkerState = {
    process: proc,
    pending: new Map(),
    stderrLines: [],
  };

  wireWorkerOutput(nextState);
  workerState = nextState;

  const ping = await sendWorkerRequest(nextState, { type: "ping" }, WORKER_BOOT_TIMEOUT_MS);
  if (!ping.ok) {
    const details = ping.error || "Unknown OCR worker boot failure";
    throw new Error(details);
  }

  return nextState;
}

async function callWorkerRecognize(
  imagePath: string,
  settings: any,
  options?: { mode?: "manual_crop"; profile?: boolean; passProfile?: OcrPassProfile }
): Promise<RawOcrResult> {
  const state = await ensureWorker(settings);
  const response = await sendWorkerRequest(state, {
    type: "recognize",
    imagePath,
    ...(options?.mode ? { mode: options.mode } : {}),
    ...(options?.profile ? { profile: true } : {}),
    ...(options?.passProfile ? { passProfile: normalizeOcrPassProfile(options.passProfile) } : {}),
  });

  if (!response.ok) {
    const details = [response.error, response.python ? `python=${response.python}` : "", response.candidatePaths?.length ? `candidatePaths=${response.candidatePaths.join(", ")}` : ""]
      .filter(Boolean)
      .join(" | ");
    throw new Error(details || "Unknown OCR worker error");
  }

  return (response.result || {}) as RawOcrResult;
}

async function callWorkerPrewarm(settings: any): Promise<boolean> {
  const state = await ensureWorker(settings);
  const response = await sendWorkerRequest(state, { type: "prewarm" }, WORKER_PREWARM_TIMEOUT_MS);

  if (!response.ok) {
    const details = [response.error, response.python ? `python=${response.python}` : "", response.candidatePaths?.length ? `candidatePaths=${response.candidatePaths.join(", ")}` : ""]
      .filter(Boolean)
      .join(" | ");
    throw new Error(details || "Unknown OCR worker prewarm error");
  }

  return true;
}

async function normalizeRawResult(
  raw: RawOcrResult,
  sourceImagePath: string,
  fromCache: boolean,
  debugMeta?: { cacheKey?: string; forceRefreshUsed?: boolean; computedAt?: string }
): Promise<NormalizedOcrResult> {
  const fallbackDimensions = await getImageSize(sourceImagePath);
  const width = Number(raw?.img_width || fallbackDimensions.width || 0);
  const height = Number(raw?.img_height || fallbackDimensions.height || 0);

  if (!width || !height) {
    throw new Error("OCR returned invalid image dimensions.");
  }

  const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];

  const blocks: NormalizedPageBlock[] = rawBlocks.map((block, index) => {
    const sourceBox = Array.isArray(block.box) ? block.box : [0, 0, 0, 0];
    const x1 = clamp(Number(sourceBox[0] || 0), 0, width);
    const y1 = clamp(Number(sourceBox[1] || 0), 0, height);
    const x2 = clamp(Number(sourceBox[2] || x1), x1, width);
    const y2 = clamp(Number(sourceBox[3] || y1), y1, height);
    const lines = Array.isArray(block.lines) ? block.lines.map((line) => String(line)) : [];
    const text = lines.join("");
    const id = `b${String(index + 1).padStart(4, "0")}`;
    const normalizedBlock: NormalizedPageBlock = {
      id,
      text,
      bboxPx: { x1, y1, x2, y2 },
      bbox: {
        x: x1 / width,
        y: y1 / height,
        w: Math.max(0, x2 - x1) / width,
        h: Math.max(0, y2 - y1) / height,
      },
      vertical: !!block.vertical,
      fontSize: typeof block.font_size === "number" ? block.font_size : undefined,
      angle: typeof block.angle === "number" ? block.angle : null,
      detectorConfidence: typeof block.prob === "number" ? block.prob : null,
      language: typeof block.language === "string" ? block.language : null,
      aspectRatio: typeof block.aspect_ratio === "number" ? block.aspect_ratio : null,
      maskScore: typeof block.mask_score === "number" ? block.mask_score : null,
      lines: lines.map((line, lineIndex) => ({
        text: line,
        polygon: Array.isArray(block.lines_coords?.[lineIndex]) ? block.lines_coords?.[lineIndex] : undefined,
      })),
      confidence: null,
      filteredOut: false,
      filterReason: null,
    };

    const filterReason = getOcrBlockFilterReason(normalizedBlock);
    normalizedBlock.filteredOut = !!filterReason;
    normalizedBlock.filterReason = filterReason;
    return normalizedBlock;
  }).filter((block) => block.text.trim().length > 0);

  const visibleBlocks = blocks.filter((block) => !block.filteredOut);
  const filteredBlockCount = blocks.length - visibleBlocks.length;

  if (filteredBlockCount > 0) {
    console.info("[ocr] Filtered suspicious OCR blocks", {
      sourceImagePath,
      filteredBlockCount,
      keptBlockCount: visibleBlocks.length,
      reasons: blocks
        .filter((block) => block.filteredOut)
        .map((block) => block.filterReason)
        .filter(Boolean),
    });
  }

  const boxes: NormalizedBox[] = visibleBlocks.map((block) => ({
    id: block.id,
    text: block.text,
    bbox: block.bbox,
    vertical: block.vertical,
    lines: block.lines.map((line) => line.text),
  }));

  return {
    engine: "mokuro",
    width,
    height,
    boxes,
    fromCache,
    debug: {
      cacheKey: debugMeta?.cacheKey || "",
      computedAt: debugMeta?.computedAt || new Date().toISOString(),
      forceRefreshUsed: !!debugMeta?.forceRefreshUsed,
      fromCache,
    },
    page: {
      version: String(raw?.version || "unknown"),
      engine: "mokuro",
      source: {
        imagePath: sourceImagePath,
        width,
        height,
      },
      fromCache,
      blocks,
    },
  };
}

function cloneQueueJob(job: OcrQueueJob): OcrQueueJobSnapshot {
  return {
    id: job.id,
    mangaId: job.mangaId,
    mangaTitle: job.mangaTitle,
    mangaPath: job.mangaPath,
    status: job.status,
    mode: job.mode,
    overwrite: job.overwrite,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    totalPages: job.totalPages,
    completedPages: job.completedPages,
    failedPages: job.failedPages,
    currentPage: job.currentPage,
    currentPagePath: job.currentPagePath,
    message: job.message,
    languageDetection: job.languageDetection || null,
    priority: job.priority,
    heavyPass: !!job.heavyPass,
  };
}

function touchQueueJob(job: OcrQueueJob, patch?: Partial<OcrQueueJob>) {
  Object.assign(job, patch || {});
  job.updatedAt = new Date().toISOString();
  ocrQueueJobs.set(job.id, job);
  return job;
}

function getQueueJobByMangaId(mangaId: string) {
  const jobs = Array.from(ocrQueueJobs.values())
    .filter((job) => job.mangaId === mangaId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return jobs[0] || null;
}

function getNextRunnableQueueJob() {
  return ocrQueueOrder
    .map((jobId) => ocrQueueJobs.get(jobId))
    .filter((job): job is OcrQueueJob => !!job && job.status === "queued")
    .sort((a, b) => {
      const priorityDelta = OCR_QUEUE_PRIORITY_WEIGHT[b.priority] - OCR_QUEUE_PRIORITY_WEIGHT[a.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      if (a.updatedAt !== b.updatedAt) {
        return a.updatedAt < b.updatedAt ? -1 : 1;
      }
      return a.createdAt < b.createdAt ? -1 : 1;
    })[0] || null;
}

function getHigherQueuePriority(
  left: OcrQueueJobPriority = "background",
  right: OcrQueueJobPriority = "background"
): OcrQueueJobPriority {
  return OCR_QUEUE_PRIORITY_WEIGHT[left] >= OCR_QUEUE_PRIORITY_WEIGHT[right] ? left : right;
}

function isQueueJobRunning(status?: OcrQueueJobStatus | null) {
  return status === "queued" || status === "detecting_language" || status === "running";
}

function isMangaOcrFullyProcessed(status: OcrMangaStatus) {
  const totalPages = Math.max(Number(status.totalPages || 0), Number(status.progress?.totalPages || 0));
  if (totalPages <= 0) {
    return false;
  }

  const completedPages = Number(status.completedPages || 0);
  const failedPages = Number(status.progress?.failedPages || 0);
  return completedPages + failedPages >= totalPages;
}

async function recognizePageInternal(
  imagePath: string,
  settings: any,
  options?: {
    forceRefresh?: boolean;
    manga?: any;
    pageIndex?: number;
    mode?: OcrQueueJobMode | "on_demand";
    passProfile?: OcrPassProfile;
  }
) {
  const fingerprint = await getImageFingerprint(imagePath);
  const passProfile = normalizeOcrPassProfile(options?.passProfile || "standard");
  const cacheKey = buildCacheKey(fingerprint, passProfile);
  const forceRefresh = !!options?.forceRefresh;

  if (options?.manga && typeof options.pageIndex === "number" && !forceRefresh) {
    const stored = await readStoredPageFromMangaFile(options.manga.path, imagePath, options.pageIndex, passProfile);
    if (stored) {
      return {
        result: {
          ...stored,
          debug: {
            ...(stored.debug || {
              cacheKey,
              computedAt: new Date(0).toISOString(),
              forceRefreshUsed: false,
              fromCache: true,
            }),
            cacheKey,
            source: "manga-file" as const,
          },
        },
        fingerprint,
        workerProfile: null,
      };
    }
  }

  if (forceRefresh) {
    await deleteCache(cacheKey);
  } else {
    const cached = await readCache(cacheKey);
    if (cached) {
      return {
        result: {
          ...cached,
          debug: {
            ...(cached.debug || {
              cacheKey,
              computedAt: new Date(0).toISOString(),
              forceRefreshUsed: false,
              fromCache: true,
            }),
            cacheKey,
            source: "app-cache" as const,
          },
        },
        fingerprint,
        workerProfile: null,
      };
    }
  }

  const raw = await callWorkerRecognize(imagePath, settings, {
    profile: options?.mode === "full_manga",
    passProfile,
  });
  const normalized = await normalizeRawResult(raw, imagePath, false, {
    cacheKey,
    forceRefreshUsed: forceRefresh,
    computedAt: new Date().toISOString(),
  });
  normalized.debug = {
    ...(normalized.debug || {
      cacheKey,
      computedAt: new Date().toISOString(),
      forceRefreshUsed: forceRefresh,
      fromCache: false,
    }),
    cacheKey,
    source: "backend",
  };
  await writeCache(cacheKey, normalized);

  if (options?.manga && typeof options.pageIndex === "number") {
    await persistPageResultForManga(
      options.manga,
      imagePath,
      options.pageIndex,
      fingerprint,
      normalized,
      options.mode || "on_demand",
      settings,
      passProfile,
    );
  }

  return {
    result: normalized,
    fingerprint,
    workerProfile: raw.profile || null,
  };
}

async function processQueueJob(job: OcrQueueJob) {
  const manga = await getMangaById(job.mangaId);
  if (!manga) {
    touchQueueJob(job, {
      status: "error",
      message: "Manga introuvable",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  const settings = await getSettings();
  const pageFiles = await listImageFiles(manga.path);
  touchQueueJob(job, {
    startedAt: job.startedAt || new Date().toISOString(),
    totalPages: pageFiles.length,
    status: "running",
    message: null,
    completedPages: 0,
    failedPages: 0,
  });

  let workingFile = await ensureMangaOcrFile(manga, pageFiles.length);
  touchMangaFileProgress(workingFile, pageFiles.length, job.mode);
  let workingProfile = createEmptyMangaOcrProfileFile(job, manga, pageFiles.length);
  syncMangaOcrProfileSession(workingProfile, job, pageFiles.length);

  let ocrFileDirty = true;
  let profileFileDirty = true;
  let dirtyPageCount = 0;
  let lastCheckpointAt = Date.now();

  const flushWorkingState = async (force: boolean = false) => {
    if (!ocrFileDirty && !profileFileDirty) {
      return false;
    }

    const dueByPages = dirtyPageCount >= MANGA_OCR_CHECKPOINT_PAGE_INTERVAL;
    const dueByTime = (Date.now() - lastCheckpointAt) >= MANGA_OCR_CHECKPOINT_INTERVAL_MS;
    if (!force && !dueByPages && !dueByTime) {
      return false;
    }

    if (ocrFileDirty) {
      workingFile = await writeMangaOcrFile(manga.path, workingFile);
    }
    if (profileFileDirty) {
      syncMangaOcrProfileSession(workingProfile, job, pageFiles.length);
      workingProfile = await writeMangaOcrProfileFile(manga.path, workingProfile);
    }
    ocrFileDirty = false;
    profileFileDirty = false;
    dirtyPageCount = 0;
    lastCheckpointAt = Date.now();
    return true;
  };

  await flushWorkingState(true);
  touchQueueJob(job, {
    completedPages: Number(workingFile.progress.completedPages || 0),
    failedPages: Number(workingFile.progress.failedPages || 0),
  });

  for (let index = 0; index < pageFiles.length; index += 1) {
    if (job.cancelRequested) {
      touchQueueJob(job, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
        message: "Annule",
      });
      profileFileDirty = true;
      await flushWorkingState(true);
      return;
    }

    if (job.pauseRequested) {
      touchQueueJob(job, {
        status: "paused",
        message: "En pause",
      });
      profileFileDirty = true;
      await flushWorkingState(true);
      return;
    }

    const imagePath = pageFiles[index];
    if (!imagePath) {
      continue;
    }

    const pageKey = buildMangaPageKey(index, imagePath);
    const existingEntry = workingFile.pages?.[pageKey];
    const passProfile: OcrPassProfile = job.heavyPass ? "heavy" : "standard";

    if (!job.overwrite && existingEntry) {
      const fingerprint = await getImageFingerprint(imagePath);
      if (isStoredPageUpToDate(existingEntry, fingerprint, passProfile)) {
        workingProfile.session.pages[pageKey] = {
          pageIndex: index,
          pageNumber: index + 1,
          imagePath,
          source: "manga-file",
          computedAt: String(existingEntry.computedAt || new Date().toISOString()),
          status: "done",
          profile: null,
        };
        profileFileDirty = true;
        dirtyPageCount += 1;
        await flushWorkingState(false);
        touchQueueJob(job, {
          currentPage: index + 1,
          currentPagePath: imagePath,
          completedPages: Number(workingFile.progress?.completedPages || 0),
          failedPages: Number(workingFile.progress?.failedPages || 0),
        });
        continue;
      }
    }

    touchQueueJob(job, {
      currentPage: index + 1,
      currentPagePath: imagePath,
      status: "running",
      message: null,
    });

    try {
      const { result, fingerprint, workerProfile } = await recognizePageInternal(imagePath, settings, {
        forceRefresh: job.overwrite,
        mode: job.mode,
        passProfile,
      });

      const blocks = Array.isArray(result.page?.blocks) ? result.page?.blocks : [];
      const boxes = Array.isArray(result.boxes) ? result.boxes : [];
      const nextEntry: MangaOcrPageEntry = {
        schemaVersion: MANGA_OCR_PAGE_SCHEMA_VERSION,
        status: "done",
        pageIndex: index,
        pageNumber: index + 1,
        fileName: path.basename(imagePath),
        imagePath,
        sourceSize: fingerprint.size,
        sourceMtimeMs: fingerprint.mtimeMs,
        width: result.width,
        height: result.height,
        boxes,
        blocks,
        manualBoxes: Array.isArray(existingEntry?.manualBoxes) ? existingEntry.manualBoxes : [],
        computedAt: result.debug?.computedAt || new Date().toISOString(),
        passProfile,
      };

      await updateLanguageDetectionFromRecognizedPage(manga, workingFile, index, imagePath, result, settings);
      setMangaOcrPageEntry(workingFile, pageKey, nextEntry, pageFiles.length, job.mode);
      workingProfile.session.pages[pageKey] = {
        pageIndex: index,
        pageNumber: index + 1,
        imagePath,
        source: result.debug?.source === "app-cache" || result.debug?.source === "manga-file" ? result.debug.source : "backend",
        computedAt: String(result.debug?.computedAt || new Date().toISOString()),
        status: "done",
        profile: workerProfile,
      };
      ocrFileDirty = true;
      profileFileDirty = true;
      dirtyPageCount += 1;
      await flushWorkingState(false);
      touchQueueJob(job, {
        completedPages: Number(workingFile.progress?.completedPages || 0),
        failedPages: Number(workingFile.progress?.failedPages || 0),
      });
    } catch (error: any) {
      const nextEntry: MangaOcrPageEntry = {
        status: "error",
        pageIndex: index,
        pageNumber: index + 1,
        fileName: path.basename(imagePath),
        imagePath,
        errorMessage: String(error?.message || error || "OCR error"),
      };
      setMangaOcrPageEntry(workingFile, pageKey, nextEntry, pageFiles.length, job.mode);
      workingProfile.session.pages[pageKey] = {
        pageIndex: index,
        pageNumber: index + 1,
        imagePath,
        source: "backend",
        computedAt: new Date().toISOString(),
        status: "error",
        errorMessage: String(error?.message || error || "OCR error"),
        profile: null,
      };
      ocrFileDirty = true;
      profileFileDirty = true;
      dirtyPageCount += 1;
      await flushWorkingState(false);
      touchQueueJob(job, {
        completedPages: Number(workingFile.progress?.completedPages || 0),
        failedPages: Number(workingFile.progress?.failedPages || 0),
        message: String(error?.message || error || "OCR error"),
      });
    }
  }

  touchQueueJob(job, {
    status: "completed",
    completedAt: new Date().toISOString(),
    completedPages: Number(workingFile.progress?.completedPages || 0),
    failedPages: Number(workingFile.progress?.failedPages || 0),
    currentPage: undefined,
    currentPagePath: undefined,
    message: workingFile?.progress?.failedPages ? "Termine avec erreurs" : "Termine",
  });
  profileFileDirty = true;
  await flushWorkingState(true);
}

async function runOcrQueue() {
  if (ocrQueueRunnerPromise) {
    return ocrQueueRunnerPromise;
  }

  ocrQueueRunnerPromise = (async () => {
    while (true) {
      const job = getNextRunnableQueueJob();
      if (!job) {
        break;
      }

      try {
        await processQueueJob(job);
        showQueueJobCompletionNotification(job);
      } catch (error: any) {
        touchQueueJob(job, {
          status: "error",
          completedAt: new Date().toISOString(),
          message: String(error?.message || error || "Queue processing error"),
        });
        showQueueJobCompletionNotification(job);
      }
    }
  })();

  try {
    await ocrQueueRunnerPromise;
  } finally {
    ocrQueueRunnerPromise = null;
  }
}

function scheduleQueueRun() {
  void runOcrQueue();
}

function enqueueMangaQueueJob(
  manga: any,
  options?: {
    overwrite?: boolean;
    mode?: OcrQueueJobMode;
    detection?: OcrLanguageDetection | null;
    priority?: OcrQueueJobPriority;
    heavyPass?: boolean;
  }
) {
  const existing = getQueueJobByMangaId(manga.id);
  if (existing && ["queued", "running", "paused", "detecting_language"].includes(existing.status)) {
    const nextPriority = getHigherQueuePriority(existing.priority, options?.priority || existing.priority);
    touchQueueJob(existing, {
      overwrite: existing.overwrite || !!options?.overwrite,
      priority: nextPriority,
      languageDetection: options?.detection || existing.languageDetection || null,
      heavyPass: !!existing.heavyPass || !!options?.heavyPass,
      ...(existing.status === "paused" && options?.overwrite
        ? { status: "queued" as const, pauseRequested: false, message: null }
        : {}),
    });
    scheduleQueueRun();
    return cloneQueueJob(existing);
  }

  const job: OcrQueueJob = {
    id: randomUUID(),
    mangaId: String(manga.id),
    mangaTitle: String(manga.title || path.basename(manga.path)),
    mangaPath: manga.path,
    status: "queued",
    mode: options?.mode || "full_manga",
    overwrite: !!options?.overwrite,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalPages: 0,
    completedPages: 0,
    failedPages: 0,
    message: null,
    languageDetection: options?.detection || null,
    priority: options?.priority || "background",
    heavyPass: !!options?.heavyPass,
  };

  ocrQueueJobs.set(job.id, job);
  ocrQueueOrder = ocrQueueOrder.filter((jobId) => jobId !== job.id);
  ocrQueueOrder.push(job.id);
  scheduleQueueRun();
  return cloneQueueJob(job);
}

async function readMangaVocabularyForUi(mangaPath: string) {
  const file = await readMangaVocabularyFile(mangaPath);
  const status = getMangaVocabularyStatusSnapshot(mangaPath, file);
  const tokens = Array.isArray(file?.tokens) ? file.tokens : [];
  return {
    ...status,
    tokens,
    csv: tokens.join(","),
    phraseCount: Number(file?.source?.phraseCount || 0),
    processedPages: Number(file?.source?.processedPages || 0),
    failedPages: Number(file?.source?.failedPages || 0),
    ocrFilePath: file?.source?.ocrFilePath || getMangaOcrFilePath(mangaPath),
    ocrUpdatedAt: file?.source?.ocrUpdatedAt,
  };
}

async function getMangaOcrStatusInternal(manga: any): Promise<OcrMangaStatus> {
  const pageFiles = await listImageFiles(manga.path);
  const file = await readMangaOcrFile(manga.path);
  const vocabulary = await readMangaVocabularyFile(manga.path);
  const progress = file?.progress || {
    totalPages: pageFiles.length,
    completedPages: 0,
    failedPages: 0,
    updatedAt: undefined,
    mode: undefined,
  };

  return {
    exists: !!file,
    filePath: getMangaOcrFilePath(manga.path),
    progress: {
      totalPages: Math.max(pageFiles.length, Number(progress.totalPages || 0)),
      completedPages: Number(progress.completedPages || 0),
      failedPages: Number(progress.failedPages || 0),
      lastProcessedPage: progress.lastProcessedPage,
      mode: progress.mode,
      updatedAt: progress.updatedAt,
    },
    languageDetection: file?.languageDetection || createEmptyLanguageDetection(),
    activeJob: getQueueJobByMangaId(manga.id) ? cloneQueueJob(getQueueJobByMangaId(manga.id) as OcrQueueJob) : null,
    completedPages: Number(progress.completedPages || 0),
    totalPages: Math.max(pageFiles.length, Number(progress.totalPages || 0)),
    vocabulary: getMangaVocabularyStatusSnapshot(manga.path, vocabulary),
  };
}

async function startMangaOcrInternal(manga: any, options?: Record<string, any>) {
  const settings = await getSettings();
  const pageFiles = await listImageFiles(manga.path);
  const detection = await detectLanguageForManga(manga, pageFiles, settings, !!options?.forceResample);

  if ((detection.status === "uncertain" || detection.status === "likely_non_japanese")
    && !options?.confirmLanguage) {
    return {
      queued: false,
      requiresConfirmation: true,
      reason: detection.status === "uncertain" ? "uncertain-language" : "likely-non-japanese",
      detection,
      status: await getMangaOcrStatusInternal(manga),
    };
  }

  const job = enqueueMangaQueueJob(manga, {
    overwrite: !!options?.overwrite,
    mode: "full_manga",
    detection,
    priority: options?.priority || "user_requested",
    heavyPass: !!options?.heavyPass,
  });

  return {
    queued: true,
    job,
    detection,
    status: await getMangaOcrStatusInternal(manga),
  };
}

async function waitForMangaOcrCompletion(manga: any): Promise<OcrMangaStatus> {
  const deadline = Date.now() + OCR_STATUS_WAIT_TIMEOUT_MS;

  while (Date.now() <= deadline) {
    const status = await getMangaOcrStatusInternal(manga);
    const jobStatus = status.activeJob?.status;

    if (jobStatus === "error") {
      throw new Error(status.activeJob?.message || "Le job OCR a echoue.");
    }

    if (jobStatus === "cancelled") {
      throw new Error("Le job OCR a ete annule.");
    }

    if (jobStatus === "paused") {
      throw new Error("Le job OCR est en pause. Reprends-le avant de lancer l'extraction.");
    }

    if (isMangaOcrFullyProcessed(status)) {
      return status;
    }

    if (!isQueueJobRunning(jobStatus)) {
      throw new Error("L'OCR n'a pas produit un fichier complet exploitable pour l'extraction.");
    }

    await delay(OCR_STATUS_POLL_MS);
  }

  throw new Error("Timeout OCR: l'extraction a attendu trop longtemps la fin du job.");
}

async function ensureMangaOcrReadyForVocabularyExtraction(manga: any, options?: Record<string, any>) {
  const currentStatus = await getMangaOcrStatusInternal(manga);
  const jobStatus = currentStatus.activeJob?.status;

  if (isMangaOcrFullyProcessed(currentStatus)) {
    return {
      ready: true,
      status: currentStatus,
    };
  }

  if (jobStatus === "paused") {
    throw new Error("Le job OCR est en pause. Reprends-le avant de lancer l'extraction.");
  }

  if (isQueueJobRunning(jobStatus)) {
    const waitedStatus = await waitForMangaOcrCompletion(manga);
    return {
      ready: true,
      status: waitedStatus,
    };
  }

  const startResult = await startMangaOcrInternal(manga, {
    overwrite: false,
    confirmLanguage: !!options?.confirmLanguage,
    priority: "user_waiting",
    heavyPass: !!options?.heavyPass,
  });

  if (startResult?.requiresConfirmation) {
    return startResult;
  }

  const waitedStatus = await waitForMangaOcrCompletion(manga);
  return {
    ready: true,
    status: waitedStatus,
  };
}

async function buildVocabularyFileFromOcr(
  manga: any,
  ocrFile: MangaOcrFile,
  mode: MangaVocabularyMode,
  apiKey: string
) {
  const { phrases, processedPages } = collectTextsFromMangaOcrFile(ocrFile);

  if (phrases.length === 0) {
    throw new Error("Aucune phrase OCR exploitable n'a ete trouvee pour ce manga.");
  }

  const parseCache = new Map<string, Promise<string[]>>();
  const skippedPhraseErrors: string[] = [];
  const tokenLists = await mapWithConcurrency(phrases, JPDB_PARSE_CONCURRENCY, async (phrase) => {
    const cached = parseCache.get(phrase);
    if (cached) {
      return cached;
    }

    const request = parseTextWithJpdbInMain(phrase, apiKey)
      .then((parseResult) => extractTokenLabelsFromParse(phrase, parseResult))
      .catch((error: any) => {
        const message = String(error?.message || error);
        if (message.includes("JPDB API error")) {
          throw new Error(`JPDB parse impossible pour "${phrase.slice(0, 40)}": ${message}`);
        }

        console.warn("[jpdb] Parse skipped after retries", {
          phrasePreview: phrase.slice(0, 80),
          error: message,
        });
        skippedPhraseErrors.push(`${phrase.slice(0, 40)} -> ${message}`);
        return [];
      });

    parseCache.set(phrase, request);
    return request;
  });

  const allTokens = tokenLists.flat();
  const uniqueTokens = Array.from(new Set(allTokens));
  const outputTokens = mode === "all" ? allTokens : uniqueTokens;

  if (outputTokens.length === 0) {
    if (skippedPhraseErrors.length > 0) {
      throw new Error(`JPDB indisponible pendant l'extraction. Exemple: ${skippedPhraseErrors[0]}`);
    }
    throw new Error("JPDB n'a retourne aucun token exploitable pour ce manga.");
  }

  return {
    version: MANGA_VOCABULARY_SCHEMA_VERSION,
    manga: {
      id: String(manga.id),
      title: String(manga.title || path.basename(manga.path)),
      rootPath: manga.path,
    },
    source: {
      mode,
      extractedAt: new Date().toISOString(),
      ocrFilePath: getMangaOcrFilePath(manga.path),
      ocrUpdatedAt: ocrFile.progress?.updatedAt,
      phraseCount: phrases.length,
      processedPages,
      failedPages: Number(ocrFile.progress?.failedPages || 0),
    },
    counts: {
      allTokens: allTokens.length,
      uniqueTokens: uniqueTokens.length,
      outputTokens: outputTokens.length,
    },
    tokens: outputTokens,
  } as MangaVocabularyFile;
}

export async function ocrRecognize(_event: IpcMainInvokeEvent, imagePathOrDataUrl: string, opts?: Record<string, any>) {
  if (!imagePathOrDataUrl) {
    throw new Error("No image provided for OCR");
  }

  await ensureOcrDirs();

  const settings = await getSettings();
  const { imagePath, cleanup } = await resolveWorkerInput(imagePathOrDataUrl);

  try {
    if (opts?.manualCropMode) {
      const raw = await callWorkerRecognize(imagePath, settings, { mode: "manual_crop" });
      return normalizeRawResult(raw, imagePath, false, {
        computedAt: new Date().toISOString(),
        forceRefreshUsed: true,
      });
    }

    const mangaContext = opts?.mangaId && opts?.mangaPath
      ? {
        id: String(opts.mangaId),
        title: String(opts.mangaTitle || path.basename(String(opts.mangaPath))),
        path: String(opts.mangaPath),
      }
      : null;

    const pageIndex = typeof opts?.pageIndex === "number" ? opts.pageIndex : undefined;
    const { result } = await recognizePageInternal(imagePath, settings, {
      forceRefresh: !!opts?.forceRefresh,
      manga: mangaContext,
      pageIndex,
      mode: "on_demand",
      passProfile: opts?.heavyPass ? "heavy" : "standard",
    });
    return result;
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

export async function ocrAddManualSelections(
  _event: IpcMainInvokeEvent,
  payload?: Record<string, any>
) {
  const mangaId = payload?.mangaId;
  const imagePathValue = payload?.imagePath;
  const pageIndexValue = payload?.pageIndex;
  const boxes = payload?.boxes;

  if (!mangaId) {
    throw new Error("Missing mangaId for manual OCR selection");
  }

  if (typeof imagePathValue !== "string" || !imagePathValue.trim()) {
    throw new Error("Missing imagePath for manual OCR selection");
  }

  if (typeof pageIndexValue !== "number" || !Number.isFinite(pageIndexValue) || pageIndexValue < 0) {
    throw new Error("Missing pageIndex for manual OCR selection");
  }

  const manga = await getMangaById(String(mangaId));
  if (!manga) {
    throw new Error("Manga not found");
  }

  const imagePath = resolveImagePath(imagePathValue);
  const result = await addManualBoxesToMangaPage(manga, imagePath, Math.floor(pageIndexValue), boxes as NormalizedBox[]);
  if (!result) {
    throw new Error("Unable to save manual OCR selections");
  }

  return result;
}

export async function ocrDeleteManualSelection(
  _event: IpcMainInvokeEvent,
  payload?: Record<string, any>
) {
  const mangaId = payload?.mangaId;
  const imagePathValue = payload?.imagePath;
  const pageIndexValue = payload?.pageIndex;
  const boxId = payload?.boxId;

  if (!mangaId) {
    throw new Error("Missing mangaId for manual OCR removal");
  }

  if (typeof imagePathValue !== "string" || !imagePathValue.trim()) {
    throw new Error("Missing imagePath for manual OCR removal");
  }

  if (typeof pageIndexValue !== "number" || !Number.isFinite(pageIndexValue) || pageIndexValue < 0) {
    throw new Error("Missing pageIndex for manual OCR removal");
  }

  if (typeof boxId !== "string" || !boxId.trim()) {
    throw new Error("Missing boxId for manual OCR removal");
  }

  const manga = await getMangaById(String(mangaId));
  if (!manga) {
    throw new Error("Manga not found");
  }

  const imagePath = resolveImagePath(imagePathValue);
  const result = await removeManualBoxFromMangaPage(manga, imagePath, Math.floor(pageIndexValue), boxId.trim());
  if (!result) {
    throw new Error("Unable to remove manual OCR selection");
  }

  return result;
}

export async function ocrGetMangaStatus(_event: IpcMainInvokeEvent, mangaId: string) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }
  return getMangaOcrStatusInternal(manga);
}

export async function ocrGetMangaCompletionMap(_event: IpcMainInvokeEvent, mangaIds?: string[]) {
  const requestedIds = Array.isArray(mangaIds) && mangaIds.length > 0
    ? new Set(mangaIds.map((id) => String(id)))
    : null;
  const mangas = (await getMangas())
    .filter((manga: any) => !requestedIds || requestedIds.has(String(manga.id)));

  const entries = await Promise.all(mangas.map(async (manga: any) => {
    const status = await getMangaOcrStatusInternal(manga);
    const totalPages = Math.max(Number(status.totalPages || 0), Number(status.progress?.totalPages || 0));
    const processedPages = Number(status.completedPages || 0) + Number(status.progress?.failedPages || 0);
    const hasCompleteOcr = !!status.exists && totalPages > 0 && processedPages >= totalPages;
    return [String(manga.id), hasCompleteOcr] as const;
  }));

  return Object.fromEntries(entries);
}

export async function ocrStartManga(_event: IpcMainInvokeEvent, mangaId: string, options?: Record<string, any>) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }
  return startMangaOcrInternal(manga, {
    ...(options || {}),
    priority: "user_requested",
  });
}

export async function ocrStartLibrary(_event: IpcMainInvokeEvent, options?: Record<string, any>) {
  const allMangas = await getMangas();
  const requestedIds = Array.isArray(options?.mangaIds)
    ? new Set(options.mangaIds.map((id: unknown) => String(id)))
    : null;
  const mangas = requestedIds
    ? allMangas.filter((manga: any) => requestedIds.has(String(manga.id)))
    : allMangas;
  const settings = await getSettings();
  const mode = options?.mode === "overwrite_all" ? "overwrite_all" : "missing_only";
  const queuedJobs: OcrQueueJobSnapshot[] = [];
  const skippedExisting: string[] = [];
  const skippedNonJapanese: Array<{ mangaId: string; title: string; detection: OcrLanguageDetection }> = [];
  const uncertain: Array<{ mangaId: string; title: string; detection: OcrLanguageDetection }> = [];

  for (const manga of mangas) {
    const status = await getMangaOcrStatusInternal(manga);
    if (mode === "missing_only" && status.exists && status.completedPages > 0) {
      skippedExisting.push(String(manga.id));
      continue;
    }

    const pageFiles = await listImageFiles(manga.path);
    const detection = await detectLanguageForManga(manga, pageFiles, settings, false);
    if (detection.status === "likely_non_japanese") {
      skippedNonJapanese.push({ mangaId: String(manga.id), title: String(manga.title), detection });
      continue;
    }
    if (detection.status === "uncertain") {
      uncertain.push({ mangaId: String(manga.id), title: String(manga.title), detection });
      continue;
    }

    queuedJobs.push(enqueueMangaQueueJob(manga, {
      overwrite: mode === "overwrite_all",
      mode: "full_manga",
      detection,
      priority: "background",
      heavyPass: !!options?.heavyPass,
    }));
  }

  return {
    scope: requestedIds ? "subset" : "library",
    requestedCount: mangas.length,
    queuedCount: queuedJobs.length,
    queuedJobs,
    skippedExisting,
    skippedNonJapanese,
    uncertain,
    status: await ocrGetQueueStatus(),
  };
}

export async function ocrQueueImportManga(manga: any) {
  const settings = await getSettings();
  if (!settings?.ocrAutoRunOnImport) {
    return { queued: false, reason: "auto-import-disabled" };
  }

  const pageFiles = await listImageFiles(manga.path);
  const detection = await detectLanguageForManga(manga, pageFiles, settings, false);

  if (detection.status !== "likely_japanese") {
    return {
      queued: false,
      reason: detection.status,
      detection,
    };
  }

  return {
    queued: true,
    job: enqueueMangaQueueJob(manga, {
      overwrite: false,
      mode: "full_manga",
      detection,
      priority: "background",
      heavyPass: false,
    }),
  };
}

export async function ocrReadMangaVocabulary(_event: IpcMainInvokeEvent, mangaId: string) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }

  return readMangaVocabularyForUi(manga.path);
}

export async function ocrExtractMangaVocabulary(
  _event: IpcMainInvokeEvent,
  mangaId: string,
  options?: Record<string, any>
) {
  const manga = await getMangaById(mangaId);
  if (!manga) {
    throw new Error("Manga not found");
  }

  const ensureResult = await ensureMangaOcrReadyForVocabularyExtraction(manga, options);
  if ((ensureResult as any)?.requiresConfirmation) {
    return ensureResult;
  }

  const settings = await getSettings();
  const apiKey = String(settings?.jpdbApiKey || "").trim();
  if (!apiKey) {
    throw new Error("JPDB API key not configured.");
  }

  const ocrFile = await readMangaOcrFile(manga.path);
  if (!ocrFile) {
    throw new Error("Le fichier OCR du manga est introuvable apres la fin du job.");
  }

  const mode = normalizeVocabularyMode(options?.mode);
  const vocabularyFile = await buildVocabularyFileFromOcr(manga, ocrFile, mode, apiKey);
  const savedVocabulary = await writeMangaVocabularyFile(manga.path, vocabularyFile);

  return {
    ok: true,
    status: await getMangaOcrStatusInternal(manga),
    vocabulary: {
      ...(await readMangaVocabularyForUi(manga.path)),
      tokens: savedVocabulary.tokens,
      csv: savedVocabulary.tokens.join(","),
    },
  };
}

export async function ocrGetQueueStatus() {
  const jobs = ocrQueueOrder
    .map((jobId) => ocrQueueJobs.get(jobId))
    .filter(Boolean)
    .map((job) => cloneQueueJob(job as OcrQueueJob));

  const counts = jobs.reduce((acc, job) => {
    acc.total += 1;
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {
    total: 0,
    queued: 0,
    detecting_language: 0,
    running: 0,
    paused: 0,
    completed: 0,
    error: 0,
    cancelled: 0,
  } as Record<string, number>);

  return {
    jobs,
    counts,
  };
}

export async function ocrPauseJob(_event: IpcMainInvokeEvent, jobId: string) {
  const job = ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  const wasQueued = job.status === "queued";
  touchQueueJob(job, {
    pauseRequested: true,
    status: wasQueued ? "paused" : job.status,
    message: "Pause demandee",
  });

  if (wasQueued) {
    touchQueueJob(job, { pauseRequested: false });
  }

  return cloneQueueJob(job);
}

export async function ocrResumeJob(_event: IpcMainInvokeEvent, jobId: string) {
  const job = ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  touchQueueJob(job, {
    status: "queued",
    pauseRequested: false,
    message: null,
  });
  scheduleQueueRun();
  return cloneQueueJob(job);
}

export async function ocrCancelJob(_event: IpcMainInvokeEvent, jobId: string) {
  const job = ocrQueueJobs.get(jobId);
  if (!job) {
    throw new Error("OCR job not found");
  }

  const shouldCancelNow = !["completed", "cancelled", "error"].includes(job.status);
  touchQueueJob(job, {
    cancelRequested: true,
    pauseRequested: false,
    status: shouldCancelNow ? "cancelled" : job.status,
    message: "Annulation demandee",
    completedAt: shouldCancelNow ? new Date().toISOString() : job.completedAt,
  });

  return cloneQueueJob(job);
}

export async function ocrCancelAllJobs() {
  const activeJobs = ocrQueueOrder
    .map((jobId) => ocrQueueJobs.get(jobId))
    .filter((job): job is OcrQueueJob => !!job)
    .filter((job) => !["completed", "cancelled", "error"].includes(job.status));

  for (const job of activeJobs) {
    touchQueueJob(job, {
      cancelRequested: true,
      pauseRequested: false,
      status: "cancelled",
      message: "Annulation demandee",
      completedAt: new Date().toISOString(),
    });
  }

  return {
    cancelledCount: activeJobs.length,
    status: await ocrGetQueueStatus(),
  };
}

export async function prewarmOcrEngine() {
  if (workerPrewarmPromise) {
    return workerPrewarmPromise;
  }

  workerPrewarmPromise = (async () => {
    const settings = await getSettings();
    await ensureOcrDirs();
    await callWorkerPrewarm(settings);
    return true;
  })();

  try {
    return await workerPrewarmPromise;
  } catch (error) {
    workerPrewarmPromise = null;
    throw error;
  }
}

export async function processOcrResult(res: any, originalPathOrDataUrl: string, _options?: Record<string, any>) {
  const { imagePath, cleanup } = await resolveWorkerInput(originalPathOrDataUrl);

  try {
    return await normalizeRawResult(res as RawOcrResult, imagePath, false);
  } finally {
    if (cleanup) {
      await cleanup();
    }
  }
}

export async function ocrTerminate() {
  if (!workerState) {
    return true;
  }

  try {
    await sendWorkerRequest(workerState, { type: "terminate" }, 5_000);
  } catch {
    // ignore and force-kill below
  }

  try {
    workerState.process.kill();
  } catch {
    // ignore
  }

  workerState = null;
  workerPrewarmPromise = null;
  return true;
}
