import { IpcMainInvokeEvent, app } from "electron";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";
import readline from "readline";
import { dataDir, ensureDataDir, getImageSize } from "../utils";
import { getSettings } from "./params";

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
};

type NormalizedBox = {
  id: string;
  text: string;
  bbox: { x: number; y: number; w: number; h: number };
  vertical?: boolean;
  lines?: string[];
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

const OCR_CACHE_DIR = path.join(dataDir, "ocr-cache");
const OCR_TEMP_DIR = path.join(dataDir, "ocr-temp");
const CACHE_SCHEMA_VERSION = "mokuro-page-v2";
const WORKER_BOOT_TIMEOUT_MS = 20_000;
const WORKER_REQUEST_TIMEOUT_MS = 5 * 60_000;

let workerState: OcrWorkerState | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
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

const getOcrBlockFilterReason = (block: NormalizedPageBlock): string | null => {
  const compactText = block.text.replace(/\s+/g, "");
  if (!compactText) {
    return "empty-text";
  }

  const totalChars = Array.from(compactText).length;
  const meaningfulChars = countMeaningfulOcrChars(compactText);
  if (meaningfulChars === 0 && totalChars >= 6) {
    return "punctuation-only";
  }

  if (totalChars >= 8 && meaningfulChars / totalChars < 0.25) {
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

function buildCacheKey(fingerprint: { imagePath: string; size: number; mtimeMs: number }) {
  return createHash("sha1")
    .update(CACHE_SCHEMA_VERSION)
    .update("\0")
    .update(fingerprint.imagePath)
    .update("\0")
    .update(String(fingerprint.size))
    .update("\0")
    .update(String(fingerprint.mtimeMs))
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
    return { ...parsed, fromCache: true };
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

async function findExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // ignore missing candidates
    }
  }
  return null;
}

async function resolveWorkerScriptPath() {
  return findExistingPath([
    path.join(app.getAppPath(), "scripts", "ocr_worker.py"),
    path.join(process.cwd(), "scripts", "ocr_worker.py"),
  ]);
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

function buildCandidateRoots(settings: any): string[] {
  const roots: string[] = [];
  const appRoots = uniqueStrings([app.getAppPath(), process.cwd()]);

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

function buildWorkerEnvironment(settings: any) {
  const candidateRoots = buildCandidateRoots(settings);

  return {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    MANGA_HELPER_OCR_CANDIDATE_ROOTS: candidateRoots.join(path.delimiter),
    MANGA_HELPER_OCR_FORCE_CPU: settings?.ocrForceCpu ? "1" : "0",
  };
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

  const scriptPath = await resolveWorkerScriptPath();
  if (!scriptPath) {
    throw new Error("OCR worker script not found. Expected scripts/ocr_worker.py in the application.");
  }

  const pythonExecutable = String(
    settings?.ocrPythonPath
    || process.env.MANGA_HELPER_PYTHON
    || process.env.PYTHON
    || "python"
  );

  const proc = spawn(pythonExecutable, ["-u", scriptPath], {
    cwd: app.getAppPath(),
    env: buildWorkerEnvironment(settings),
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

async function callWorkerRecognize(imagePath: string, settings: any): Promise<RawOcrResult> {
  const state = await ensureWorker(settings);
  const response = await sendWorkerRequest(state, { type: "recognize", imagePath });

  if (!response.ok) {
    const details = [response.error, response.python ? `python=${response.python}` : "", response.candidatePaths?.length ? `candidatePaths=${response.candidatePaths.join(", ")}` : ""]
      .filter(Boolean)
      .join(" | ");
    throw new Error(details || "Unknown OCR worker error");
  }

  return (response.result || {}) as RawOcrResult;
}

async function normalizeRawResult(raw: RawOcrResult, sourceImagePath: string, fromCache: boolean): Promise<NormalizedOcrResult> {
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

export async function ocrRecognize(_event: IpcMainInvokeEvent, imagePathOrDataUrl: string, opts?: Record<string, any>) {
  if (!imagePathOrDataUrl) {
    throw new Error("No image provided for OCR");
  }

  await ensureOcrDirs();

  const settings = await getSettings();
  const { imagePath, cleanup } = await resolveWorkerInput(imagePathOrDataUrl);

  try {
    const fingerprint = await getImageFingerprint(imagePath);
    const cacheKey = buildCacheKey(fingerprint);
    const forceRefresh = !!opts?.forceRefresh;

    if (forceRefresh) {
      await deleteCache(cacheKey);
    } else {
      const cached = await readCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const raw = await callWorkerRecognize(imagePath, settings);
    const normalized = await normalizeRawResult(raw, imagePath, false);
    await writeCache(cacheKey, normalized);
    return normalized;
  } finally {
    if (cleanup) {
      await cleanup();
    }
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
  return true;
}
