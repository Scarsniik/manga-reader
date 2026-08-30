import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScraperAuthorFavoriteCacheRecord,
  ScraperAuthorFavoriteCacheSource,
  ScraperAuthorFavoriteCachedResult,
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
} from "@/shared/scraper";
import { buildSourceResultsFromItems } from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import { doesMultiSearchSourceMatchIncludedLanguages } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { createScraperCardDetailsCache } from "@/renderer/utils/scraperRuntime";
import { findAuthorFavoriteCachedSource } from "@/renderer/utils/scraperAuthorFavoriteCache";
import { isMultiSearchSourceOriginal } from "@/renderer/utils/scraperOriginalWorks";
import type { BackgroundListingRun } from "@/renderer/backgroundSearch/types";
import {
  runAuthorFavoriteRefreshSearchEngine,
  runLatestAuthorsSearchEngine,
} from "@/renderer/searchEngines/listingSearchEngine";
import {
  buildAuthorListingSearchInput,
  buildAuthorListingSources,
  type AuthorListingSearchKind,
} from "@/renderer/searchEngines/authorListingSearchInput";

export type AuthorFavoriteSourceRunStatus = "waiting" | "loading" | "done" | "error";

type AuthorFavoriteRunsOptions = {
  initialPageCount: number;
  cacheResults: boolean;
  concurrency?: number;
  scrapeDetailsWithCards?: boolean;
  includedLanguageCodes?: string[];
  sourceFavorites?: ScraperAuthorFavoriteRecord[];
  searchKind?: Extract<AuthorListingSearchKind, "latestAuthors" | "authorFavoriteRefresh">;
  useAuthorFavoriteCache?: boolean;
  authorFavoriteCacheMaxAgeHours?: number;
  searchMode?: "quick" | "continuous" | "deep";
  quickConsecutiveSeenStopThreshold?: number;
  originalOnly?: boolean;
};

export type AuthorFavoriteSourceRun = {
  key: string;
  favoriteSource: ScraperAuthorFavoriteSource;
  scraper: ScraperRecord;
  status: AuthorFavoriteSourceRunStatus;
  results: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

const ALL_AUTHOR_FAVORITE_LANGUAGES: string[] = [];

const normalizeConcurrency = (value: number | undefined, fallback = 2): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value ?? fallback));
};

const buildSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const buildInitialRun = (
  source: ScraperAuthorFavoriteSource,
  scraper: ScraperRecord,
  key = buildSourceKey(source),
): AuthorFavoriteSourceRun => ({
  key,
  favoriteSource: source,
  scraper,
  status: "waiting",
  results: [],
  loadedPages: 0,
  hasNextPage: true,
});

const toBackgroundListingRun = (run: AuthorFavoriteSourceRun): BackgroundListingRun => ({
  key: run.key,
  name: run.favoriteSource.name,
  scraper: run.scraper,
  query: run.favoriteSource.authorUrl,
  status: run.status,
  results: run.results,
  loadedPages: run.loadedPages,
  hasNextPage: run.hasNextPage,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  error: run.error,
});

const fromBackgroundListingRun = (
  run: BackgroundListingRun,
  previousRunsByKey: Map<string, AuthorFavoriteSourceRun>,
): AuthorFavoriteSourceRun => {
  const previousRun = previousRunsByKey.get(run.key);
  return {
    key: run.key,
    favoriteSource: previousRun?.favoriteSource ?? {
      scraperId: run.scraper.id,
      authorUrl: run.query,
      name: run.name,
      createdAt: "",
      updatedAt: "",
    },
    scraper: run.scraper,
    status: run.status === "cancelled" ? "done" : run.status,
    results: run.results,
    loadedPages: run.loadedPages,
    hasNextPage: run.hasNextPage,
    currentPageUrl: run.currentPageUrl,
    nextPageUrl: run.nextPageUrl,
    error: run.error,
  };
};

const mergeAuthorFavoriteRuns = (
  currentRuns: AuthorFavoriteSourceRun[],
  incomingRuns: AuthorFavoriteSourceRun[],
): AuthorFavoriteSourceRun[] => {
  const incomingByKey = new Map(incomingRuns.map((run) => [run.key, run]));
  const mergedRuns = currentRuns.map((run) => incomingByKey.get(run.key) ?? run);
  const currentKeys = new Set(currentRuns.map((run) => run.key));
  incomingRuns.forEach((run) => {
    if (!currentKeys.has(run.key)) mergedRuns.push(run);
  });
  return mergedRuns;
};

const canPersistRunsCache = (sourceRuns: AuthorFavoriteSourceRun[]): boolean => (
  sourceRuns.length > 0
  && sourceRuns.every((run) => run.status !== "error" && !run.error && !run.hasNextPage)
);

const getAuthorFavoriteCacheApi = () => (window as any).api ?? {};

const buildCachedResult = (source: MultiSearchSourceResult): ScraperAuthorFavoriteCachedResult => ({
  pageIndex: Math.max(0, Math.floor(source.pageIndex)),
  searchTerm: source.searchTerm,
  result: source.result,
});

const buildCacheSourceFromRun = (run: AuthorFavoriteSourceRun): ScraperAuthorFavoriteCacheSource => ({
  key: run.key,
  scraperId: run.favoriteSource.scraperId,
  authorUrl: run.favoriteSource.authorUrl,
  sourceName: run.favoriteSource.name,
  loadedPages: run.loadedPages,
  hasNextPage: run.hasNextPage,
  currentPageUrl: run.currentPageUrl,
  nextPageUrl: run.nextPageUrl,
  results: run.results.map(buildCachedResult),
  updatedAt: new Date().toISOString(),
});

const buildCacheRecordFromRuns = (
  favorite: ScraperAuthorFavoriteRecord,
  runs: AuthorFavoriteSourceRun[],
): ScraperAuthorFavoriteCacheRecord => ({
  favoriteId: favorite.id,
  favoriteUpdatedAt: favorite.updatedAt,
  cachedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  sources: runs.map(buildCacheSourceFromRun),
});

const findCachedSource = (
  cache: ScraperAuthorFavoriteCacheRecord,
  run: AuthorFavoriteSourceRun,
): ScraperAuthorFavoriteCacheSource | null => (
  cache.sources.find((source) => source.key === run.key)
  ?? findAuthorFavoriteCachedSource(run.favoriteSource, cache)
  ?? null
);

const buildRunFromCacheSource = async (
  run: AuthorFavoriteSourceRun,
  cachedSource: ScraperAuthorFavoriteCacheSource,
  contextualAuthorNames: string[],
  includedLanguageCodes: string[],
  originalOnly: boolean,
): Promise<AuthorFavoriteSourceRun> => {
  const results = await enrichSourceResultsWithJapaneseRomanization(buildSourceResultsFromItems(
    run.scraper,
    cachedSource.results.map((cachedResult) => cachedResult.result),
    (_result, index) => cachedSource.results[index]?.pageIndex ?? 0,
    (_result, index) => cachedSource.results[index]?.searchTerm || run.favoriteSource.name,
    () => contextualAuthorNames,
  ).filter((source) => (
    doesMultiSearchSourceMatchIncludedLanguages(source, includedLanguageCodes)
  )));

  return {
    ...run,
    status: "done",
    results: results.filter((source) => !originalOnly || isMultiSearchSourceOriginal(source)),
    loadedPages: cachedSource.loadedPages,
    hasNextPage: cachedSource.hasNextPage,
    currentPageUrl: cachedSource.currentPageUrl,
    nextPageUrl: cachedSource.nextPageUrl,
    error: undefined,
  };
};

export default function useAuthorFavoriteRuns(
  favorite: ScraperAuthorFavoriteRecord | null,
  scrapersById: Map<string, ScraperRecord>,
  options: AuthorFavoriteRunsOptions,
) {
  const { initialPageCount, cacheResults } = options;
  const scrapeDetailsWithCards = options.scrapeDetailsWithCards === true;
  const includedLanguageCodes = options.includedLanguageCodes ?? ALL_AUTHOR_FAVORITE_LANGUAGES;
  const originalOnly = options.originalOnly === true;
  const sourceFavorites = useMemo(
    () => options.sourceFavorites ?? (favorite ? [favorite] : []),
    [favorite, options.sourceFavorites],
  );
  const searchKind = options.searchKind ?? "authorFavoriteRefresh";
  const [runs, setRuns] = useState<AuthorFavoriteSourceRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const detailsCacheRef = useRef(createScraperCardDetailsCache());
  const concurrency = normalizeConcurrency(options.concurrency);
  const contextualAuthorNames = useMemo(() => Array.from(new Set(
    favorite?.sources.map((source) => source.name.trim()).filter(Boolean) ?? [],
  )), [favorite]);
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const loadPagesForRuns = useCallback(async (
    sourceRuns: AuthorFavoriteSourceRun[],
    token: number,
    pageCount: number | null,
    updateState = true,
  ): Promise<AuthorFavoriteSourceRun[]> => {
    if (!sourceRuns.length || token !== tokenRef.current) return sourceRuns;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const previousRunsByKey = new Map(sourceRuns.map((run) => [run.key, run]));
    const favoriteRecords = sourceFavorites.length
      ? sourceFavorites
      : favorite ? [favorite] : [];
    const allSources = buildAuthorListingSources(favoriteRecords, scrapersById, searchKind);
    const selectedSourceKeys = new Set(sourceRuns.map((run) => run.key));
    const sources = allSources.filter((source) => selectedSourceKeys.has(source.id));
    const sourceByFallbackIdentity = new Map(allSources.map((source) => [
      `${source.scraper.id}::${source.query}`,
      source,
    ]));
    sourceRuns.forEach((run) => {
      if (!sources.some((source) => source.id === run.key)) {
        const configuredSource = sourceByFallbackIdentity.get(
          `${run.favoriteSource.scraperId}::${run.favoriteSource.authorUrl}`,
        );
        sources.push(configuredSource ?? {
          id: run.key,
          name: run.favoriteSource.name,
          scraper: run.scraper,
          query: run.favoriteSource.authorUrl,
          mode: "author",
          templateContext: run.favoriteSource.templateContext ?? null,
          contextualAuthorNames,
        });
      }
    });
    const input = buildAuthorListingSearchInput(favoriteRecords, scrapersById, searchKind, {
      maxPages: pageCount,
      concurrency,
      includedLanguageCodes,
      scrapeDetailsWithCards,
      originalOnly,
      useAuthorFavoriteCache: searchKind === "latestAuthors" && options.useAuthorFavoriteCache === true,
      authorFavoriteCacheMaxAgeHours: options.authorFavoriteCacheMaxAgeHours,
      selectedFavoriteIds: favoriteRecords.map((favoriteRecord) => favoriteRecord.id),
      searchMode: options.searchMode,
      quickConsecutiveSeenStopThreshold: options.quickConsecutiveSeenStopThreshold,
    });
    input.sources = sources;
    let loadedRuns = sourceRuns;
    const onSnapshot = async (result: { runs: BackgroundListingRun[] }) => {
      if (token !== tokenRef.current) return;
      loadedRuns = result.runs.map((run) => fromBackgroundListingRun(run, previousRunsByKey));
      if (updateState) {
        setRuns((currentRuns) => mergeAuthorFavoriteRuns(currentRuns, loadedRuns));
      }
    };
    const initialRuns = sourceRuns.map(toBackgroundListingRun);
    const engine = searchKind === "latestAuthors"
      ? runLatestAuthorsSearchEngine
      : runAuthorFavoriteRefreshSearchEngine;
    const result = await engine(input, controller.signal, onSnapshot, {
      initialRuns,
      detailsCache: detailsCacheRef.current,
    });
    loadedRuns = result.runs.map((run) => fromBackgroundListingRun(run, previousRunsByKey));
    return loadedRuns;
  }, [
    concurrency,
    contextualAuthorNames,
    favorite,
    includedLanguageCodes,
    options.authorFavoriteCacheMaxAgeHours,
    options.quickConsecutiveSeenStopThreshold,
    options.searchMode,
    options.useAuthorFavoriteCache,
    originalOnly,
    scrapeDetailsWithCards,
    scrapersById,
    searchKind,
    sourceFavorites,
  ]);

  const readCachedRuns = useCallback(async (
    initialRuns: AuthorFavoriteSourceRun[],
  ): Promise<AuthorFavoriteSourceRun[] | null> => {
    if (!favorite || !cacheResults) {
      return null;
    }

    const api = getAuthorFavoriteCacheApi();
    if (typeof api.getScraperAuthorFavoriteCache !== "function") {
      return null;
    }

    const cache = await api.getScraperAuthorFavoriteCache(favorite.id) as ScraperAuthorFavoriteCacheRecord | null;
    if (!cache?.sources?.length) {
      return null;
    }

    return Promise.all(initialRuns.map(async (run) => {
      const cachedSource = findCachedSource(cache, run);
      return cachedSource
        ? buildRunFromCacheSource(
          run,
          cachedSource,
          contextualAuthorNames,
          includedLanguageCodes,
          originalOnly,
        )
        : run;
    }));
  }, [cacheResults, contextualAuthorNames, favorite, includedLanguageCodes, originalOnly]);

  const saveRunsCache = useCallback(async (
    nextRuns: AuthorFavoriteSourceRun[],
  ): Promise<void> => {
    if (!favorite || !cacheResults) {
      return;
    }

    const api = getAuthorFavoriteCacheApi();
    if (typeof api.saveScraperAuthorFavoriteCache !== "function") {
      return;
    }

    await api.saveScraperAuthorFavoriteCache({
      favoriteId: favorite.id,
      cache: buildCacheRecordFromRuns(favorite, nextRuns),
    });
  }, [cacheResults, favorite]);

  const start = useCallback(async () => {
    abortControllerRef.current?.abort();
    detailsCacheRef.current = createScraperCardDetailsCache();
    if (!favorite) {
      setRuns([]);
      setMessage(null);
      setError(null);
      return;
    }

    const favoriteRecords = sourceFavorites.length ? sourceFavorites : [favorite];
    const initialRuns = buildAuthorListingSources(favoriteRecords, scrapersById, searchKind)
      .map((source) => buildInitialRun({
        scraperId: source.scraper.id,
        authorUrl: source.query,
        name: source.favoriteSourceName || source.name,
        templateContext: source.templateContext ?? undefined,
        createdAt: source.favoriteUpdatedAt ?? favorite.createdAt,
        updatedAt: source.favoriteUpdatedAt ?? favorite.updatedAt,
      }, source.scraper, source.id));

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setRuns(initialRuns);
    const pageLimit = Math.max(1, Math.floor(initialPageCount));

    setLoading(Boolean(initialRuns.length));
    setMessage(null);
    setError(initialRuns.length ? null : "Aucun scrapper disponible pour cet auteur favori.");

    try {
      let cachedRuns: AuthorFavoriteSourceRun[] | null = null;
      if (cacheResults) {
        cachedRuns = await readCachedRuns(initialRuns);
        if (token !== tokenRef.current) {
          return;
        }

        if (cachedRuns) {
          setRuns(cachedRuns);
          setMessage("Resultats en cache affiches. Actualisation en cours...");
        }
      }

      const updateStateDuringLoad = !cacheResults || !cachedRuns;
      const loadedRuns = await loadPagesForRuns(
        initialRuns,
        token,
        cacheResults ? null : pageLimit,
        updateStateDuringLoad,
      );

      if (token === tokenRef.current) {
        if (cacheResults) {
          if (canPersistRunsCache(loadedRuns)) {
            setRuns(loadedRuns);
            await saveRunsCache(loadedRuns);
            setMessage("Toutes les pages disponibles ont ete chargees et le cache a ete mis a jour.");
          } else {
            setRuns(cachedRuns ?? loadedRuns);
            setError(cachedRuns
              ? "Actualisation incomplete : le cache existant a ete conserve."
              : "Chargement complet incomplet : le cache n'a pas ete cree.");
          }
        } else {
          setRuns(loadedRuns);
          setMessage(`${pageLimit} page(s) chargee(s) pour les sources disponibles.`);
        }
      }
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [
    favorite,
    initialPageCount,
    loadPagesForRuns,
    readCachedRuns,
    saveRunsCache,
    cacheResults,
    searchKind,
    sourceFavorites,
    scrapersById,
  ]);

  const loadMoreForAll = useCallback(async () => {
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    if (!loadableRuns.length) {
      return;
    }

    const token = tokenRef.current;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      await loadPagesForRuns(loadableRuns, token, 1);

      if (token === tokenRef.current) {
        setMessage("Pages supplementaires chargees.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [loadPagesForRuns, runs]);

  const loadAllForAll = useCallback(async () => {
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    if (!loadableRuns.length) {
      return;
    }

    const token = tokenRef.current;
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const loadedRuns = await loadPagesForRuns(loadableRuns, token, null);
      if (token === tokenRef.current) {
        const loadedRunsByKey = new Map(loadedRuns.map((run) => [run.key, run]));
        const nextRuns = runs.map((run) => loadedRunsByKey.get(run.key) ?? run);
        setRuns(nextRuns);

        if (cacheResults) {
          if (!canPersistRunsCache(nextRuns)) {
            setError("Chargement complet incomplet : le cache n'a pas ete modifie.");
            return;
          }

          await saveRunsCache(nextRuns);
        }

        setMessage(cacheResults
          ? "Toutes les pages disponibles ont ete chargees et le cache a ete mis a jour."
          : "Toutes les pages disponibles ont ete chargees.");
      }
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement complet.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [cacheResults, loadPagesForRuns, runs, saveRunsCache]);

  const loadMoreForRun = useCallback(async (key: string) => {
    const run = runs.find((candidate) => candidate.key === key);
    if (!run || !run.hasNextPage || run.status === "loading") {
      return;
    }

    const token = tokenRef.current;
    setMessage(null);
    setError(null);
    await loadPagesForRuns([run], token, 1);
  }, [loadPagesForRuns, runs]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    tokenRef.current += 1;
    setRuns([]);
    setLoading(false);
    setMessage(null);
    setError(null);
  }, []);

  return {
    runs,
    loading,
    message,
    error,
    canLoadMore,
    start,
    loadMoreForAll,
    loadAllForAll,
    loadMoreForRun,
    reset,
  };
}
