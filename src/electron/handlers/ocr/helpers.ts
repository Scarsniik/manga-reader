import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { ensureDataDir } from "../../utils";
import {
  MANGA_OCR_FILE_NAME,
  MANGA_OCR_PROFILE_FILE_NAME,
  MANGA_VOCABULARY_FILE_NAME,
  OCR_CACHE_DIR,
  OCR_TEMP_DIR,
  WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS,
  WINDOWS_TRANSIENT_FS_ERROR_CODES,
} from "./constants";
import type {
  MangaOcrPageEntry,
  MangaVocabularyMode,
  NormalizedBox,
  NormalizedPageBlock,
  OcrPassProfile,
  OcrQueueJobMode,
} from "./types";

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OCR_TEXT_SEGMENT_SPLIT_RE = /[\s\u3000、。．，,・･…‥！？!?：:；;「」『』（）()［］\[\]【】〈〉《》]+/u;
const OCR_WORD_LIKE_CHAR_RE = /[0-9A-Za-z\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/u;

export const countMeaningfulOcrChars = (text: string) => (
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
  meaningfulChars: number,
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

export const getOcrBlockFilterReason = (block: NormalizedPageBlock): string | null => {
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

export const resolveImagePath = (imagePathOrDataUrl: string): string => {
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

export async function ensureOcrDirs() {
  await ensureDataDir();
  await fs.mkdir(OCR_CACHE_DIR, { recursive: true });
  await fs.mkdir(OCR_TEMP_DIR, { recursive: true });
}

export async function resolveWorkerInput(
  imagePathOrDataUrl: string,
): Promise<{ imagePath: string; cleanup?: () => Promise<void> }> {
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

export async function getImageFingerprint(imagePath: string) {
  const stat = await fs.stat(imagePath);
  return {
    imagePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export function normalizeOcrPassProfile(value: unknown): OcrPassProfile {
  return value === "heavy" ? "heavy" : "standard";
}

export function getStoredEntryPassProfile(entry?: MangaOcrPageEntry | null): OcrPassProfile {
  return normalizeOcrPassProfile(entry?.passProfile ?? "heavy");
}

export function doesStoredPassProfileSatisfy(requested: OcrPassProfile, stored?: OcrPassProfile | null) {
  const normalizedRequested = normalizeOcrPassProfile(requested);
  const normalizedStored = normalizeOcrPassProfile(stored ?? "heavy");
  if (normalizedRequested === "standard") {
    return normalizedStored === "standard" || normalizedStored === "heavy";
  }
  return normalizedStored === "heavy";
}

export const getMangaOcrFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_OCR_FILE_NAME);
export const getMangaOcrProfileFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_OCR_PROFILE_FILE_NAME);
export const getMangaVocabularyFilePath = (mangaPath: string) => path.join(mangaPath, MANGA_VOCABULARY_FILE_NAME);

export const toLocalFileUrl = (filePath: string) => pathToFileURL(filePath).href.replace(/^file:\/\//, "local://");

export async function writeJsonFileAtomically(targetPath: string, tempPath: string, content: string) {
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

  // On Windows, replacing an existing JSON file can fail transiently if another
  // part of the app is polling the file at the same time. Retry the direct write
  // fallback as well instead of failing the whole OCR job on the first collision.
  try {
    for (let attempt = 0; attempt <= WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS.length; attempt += 1) {
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
        const code = String(fallbackError?.code || "");
        if (!WINDOWS_TRANSIENT_FS_ERROR_CODES.has(code) || attempt >= WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS.length) {
          break;
        }

        await delay(WINDOWS_ATOMIC_WRITE_RETRY_DELAYS_MS[attempt]);
      }
    }
  } catch {
    // ignore: lastError already captured above
  }

  try {
    await fs.unlink(tempPath);
  } catch {
    // ignore temp cleanup failures
  }

  throw lastError;
}

export function normalizeManualBoxes(boxes: unknown): NormalizedBox[] {
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

export function buildMangaPageKey(pageIndex?: number | null, imagePath?: string | null) {
  if (typeof pageIndex === "number" && Number.isFinite(pageIndex) && pageIndex >= 0) {
    return String(pageIndex + 1).padStart(4, "0");
  }

  if (imagePath) {
    return path.basename(imagePath);
  }

  return randomUUID();
}

export function normalizeMangaOcrProgressMode(value: unknown): OcrQueueJobMode {
  return value === "full_manga" ? "full_manga" : "on_demand";
}

export function countJapaneseChars(text: string) {
  return Array.from(text).reduce((count, char) => {
    const code = char.codePointAt(0) || 0;
    const isHiragana = code >= 0x3040 && code <= 0x309f;
    const isKatakana = code >= 0x30a0 && code <= 0x30ff;
    const isKanji = (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff);
    return count + (isHiragana || isKatakana || isKanji ? 1 : 0);
  }, 0);
}

export function countLatinChars(text: string) {
  return Array.from(text).reduce((count, char) => count + (/[A-Za-z]/.test(char) ? 1 : 0), 0);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
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

export function normalizeVocabularyMode(value: unknown): MangaVocabularyMode {
  return value === "all" ? "all" : "unique";
}

export async function findExistingPath(candidates: string[]) {
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

export function collectAncestorDirs(startPath: string) {
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

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function collectExistingPaths(candidates: string[]) {
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
