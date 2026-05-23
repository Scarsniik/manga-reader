import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ScraperAuthorFavoriteCacheRecord,
  ScraperAuthorFavoriteCacheSource,
  ScraperAuthorFavoriteCachedResult,
  ScraperAuthorFavoriteRecord,
  ScraperAuthorFavoriteSource,
  ScraperRecord,
} from "@/shared/scraper";
import {
  buildSourceResults,
  buildSourceResultsFromItems,
  fetchAuthorPageWithRetry,
  getAuthorConfig,
  getPaceConfig,
  resolveHasNextAuthorPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

export type AuthorFavoriteSourceRunStatus = "waiting" | "loading" | "done" | "error";

type AuthorFavoriteRunsOptions = {
  initialPageCount: number;
  cacheResults: boolean;
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

const MAX_AUTHOR_FAVORITE_AUTO_PAGES = 250;

const buildSourceKey = (source: ScraperAuthorFavoriteSource): string => (
  `${source.scraperId}::${source.authorUrl}`
);

const buildInitialRun = (
  source: ScraperAuthorFavoriteSource,
  scraper: ScraperRecord,
): AuthorFavoriteSourceRun => ({
  key: buildSourceKey(source),
  favoriteSource: source,
  scraper,
  status: "waiting",
  results: [],
  loadedPages: 0,
  hasNextPage: true,
});

const canPersistRunsCache = (sourceRuns: AuthorFavoriteSourceRun[]): boolean => (
  sourceRuns.length > 0
  && sourceRuns.every((run) => run.status !== "error" && !run.error && !run.hasNextPage)
);

const normalizeResultUrl = (source: MultiSearchSourceResult): string => {
  const value = source.result.detailUrl?.trim();
  if (!value) {
    return "";
  }

  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
};

const keepNewSourceResults = (
  existingResults: MultiSearchSourceResult[],
  pageResults: MultiSearchSourceResult[],
): MultiSearchSourceResult[] => {
  const seenUrls = new Set(existingResults.map(normalizeResultUrl).filter(Boolean));

  return pageResults.filter((source) => {
    const url = normalizeResultUrl(source);
    if (!url) {
      return true;
    }

    if (seenUrls.has(url)) {
      return false;
    }

    seenUrls.add(url);
    return true;
  });
};

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
  ?? cache.sources.find((source) => (
    source.scraperId === run.favoriteSource.scraperId
    && source.authorUrl === run.favoriteSource.authorUrl
  ))
  ?? null
);

const buildRunFromCacheSource = async (
  run: AuthorFavoriteSourceRun,
  cachedSource: ScraperAuthorFavoriteCacheSource,
): Promise<AuthorFavoriteSourceRun> => ({
  ...run,
  status: "done",
  results: await enrichSourceResultsWithJapaneseRomanization(buildSourceResultsFromItems(
    run.scraper,
    cachedSource.results.map((cachedResult) => cachedResult.result),
    (_result, index) => cachedSource.results[index]?.pageIndex ?? 0,
    (_result, index) => cachedSource.results[index]?.searchTerm || run.favoriteSource.name,
  )),
  loadedPages: cachedSource.loadedPages,
  hasNextPage: cachedSource.hasNextPage,
  currentPageUrl: cachedSource.currentPageUrl,
  nextPageUrl: cachedSource.nextPageUrl,
  error: undefined,
});

export default function useAuthorFavoriteRuns(
  favorite: ScraperAuthorFavoriteRecord | null,
  scrapersById: Map<string, ScraperRecord>,
  options: AuthorFavoriteRunsOptions,
) {
  const { initialPageCount, cacheResults } = options;
  const [runs, setRuns] = useState<AuthorFavoriteSourceRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const paceConfigRef = useRef<PaceConfig>(getPaceConfig("careful"));
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  const patchRun = useCallback((
    token: number,
    key: string,
    updater: (run: AuthorFavoriteSourceRun) => AuthorFavoriteSourceRun,
  ) => {
    if (token !== tokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.key === key ? updater(run) : run
    )));
  }, []);

  const loadNextPageForRun = useCallback(async (
    run: AuthorFavoriteSourceRun,
    token: number,
    updateState = true,
  ): Promise<AuthorFavoriteSourceRun | null> => {
    if (!run.hasNextPage || token !== tokenRef.current) {
      return run;
    }

    if (updateState) {
      patchRun(token, run.key, (currentRun) => ({
        ...currentRun,
        status: "loading",
        error: undefined,
      }));
    }

    try {
      const authorConfig = getAuthorConfig(run.scraper);
      const pageIndex = run.loadedPages;
      const page = await fetchAuthorPageWithRetry(
        run.scraper,
        authorConfig,
        run.favoriteSource.authorUrl,
        pageIndex,
        run.nextPageUrl,
        paceConfigRef.current,
        run.favoriteSource.templateContext ?? null,
      );
      const pageResults = await enrichSourceResultsWithJapaneseRomanization(
        buildSourceResults(run.scraper, page, pageIndex, run.favoriteSource.name),
      );
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextRun: AuthorFavoriteSourceRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        loadedPages: pageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextAuthorPage(authorConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
        error: undefined,
      };

      if (updateState) {
        patchRun(token, run.key, () => nextRun);
      }
      return nextRun;
    } catch (loadError) {
      const failedRun: AuthorFavoriteSourceRun = {
        ...run,
        status: run.results.length ? "done" : "error",
        hasNextPage: false,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      if (updateState) {
        patchRun(token, run.key, () => failedRun);
      }
      return failedRun;
    }
  }, [patchRun]);

  const loadPagesForRun = useCallback(async (
    run: AuthorFavoriteSourceRun,
    pageCount: number,
    token: number,
    updateState = true,
  ): Promise<AuthorFavoriteSourceRun | null> => {
    let currentRun: AuthorFavoriteSourceRun | null = run;

    for (let pageOffset = 0; pageOffset < pageCount; pageOffset += 1) {
      if (!currentRun || !currentRun.hasNextPage || token !== tokenRef.current) {
        return currentRun;
      }

      currentRun = await loadNextPageForRun(currentRun, token, updateState);
    }

    return currentRun;
  }, [loadNextPageForRun]);

  const loadAllPagesForRun = useCallback(async (
    run: AuthorFavoriteSourceRun,
    token: number,
    updateState = true,
  ): Promise<AuthorFavoriteSourceRun | null> => {
    let currentRun: AuthorFavoriteSourceRun | null = run;

    for (let pageOffset = 0; pageOffset < MAX_AUTHOR_FAVORITE_AUTO_PAGES; pageOffset += 1) {
      if (!currentRun || !currentRun.hasNextPage || token !== tokenRef.current) {
        return currentRun;
      }

      currentRun = await loadNextPageForRun(currentRun, token, updateState);
    }

    if (currentRun?.hasNextPage && token === tokenRef.current) {
      const limitedRun = {
        ...currentRun,
        status: "error" as const,
        hasNextPage: false,
        error: "Limite de securite atteinte pendant le chargement complet.",
      };
      if (updateState) {
        patchRun(token, currentRun.key, () => limitedRun);
      }
      return limitedRun;
    }

    return currentRun;
  }, [loadNextPageForRun, patchRun]);

  const loadPagesForRuns = useCallback(async (
    sourceRuns: AuthorFavoriteSourceRun[],
    token: number,
    pageCount: number | null,
    updateState = true,
  ): Promise<AuthorFavoriteSourceRun[]> => {
    const loadedRuns: Array<AuthorFavoriteSourceRun | null> = Array.from({ length: sourceRuns.length }, () => null);

    await runWithConcurrency(
      sourceRuns.map((run, index) => async () => {
        loadedRuns[index] = pageCount === null
          ? await loadAllPagesForRun(run, token, updateState)
          : await loadPagesForRun(run, pageCount, token, updateState);
      }),
      paceConfigRef.current.concurrency,
    );

    return loadedRuns.filter((run): run is AuthorFavoriteSourceRun => Boolean(run));
  }, [loadAllPagesForRun, loadPagesForRun]);

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
      return cachedSource ? buildRunFromCacheSource(run, cachedSource) : run;
    }));
  }, [cacheResults, favorite]);

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
    if (!favorite) {
      setRuns([]);
      setMessage(null);
      setError(null);
      return;
    }

    const initialRuns = favorite.sources.reduce<AuthorFavoriteSourceRun[]>((nextRuns, source) => {
      const scraper = scrapersById.get(source.scraperId);
      if (scraper) {
        nextRuns.push(buildInitialRun(source, scraper));
      }
      return nextRuns;
    }, []);

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
      await runWithConcurrency(
        loadableRuns.map((run) => async () => {
          await loadNextPageForRun(run, token);
        }),
        paceConfigRef.current.concurrency,
      );

      if (token === tokenRef.current) {
        setMessage("Pages supplementaires chargees.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [loadNextPageForRun, runs]);

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
    await loadNextPageForRun(run, token);
  }, [loadNextPageForRun, runs]);

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
  };
}
