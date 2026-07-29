import type {
  ListingBackgroundInput,
  ListingBackgroundSource,
} from "@/shared/backgroundSearch";
import type {
  ScraperAuthorFavoriteCachedResult,
  ScraperAuthorFavoriteCacheRecord,
  ScraperAuthorFavoriteCacheSource,
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
} from "@/shared/scraper";
import type {
  BackgroundListingRun,
  ListingBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import { normalizeAuthorCorrespondenceTarget } from "@/renderer/utils/authorCorrespondenceIdentity";

const normalizeCachedResultKey = (cachedResult: ScraperAuthorFavoriteCachedResult): string => {
  const detailUrl = cachedResult.result.detailUrl?.trim();
  if (detailUrl) {
    return `url:${normalizeAuthorCorrespondenceTarget(detailUrl)}`;
  }

  return `title:${cachedResult.result.title.normalize("NFKC").trim().toLocaleLowerCase()}`;
};

export const DEFAULT_LATEST_AUTHOR_CACHE_MAX_AGE_HOURS = 24;
export const MAX_LATEST_AUTHOR_CACHE_MAX_AGE_HOURS = 8760;

export const normalizeLatestAuthorCacheMaxAgeHours = (value: unknown): number => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed)
    ? Math.min(MAX_LATEST_AUTHOR_CACHE_MAX_AGE_HOURS, Math.max(1, parsed))
    : DEFAULT_LATEST_AUTHOR_CACHE_MAX_AGE_HOURS;
};

const getSourceTargetIdentities = (
  scraperId: string,
  targets: Array<string | undefined>,
): Set<string> => new Set(
  targets
    .filter((target): target is string => Boolean(target?.trim()))
    .map((target) => `${scraperId}::${normalizeAuthorCorrespondenceTarget(target)}`),
);

export const findAuthorFavoriteCachedSource = (
  source: ScraperAuthorFavoriteSource,
  cache: ScraperAuthorFavoriteCacheRecord,
): ScraperAuthorFavoriteCacheSource | null => {
  const sourceIdentities = getSourceTargetIdentities(source.scraperId, [source.authorUrl]);
  return cache.sources.find((cachedSource) => (
    Array.from(getSourceTargetIdentities(cachedSource.scraperId, [
      cachedSource.authorUrl,
      cachedSource.currentPageUrl,
    ])).some((identity) => sourceIdentities.has(identity))
  )) ?? null;
};

export const isAuthorFavoriteCacheUsable = (
  favorite: ScraperAuthorFavoriteRecord,
  cache: ScraperAuthorFavoriteCacheRecord | null,
  maxAgeHours: unknown,
  now = Date.now(),
): cache is ScraperAuthorFavoriteCacheRecord => {
  if (
    !cache
    || cache.favoriteId !== favorite.id
    || !cache.sources.length
    || cache.sources.some((source) => source.hasNextPage)
  ) {
    return false;
  }

  const cachedAt = Date.parse(cache.cachedAt);
  const completedAt = Date.parse(cache.completedAt ?? "");
  if (!Number.isFinite(cachedAt) || !Number.isFinite(completedAt)) {
    return false;
  }

  const maxAgeMs = normalizeLatestAuthorCacheMaxAgeHours(maxAgeHours) * 60 * 60 * 1000;
  if (Math.max(0, now - cachedAt) > maxAgeMs) {
    return false;
  }

  const favoriteUpdatedAt = Date.parse(favorite.updatedAt);
  if (Number.isFinite(favoriteUpdatedAt) && favoriteUpdatedAt > cachedAt) {
    return false;
  }

  return !cache.favoriteUpdatedAt || cache.favoriteUpdatedAt === favorite.updatedAt;
};

export const loadUsableAuthorFavoriteCaches = async (
  favorites: ScraperAuthorFavoriteRecord[],
  maxAgeHours: unknown,
  getCache: (favoriteId: string) => Promise<ScraperAuthorFavoriteCacheRecord | null>,
  now = Date.now(),
): Promise<Map<string, ScraperAuthorFavoriteCacheRecord>> => {
  const cacheEntries = await Promise.all(favorites.map(async (favorite) => {
    try {
      const cache = await getCache(favorite.id);
      return isAuthorFavoriteCacheUsable(favorite, cache, maxAgeHours, now)
        ? [favorite.id, cache] as const
        : null;
    } catch {
      return null;
    }
  }));

  return new Map(cacheEntries.filter(
    (entry): entry is readonly [string, ScraperAuthorFavoriteCacheRecord] => entry !== null,
  ));
};

const mergeCachedResults = (
  preferredResults: ScraperAuthorFavoriteCachedResult[],
  fallbackResults: ScraperAuthorFavoriteCachedResult[],
): ScraperAuthorFavoriteCachedResult[] => {
  const seenKeys = new Set<string>();
  return [...preferredResults, ...fallbackResults].filter((cachedResult) => {
    const key = normalizeCachedResultKey(cachedResult);
    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });
};

const getCacheSourceIdentities = (
  source: ScraperAuthorFavoriteCacheSource,
): string[] => Array.from(new Set(
  [source.authorUrl, source.currentPageUrl]
    .filter((target): target is string => Boolean(target?.trim()))
    .map((target) => (
      `${source.scraperId}::${normalizeAuthorCorrespondenceTarget(target)}`
    )),
));

const mergeCacheSource = (
  preferredSource: ScraperAuthorFavoriteCacheSource,
  fallbackSource: ScraperAuthorFavoriteCacheSource,
): ScraperAuthorFavoriteCacheSource => ({
  ...fallbackSource,
  ...preferredSource,
  loadedPages: Math.max(preferredSource.loadedPages, fallbackSource.loadedPages),
  hasNextPage: preferredSource.hasNextPage && fallbackSource.hasNextPage,
  currentPageUrl: preferredSource.currentPageUrl ?? fallbackSource.currentPageUrl,
  nextPageUrl: preferredSource.nextPageUrl ?? fallbackSource.nextPageUrl,
  results: mergeCachedResults(preferredSource.results, fallbackSource.results),
});

export const deduplicateAuthorFavoriteCacheSources = (
  sources: ScraperAuthorFavoriteCacheSource[],
): ScraperAuthorFavoriteCacheSource[] => {
  const deduplicatedSources: ScraperAuthorFavoriteCacheSource[] = [];
  const sourceIndexByIdentity = new Map<string, number>();
  sources.forEach((source) => {
    const identities = getCacheSourceIdentities(source);
    const existingIndex = identities
      .map((identity) => sourceIndexByIdentity.get(identity))
      .find((index): index is number => index !== undefined);
    if (existingIndex === undefined) {
      const sourceIndex = deduplicatedSources.push(source) - 1;
      identities.forEach((identity) => sourceIndexByIdentity.set(identity, sourceIndex));
      return;
    }

    const existing = deduplicatedSources[existingIndex];
    deduplicatedSources[existingIndex] = mergeCacheSource(existing, source);
    [...getCacheSourceIdentities(existing), ...identities]
      .forEach((identity) => sourceIndexByIdentity.set(identity, existingIndex));
  });
  return deduplicatedSources;
};

const buildCachedResult = (
  sourceResult: BackgroundListingRun["results"][number],
): ScraperAuthorFavoriteCachedResult => ({
  pageIndex: Math.max(0, Math.floor(sourceResult.pageIndex)),
  searchTerm: sourceResult.searchTerm,
  result: sourceResult.result,
});

const buildCacheSource = (
  source: ListingBackgroundSource,
  run: BackgroundListingRun,
  timestamp: string,
): ScraperAuthorFavoriteCacheSource => ({
  key: `${source.scraper.id}::${source.query}`,
  scraperId: source.scraper.id,
  authorUrl: source.query,
  sourceName: source.favoriteSourceName || source.name,
  loadedPages: run.loadedPages,
  hasNextPage: run.hasNextPage,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  results: mergeCachedResults((run.cacheResults ?? run.results).map(buildCachedResult), []),
  updatedAt: timestamp,
});

const getSuccessfulCacheSources = (
  inputSources: ListingBackgroundSource[],
  runs: BackgroundListingRun[],
  timestamp: string,
): ScraperAuthorFavoriteCacheSource[] => {
  const sourcesById = new Map(inputSources.map((source) => [source.id, source]));
  return deduplicateAuthorFavoriteCacheSources(runs.flatMap((run) => {
    const source = sourcesById.get(run.key);
    return source && run.status === "done"
      ? [buildCacheSource(source, run, timestamp)]
      : [];
  }));
};

export const buildCompleteAuthorFavoriteCache = (
  input: ListingBackgroundInput,
  result: ListingBackgroundResult,
): ScraperAuthorFavoriteCacheRecord | null => {
  if (!input.favoriteId || result.runs.some((run) => run.status !== "done" || run.hasNextPage)) {
    return null;
  }

  const timestamp = new Date().toISOString();
  return {
    favoriteId: input.favoriteId,
    favoriteUpdatedAt: input.favoriteUpdatedAt,
    cachedAt: timestamp,
    completedAt: timestamp,
    sources: getSuccessfulCacheSources(input.sources, result.runs, timestamp),
  };
};

export const buildLatestAuthorCacheUpdates = (
  input: ListingBackgroundInput,
  result: ListingBackgroundResult,
): Map<string, ScraperAuthorFavoriteCacheRecord> => {
  const timestamp = new Date().toISOString();
  const sourcesByFavoriteId = new Map<string, ListingBackgroundSource[]>();

  input.sources.forEach((source) => {
    if (!source.favoriteId) {
      return;
    }
    const favoriteSources = sourcesByFavoriteId.get(source.favoriteId) ?? [];
    favoriteSources.push(source);
    sourcesByFavoriteId.set(source.favoriteId, favoriteSources);
  });

  return new Map(Array.from(sourcesByFavoriteId.entries()).flatMap(([favoriteId, sources]) => {
    const sourceIds = new Set(sources.map((source) => source.id));
    const cacheSources = getSuccessfulCacheSources(
      sources,
      result.runs.filter((run) => sourceIds.has(run.key) && !run.fromCache),
      timestamp,
    );
    if (!cacheSources.length) {
      return [];
    }

    return [[favoriteId, {
      favoriteId,
      favoriteUpdatedAt: sources.find((source) => source.favoriteUpdatedAt)?.favoriteUpdatedAt,
      cachedAt: timestamp,
      sources: cacheSources,
    }]];
  }));
};

export const mergeAuthorFavoriteCacheUpdate = (
  existingCache: ScraperAuthorFavoriteCacheRecord | null,
  update: ScraperAuthorFavoriteCacheRecord,
): ScraperAuthorFavoriteCacheRecord => ({
  favoriteId: update.favoriteId,
  favoriteUpdatedAt: update.favoriteUpdatedAt ?? existingCache?.favoriteUpdatedAt,
  cachedAt: update.cachedAt,
  completedAt: existingCache?.completedAt,
  sources: deduplicateAuthorFavoriteCacheSources([
    ...update.sources,
    ...(existingCache?.sources ?? []),
  ]),
});
