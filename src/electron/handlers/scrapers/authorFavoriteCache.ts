import { promises as fs } from "fs";
import path from "path";
import { type IpcMainInvokeEvent } from "electron";
import {
  type SaveScraperAuthorFavoriteCacheRequest,
  type ScraperAuthorFavoriteCachedResult,
  type ScraperAuthorFavoriteCacheRecord,
  type ScraperAuthorFavoriteCacheSource,
  type ScraperSearchResultItem,
} from "../../scraper";
import {
  ensureScraperAuthorFavoriteCacheDir,
  scraperAuthorFavoriteCacheDir,
} from "../../utils";

const CACHE_FILE_SAFE_CHARACTER_PATTERN = /[^a-zA-Z0-9_-]/g;

let authorFavoriteCacheQueue: Promise<void> = Promise.resolve();

const runAuthorFavoriteCacheOperation = async <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const previousOperation = authorFavoriteCacheQueue;
  let releaseOperation: () => void = () => undefined;

  authorFavoriteCacheQueue = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });

  await previousOperation.catch(() => undefined);

  try {
    return await operation();
  } finally {
    releaseOperation();
  }
};

const normalizeString = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalString = (value: unknown): string | undefined => {
  const normalized = normalizeString(value);
  return normalized || undefined;
};

const normalizeStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => normalizeString(item))
    .filter(Boolean);

  return normalized.length ? Array.from(new Set(normalized)) : undefined;
};

const normalizeUrl = (value: unknown): string => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  try {
    return new URL(normalized).toString();
  } catch {
    return normalized;
  }
};

const getFavoriteCacheFilePath = (favoriteId: string): string => {
  const normalizedFavoriteId = normalizeString(favoriteId);
  if (!normalizedFavoriteId) {
    throw new Error("L'identifiant de favori auteur est requis.");
  }

  const safeFavoriteId = normalizedFavoriteId.replace(CACHE_FILE_SAFE_CHARACTER_PATTERN, "_");
  return path.join(scraperAuthorFavoriteCacheDir, `${safeFavoriteId}.json`);
};

const sanitizeSearchResult = (value: unknown): ScraperSearchResultItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ScraperSearchResultItem>;
  const title = normalizeString(raw.title);
  if (!title) {
    return null;
  }

  return {
    title,
    detailUrl: normalizeOptionalString(raw.detailUrl),
    authorUrl: normalizeOptionalString(raw.authorUrl),
    thumbnailUrl: normalizeOptionalString(raw.thumbnailUrl),
    summary: normalizeOptionalString(raw.summary),
    pageCount: normalizeOptionalString(raw.pageCount),
    languageCodes: normalizeStringList(raw.languageCodes),
  };
};

const sanitizeCachedResult = (value: unknown): ScraperAuthorFavoriteCachedResult | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ScraperAuthorFavoriteCachedResult>;
  const result = sanitizeSearchResult(raw.result);
  if (!result) {
    return null;
  }

  const pageIndex = Number(raw.pageIndex);
  return {
    pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
    searchTerm: normalizeString(raw.searchTerm),
    result,
  };
};

const sanitizeCacheSource = (value: unknown): ScraperAuthorFavoriteCacheSource | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ScraperAuthorFavoriteCacheSource>;
  const scraperId = normalizeString(raw.scraperId);
  const authorUrl = normalizeUrl(raw.authorUrl);
  const sourceName = normalizeString(raw.sourceName) || authorUrl;
  const results = Array.isArray(raw.results)
    ? raw.results
      .map((result) => sanitizeCachedResult(result))
      .filter((result): result is ScraperAuthorFavoriteCachedResult => Boolean(result))
    : [];

  if (!scraperId || !authorUrl) {
    return null;
  }

  const loadedPages = Number(raw.loadedPages);
  return {
    key: normalizeString(raw.key) || `${scraperId}::${authorUrl}`,
    scraperId,
    authorUrl,
    sourceName,
    loadedPages: Number.isFinite(loadedPages) ? Math.max(0, Math.floor(loadedPages)) : 0,
    hasNextPage: Boolean(raw.hasNextPage),
    currentPageUrl: normalizeOptionalString(raw.currentPageUrl),
    nextPageUrl: normalizeOptionalString(raw.nextPageUrl),
    results,
    updatedAt: normalizeString(raw.updatedAt) || new Date().toISOString(),
  };
};

const sanitizeCacheRecord = (
  favoriteId: string,
  value: unknown,
): ScraperAuthorFavoriteCacheRecord => {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<ScraperAuthorFavoriteCacheRecord>
    : {};
  const sources = Array.isArray(raw.sources)
    ? raw.sources
      .map((source) => sanitizeCacheSource(source))
      .filter((source): source is ScraperAuthorFavoriteCacheSource => Boolean(source))
    : [];
  const now = new Date().toISOString();

  return {
    favoriteId: normalizeString(raw.favoriteId) || favoriteId,
    favoriteUpdatedAt: normalizeOptionalString(raw.favoriteUpdatedAt),
    cachedAt: normalizeString(raw.cachedAt) || now,
    completedAt: normalizeOptionalString(raw.completedAt),
    sources,
  };
};

const writeCacheFile = async (cache: ScraperAuthorFavoriteCacheRecord): Promise<void> => {
  await ensureScraperAuthorFavoriteCacheDir();
  const targetPath = getFavoriteCacheFilePath(cache.favoriteId);
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;

  await fs.writeFile(temporaryPath, JSON.stringify(cache, null, 2), "utf-8");
  await fs.rename(temporaryPath, targetPath);
};

export async function getScraperAuthorFavoriteCache(
  _event: IpcMainInvokeEvent,
  favoriteId: string,
): Promise<ScraperAuthorFavoriteCacheRecord | null> {
  return runAuthorFavoriteCacheOperation(async () => {
    try {
      const targetPath = getFavoriteCacheFilePath(favoriteId);
      const data = await fs.readFile(targetPath, "utf-8");
      return sanitizeCacheRecord(favoriteId, JSON.parse(data));
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        return null;
      }

      console.warn("Failed to read scraper author favorite cache", error);
      return null;
    }
  });
}

export async function saveScraperAuthorFavoriteCache(
  _event: IpcMainInvokeEvent,
  request: SaveScraperAuthorFavoriteCacheRequest,
): Promise<ScraperAuthorFavoriteCacheRecord> {
  return runAuthorFavoriteCacheOperation(async () => {
    const favoriteId = normalizeString(request?.favoriteId);
    const cache = sanitizeCacheRecord(favoriteId, request?.cache);

    await writeCacheFile(cache);
    return cache;
  });
}

export async function removeScraperAuthorFavoriteCache(
  _event: IpcMainInvokeEvent | undefined,
  favoriteId: string,
): Promise<boolean> {
  return runAuthorFavoriteCacheOperation(async () => {
    try {
      await fs.rm(getFavoriteCacheFilePath(favoriteId), { force: true });
      return true;
    } catch (error) {
      console.warn("Failed to remove scraper author favorite cache", error);
      return false;
    }
  });
}
