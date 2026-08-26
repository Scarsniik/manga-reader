import type {
  ScraperAuthorFavoriteRecord,
  ScraperBookmarkFilterState,
  ScraperBookmarkRecord,
  ScraperTagFavoriteRecord,
} from "@/shared/scraper";
import type { ScraperTitleAnalysisConfigs } from "@/renderer/utils/scraperTitleAnalysisConfigs";
import { matchesScraperBookmarkSeriesFilter } from "@/renderer/components/ScraperBookmarks/bookmarkSeriesFiltering";
import {
  buildBookmarkTagStats,
  type BookmarkTagStat,
  type BookmarkTagStatsFuzzyMode,
} from "@/renderer/components/ScraperBookmarks/bookmarkTagStats";
import {
  buildBookmarkAuthorStatsFromCandidates,
  getBookmarkAuthorCandidates,
  getBookmarkAuthorStatsKey,
  type BookmarkAuthorCandidateSource,
  type BookmarkAuthorCompatibilityCache,
  type BookmarkAuthorStat,
} from "@/renderer/components/ScraperBookmarks/bookmarkAuthorStats";

export type BookmarkFrequentStatsKind = "tags" | "authors";

export type BookmarkFrequentStatsWorkerRequest = {
  analysisRevision: string;
  authorFavorites: ScraperAuthorFavoriteRecord[];
  bookmarks: ScraperBookmarkRecord[];
  cacheKey: string;
  configsByScraperId: ScraperTitleAnalysisConfigs;
  fuzzyMode: BookmarkTagStatsFuzzyMode;
  kind: BookmarkFrequentStatsKind;
  minOccurrences: number;
  requestId: number;
  seriesFilterMode: ScraperBookmarkFilterState["seriesFilterMode"];
  tagFavorites: ScraperTagFavoriteRecord[];
};

export type BookmarkFrequentStatsWorkerResponse = {
  authorStats: BookmarkAuthorStat[];
  bookmarkCount: number;
  error?: string;
  requestId: number;
  tagStats: BookmarkTagStat[];
};

type CachedBookmark = {
  bookmark: ScraperBookmarkRecord;
  fingerprint: string;
};

type DatasetCache = {
  analysisRevision: string;
  authorCandidatesByBookmarkKey: Map<string, BookmarkAuthorCandidateSource>;
  authorCompatibilityCache: BookmarkAuthorCompatibilityCache;
  bookmarksByKey: Map<string, CachedBookmark>;
  dataRevision: number;
  resultsBySettingsKey: Map<string, Omit<BookmarkFrequentStatsWorkerResponse, "requestId">>;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<BookmarkFrequentStatsWorkerRequest>) => void) | null;
  postMessage: (response: BookmarkFrequentStatsWorkerResponse) => void;
};

const MAX_DATASET_CACHE_COUNT = 6;
const MAX_RESULT_CACHE_COUNT = 12;
const datasetCaches = new Map<string, DatasetCache>();
const workerScope = globalThis as unknown as WorkerScope;

const createDatasetCache = (): DatasetCache => ({
  analysisRevision: "",
  authorCandidatesByBookmarkKey: new Map(),
  authorCompatibilityCache: new Map(),
  bookmarksByKey: new Map(),
  dataRevision: 0,
  resultsBySettingsKey: new Map(),
});

const getDatasetCache = (cacheKey: string): DatasetCache => {
  const current = datasetCaches.get(cacheKey);
  if (current) {
    datasetCaches.delete(cacheKey);
    datasetCaches.set(cacheKey, current);
    return current;
  }

  const created = createDatasetCache();
  datasetCaches.set(cacheKey, created);
  while (datasetCaches.size > MAX_DATASET_CACHE_COUNT) {
    const oldestKey = datasetCaches.keys().next().value as string | undefined;
    if (!oldestKey) break;
    datasetCaches.delete(oldestKey);
  }
  return created;
};

const getBookmarkFingerprint = (bookmark: ScraperBookmarkRecord): string => JSON.stringify(bookmark);

const synchronizeBookmarks = (
  cache: DatasetCache,
  bookmarks: ScraperBookmarkRecord[],
): boolean => {
  const nextKeys = new Set<string>();
  let changed = false;

  bookmarks.forEach((bookmark) => {
    const bookmarkKey = getBookmarkAuthorStatsKey(bookmark);
    const fingerprint = getBookmarkFingerprint(bookmark);
    nextKeys.add(bookmarkKey);
    if (cache.bookmarksByKey.get(bookmarkKey)?.fingerprint === fingerprint) {
      return;
    }

    cache.bookmarksByKey.set(bookmarkKey, { bookmark, fingerprint });
    cache.authorCandidatesByBookmarkKey.delete(bookmarkKey);
    changed = true;
  });

  Array.from(cache.bookmarksByKey.keys()).forEach((bookmarkKey) => {
    if (nextKeys.has(bookmarkKey)) return;
    cache.bookmarksByKey.delete(bookmarkKey);
    cache.authorCandidatesByBookmarkKey.delete(bookmarkKey);
    changed = true;
  });

  if (changed) {
    cache.dataRevision += 1;
    cache.resultsBySettingsKey.clear();
  }
  return changed;
};

const prepareAuthorCandidates = (
  cache: DatasetCache,
  bookmarks: ScraperBookmarkRecord[],
  configsByScraperId: ScraperTitleAnalysisConfigs,
  analysisRevision: string,
) => {
  if (cache.analysisRevision !== analysisRevision) {
    cache.analysisRevision = analysisRevision;
    cache.authorCandidatesByBookmarkKey.clear();
    cache.authorCompatibilityCache.clear();
    cache.resultsBySettingsKey.clear();
  }

  bookmarks.forEach((bookmark) => {
    const bookmarkKey = getBookmarkAuthorStatsKey(bookmark);
    if (cache.authorCandidatesByBookmarkKey.has(bookmarkKey)) return;
    cache.authorCandidatesByBookmarkKey.set(bookmarkKey, {
      authorNames: bookmark.authors,
      authorUrls: bookmark.authorUrls,
      bookmarkKey,
      candidates: getBookmarkAuthorCandidates(bookmark, configsByScraperId),
      cover: bookmark.cover,
      coverRefererUrl: bookmark.sourceUrl,
      coverTitle: bookmark.title,
      scraperId: bookmark.scraperId,
    });
  });
};

const buildSettingsKey = (
  request: BookmarkFrequentStatsWorkerRequest,
  dataRevision: number,
): string => JSON.stringify({
  analysisRevision: request.analysisRevision,
  authorFavorites: request.kind === "authors" ? request.authorFavorites : [],
  dataRevision,
  fuzzyMode: request.kind === "tags" ? request.fuzzyMode : "off",
  kind: request.kind,
  minOccurrences: request.minOccurrences,
  seriesFilterMode: request.seriesFilterMode,
  tagFavorites: request.kind === "tags" ? request.tagFavorites : [],
});

const cacheResult = (
  cache: DatasetCache,
  settingsKey: string,
  result: Omit<BookmarkFrequentStatsWorkerResponse, "requestId">,
) => {
  cache.resultsBySettingsKey.set(settingsKey, result);
  while (cache.resultsBySettingsKey.size > MAX_RESULT_CACHE_COUNT) {
    const oldestKey = cache.resultsBySettingsKey.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.resultsBySettingsKey.delete(oldestKey);
  }
};

workerScope.onmessage = (event) => {
  const request = event.data;
  try {
    const cache = getDatasetCache(request.cacheKey);
    synchronizeBookmarks(cache, request.bookmarks);
    const bookmarks = Array.from(cache.bookmarksByKey.values())
      .map((entry) => entry.bookmark)
      .filter((bookmark) => matchesScraperBookmarkSeriesFilter(
        bookmark,
        request.seriesFilterMode,
        request.configsByScraperId,
      ));
    const settingsKey = buildSettingsKey(request, cache.dataRevision);
    const cachedResult = cache.resultsBySettingsKey.get(settingsKey);
    if (cachedResult) {
      workerScope.postMessage({ ...cachedResult, requestId: request.requestId });
      return;
    }

    let tagStats: BookmarkTagStat[] = [];
    let authorStats: BookmarkAuthorStat[] = [];
    if (request.kind === "tags") {
      tagStats = buildBookmarkTagStats(bookmarks, {
        fuzzyMode: request.fuzzyMode,
        minOccurrences: request.minOccurrences,
        tagFavorites: request.tagFavorites,
      });
    } else {
      prepareAuthorCandidates(
        cache,
        bookmarks,
        request.configsByScraperId,
        request.analysisRevision,
      );
      const activeBookmarkKeys = new Set(bookmarks.map(getBookmarkAuthorStatsKey));
      authorStats = buildBookmarkAuthorStatsFromCandidates(
        Array.from(cache.authorCandidatesByBookmarkKey.entries())
          .filter(([bookmarkKey]) => activeBookmarkKeys.has(bookmarkKey))
          .map(([, source]) => source),
        {
          minOccurrences: request.minOccurrences,
          authorFavorites: request.authorFavorites,
          compatibilityCache: cache.authorCompatibilityCache,
        },
      );
    }

    const result = {
      authorStats,
      bookmarkCount: bookmarks.length,
      tagStats,
    };
    cacheResult(cache, settingsKey, result);
    workerScope.postMessage({ ...result, requestId: request.requestId });
  } catch (error) {
    workerScope.postMessage({
      authorStats: [],
      bookmarkCount: 0,
      error: error instanceof Error ? error.message : "Le calcul des comptages a échoué.",
      requestId: request.requestId,
      tagStats: [],
    });
  }
};
