import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { CACHE_SCHEMA_VERSION, OCR_CACHE_DIR } from "./constants";
import { getImageFingerprint, normalizeOcrPassProfile } from "./helpers";
import type { NormalizedBox, NormalizedOcrResult, NormalizedPageBlock, OcrPassProfile } from "./types";

export function buildCacheKey(
  fingerprint: { imagePath: string; size: number; mtimeMs: number },
  passProfile: OcrPassProfile = "standard",
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

export async function readCache(cacheKey: string): Promise<NormalizedOcrResult | null> {
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

export async function writeCache(cacheKey: string, result: NormalizedOcrResult) {
  const cachePath = getCachePath(cacheKey);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(result, null, 2), "utf-8");
}

const getEditedTextLines = (text: string): string[] => (
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
);

const updateBoxesText = (
  boxes: NormalizedBox[],
  boxId: string,
  text: string,
  textEditedAt: string,
) => {
  let updated = false;
  const lines = getEditedTextLines(text);
  const nextBoxes = boxes.map((box) => {
    if (box.id !== boxId) {
      return box;
    }

    updated = true;
    return {
      ...box,
      text,
      lines,
      textEditedAt,
    };
  });

  return { boxes: nextBoxes, updated };
};

const updateBlocksText = (
  blocks: NormalizedPageBlock[],
  boxId: string,
  text: string,
  textEditedAt: string,
) => {
  const lines = getEditedTextLines(text);

  return blocks.map((block) => {
    if (block.id !== boxId) {
      return block;
    }

    return {
      ...block,
      text,
      textEditedAt,
      lines: lines.map((line, index) => ({
        ...(Array.isArray(block.lines) ? block.lines[index] : undefined),
        text: line,
      })),
    };
  });
};

export function updateOcrResultBoxText(
  result: NormalizedOcrResult,
  boxId: string,
  text: string,
  textEditedAt: string = new Date().toISOString(),
) {
  const nextBoxes = updateBoxesText(Array.isArray(result.boxes) ? result.boxes : [], boxId, text, textEditedAt);
  if (!nextBoxes.updated) {
    return { result, updated: false };
  }

  return {
    updated: true,
    result: {
      ...result,
      boxes: nextBoxes.boxes,
      page: result.page
        ? {
          ...result.page,
          blocks: updateBlocksText(
            Array.isArray(result.page.blocks) ? result.page.blocks : [],
            boxId,
            text,
            textEditedAt,
          ),
        }
        : result.page,
    },
  };
}

export async function updateCacheBoxTextForImagePath(
  imagePath: string,
  boxId: string,
  text: string,
) {
  const fingerprint = await getImageFingerprint(imagePath);
  const textEditedAt = new Date().toISOString();
  let updatedResult: NormalizedOcrResult | null = null;

  for (const passProfile of ["standard", "heavy"] as const) {
    const cacheKey = buildCacheKey(fingerprint, passProfile);
    const cached = await readCache(cacheKey);
    if (!cached) {
      continue;
    }

    const updated = updateOcrResultBoxText(cached, boxId, text, textEditedAt);
    if (!updated.updated) {
      continue;
    }

    await writeCache(cacheKey, {
      ...updated.result,
      debug: {
        ...(updated.result.debug || {
          cacheKey,
          computedAt: new Date(0).toISOString(),
          forceRefreshUsed: false,
          fromCache: true,
        }),
        cacheKey,
        fromCache: true,
        source: "app-cache",
      },
    });
    updatedResult = updated.result;
  }

  return updatedResult;
}

export async function deleteCache(cacheKey: string) {
  const cachePath = getCachePath(cacheKey);
  try {
    await fs.unlink(cachePath);
  } catch {
    // ignore missing cache entries
  }
}

export async function invalidateCacheForImagePath(imagePath: string) {
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
