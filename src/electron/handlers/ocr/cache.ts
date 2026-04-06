import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { CACHE_SCHEMA_VERSION, OCR_CACHE_DIR } from "./constants";
import { getImageFingerprint, normalizeOcrPassProfile } from "./helpers";
import type { NormalizedOcrResult, OcrPassProfile } from "./types";

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
