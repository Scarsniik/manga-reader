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

const normalizeCacheIdentity = (value: unknown): string => {
  const normalized = normalizeUrl(value);
  try {
    const url = new URL(normalized);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString().replace(/%[0-9a-f]{2}/gi, (encodedByte) => encodedByte.toUpperCase());
  } catch {
    return normalized.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase();
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
    authorUrls: normalizeStringList(raw.authorUrls),
    authorNames: normalizeStringList(raw.authorNames),
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
  if (!result?.detailUrl) {
    return null;
  }

  const pageIndex = Number(raw.pageIndex);
  return {
    pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
    searchTerm: normalizeString(raw.searchTerm),
    result,
  };
};

const deduplicateCachedResults = (
  results: ScraperAuthorFavoriteCachedResult[],
): ScraperAuthorFavoriteCachedResult[] => {
  const seenKeys = new Set<string>();
  return results.filter((cachedResult) => {
    const key = cachedResult.result.detailUrl
      ? `url:${normalizeCacheIdentity(cachedResult.result.detailUrl)}`
      : `title:${cachedResult.result.title.normalize("NFKC").trim().toLocaleLowerCase()}`;
    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });
};

const sanitizeCacheSource = (value: unknown): ScraperAuthorFavoriteCacheSource | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<ScraperAuthorFavoriteCacheSource>;
  const scraperId = normalizeString(raw.scraperId);
  const authorUrl = normalizeUrl(raw.authorUrl);
  const sourceName = normalizeString(raw.sourceName) || authorUrl;
  const results = deduplicateCachedResults(Array.isArray(raw.results)
    ? raw.results
      .map((result) => sanitizeCachedResult(result))
      .filter((result): result is ScraperAuthorFavoriteCachedResult => Boolean(result))
    : []);

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

const deduplicateCacheSources = (
  sources: ScraperAuthorFavoriteCacheSource[],
): ScraperAuthorFavoriteCacheSource[] => {
  const deduplicatedSources: ScraperAuthorFavoriteCacheSource[] = [];
  const sourceIndexByIdentity = new Map<string, number>();
  sources.forEach((source) => {
    const identities = Array.from(new Set(
      [source.authorUrl, source.currentPageUrl]
        .filter((target): target is string => Boolean(target?.trim()))
        .map((target) => `${source.scraperId}::${normalizeCacheIdentity(target)}`),
    ));
    const existingIndex = identities
      .map((identity) => sourceIndexByIdentity.get(identity))
      .find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const sourceIndex = deduplicatedSources.push(source) - 1;
      identities.forEach((identity) => sourceIndexByIdentity.set(identity, sourceIndex));
      return;
    }

    const existing = deduplicatedSources[existingIndex];
    deduplicatedSources[existingIndex] = {
      ...source,
      ...existing,
      loadedPages: Math.max(existing.loadedPages, source.loadedPages),
      hasNextPage: existing.hasNextPage && source.hasNextPage,
      currentPageUrl: existing.currentPageUrl ?? source.currentPageUrl,
      nextPageUrl: existing.nextPageUrl ?? source.nextPageUrl,
      results: deduplicateCachedResults([...existing.results, ...source.results]),
      updatedAt: existing.updatedAt > source.updatedAt ? existing.updatedAt : source.updatedAt,
    };
    const existingIdentities = [existing.authorUrl, existing.currentPageUrl]
      .filter((target): target is string => Boolean(target?.trim()))
      .map((target) => `${existing.scraperId}::${normalizeCacheIdentity(target)}`);
    [...existingIdentities, ...identities]
      .forEach((identity) => sourceIndexByIdentity.set(identity, existingIndex));
  });
  return deduplicatedSources;
};

const sanitizeCacheRecord = (
  favoriteId: string,
  value: unknown,
): ScraperAuthorFavoriteCacheRecord => {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<ScraperAuthorFavoriteCacheRecord>
    : {};
  const sources = deduplicateCacheSources(Array.isArray(raw.sources)
    ? raw.sources
      .map((source) => sanitizeCacheSource(source))
      .filter((source): source is ScraperAuthorFavoriteCacheSource => Boolean(source))
    : []);
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
