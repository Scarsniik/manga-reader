import { buildCacheKey, deleteCache, readCache, writeCache } from "./cache";
import { getImageFingerprint, normalizeOcrPassProfile } from "./helpers";
import {
  persistPageResultForManga,
  readStoredPageFromMangaFile,
} from "./manga-file";
import { callWorkerRecognize, normalizeRawResult } from "./worker";
import type { OcrPassProfile, OcrQueueJobMode } from "./types";

export async function recognizePageInternal(
  imagePath: string,
  settings: any,
  options?: {
    forceRefresh?: boolean;
    manga?: any;
    pageIndex?: number;
    mode?: OcrQueueJobMode | "on_demand";
    passProfile?: OcrPassProfile;
  },
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
