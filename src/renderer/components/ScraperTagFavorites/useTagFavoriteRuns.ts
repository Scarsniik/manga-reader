import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ScraperRecord,
  ScraperTagFavoriteRecord,
  ScraperTagFavoriteSource,
} from "@/shared/scraper";
import {
  fetchTagPageWithRetry,
  getPaceConfig,
  getTagConfig,
  resolveHasNextTagPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  createScraperCardDetailsCache,
  isScraperListingPaginationEndError,
} from "@/renderer/utils/scraperRuntime";
import { keepNewSourceResults } from "@/renderer/components/MultiSearch/multiSearchRunState";
import { processScraperListingPage } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";

export type TagFavoriteSourceRunStatus = "waiting" | "loading" | "done" | "error";

export type TagFavoriteSourceRun = {
  key: string;
  favoriteSource: ScraperTagFavoriteSource;
  scraper: ScraperRecord;
  status: TagFavoriteSourceRunStatus;
  results: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl?: string;
  nextPageUrl?: string;
  error?: string;
};

type TagFavoriteRunsOptions = {
  scrapeDetailsWithCards?: boolean;
};

const buildSourceKey = (source: ScraperTagFavoriteSource): string => (
  `${source.scraperId}::${source.tagUrl}`
);

const buildInitialRun = (
  source: ScraperTagFavoriteSource,
  scraper: ScraperRecord,
): TagFavoriteSourceRun => ({
  key: buildSourceKey(source),
  favoriteSource: source,
  scraper,
  status: "waiting",
  results: [],
  loadedPages: 0,
  hasNextPage: true,
});

export default function useTagFavoriteRuns(
  favorite: ScraperTagFavoriteRecord | null,
  scrapersById: Map<string, ScraperRecord>,
  options: TagFavoriteRunsOptions = {},
) {
  const scrapeDetailsWithCards = options.scrapeDetailsWithCards === true;
  const [runs, setRuns] = useState<TagFavoriteSourceRun[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [visiblePageEndIndex, setVisiblePageEndIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);
  const detailsCacheRef = useRef(createScraperCardDetailsCache());
  const paceConfigRef = useRef<PaceConfig>(getPaceConfig("careful"));
  const runsRef = useRef<TagFavoriteSourceRun[]>([]);
  const visibleSources = useMemo(
    () => runs.flatMap((run) => run.results.filter((result) => (
      result.pageIndex >= pageIndex && result.pageIndex <= visiblePageEndIndex
    ))),
    [pageIndex, runs, visiblePageEndIndex],
  );
  const canGoPrevious = pageIndex > 0;
  const canGoNext = useMemo(
    () => runs.some((run) => (
      run.loadedPages > pageIndex + 1
      || (run.hasNextPage && run.status !== "loading")
    )),
    [pageIndex, runs],
  );
  const canAppendPages = useMemo(
    () => runs.some((run) => (
      run.loadedPages > visiblePageEndIndex + 1
      || (run.hasNextPage && run.status !== "loading")
    )),
    [runs, visiblePageEndIndex],
  );

  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const patchRun = useCallback((
    token: number,
    key: string,
    updater: (run: TagFavoriteSourceRun) => TagFavoriteSourceRun,
  ) => {
    if (token !== tokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.key === key ? updater(run) : run
    )));
  }, []);

  const loadNextPageForRun = useCallback(async (
    run: TagFavoriteSourceRun,
    token: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun | null> => {
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
      const tagConfig = getTagConfig(run.scraper);
      const nextPageIndex = run.loadedPages;
      const page = await fetchTagPageWithRetry(
        run.scraper,
        tagConfig,
        run.favoriteSource.tagUrl,
        nextPageIndex,
        run.nextPageUrl,
        paceConfigRef.current,
        {
          scrapeDetailsWithCards,
          detailsCache: detailsCacheRef.current,
        },
      );
      const { sources: pageResults } = await processScraperListingPage({
        scraper: run.scraper,
        page,
        pageIndex: nextPageIndex,
        searchTerm: run.favoriteSource.name,
        resultTag: {
          name: run.favoriteSource.name,
          url: run.favoriteSource.tagUrl,
        },
      });
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextRun: TagFavoriteSourceRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        loadedPages: nextPageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextTagPage(tagConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
        error: undefined,
      };

      if (updateState) {
        patchRun(token, run.key, () => nextRun);
      }
      return nextRun;
    } catch (loadError) {
      const isPaginationEnd = isScraperListingPaginationEndError(loadError);
      const failedRun: TagFavoriteSourceRun = {
        ...run,
        status: run.results.length || isPaginationEnd ? "done" : "error",
        hasNextPage: false,
        error: isPaginationEnd
          ? undefined
          : loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      if (updateState) {
        patchRun(token, run.key, () => failedRun);
      }
      return failedRun;
    }
  }, [patchRun, scrapeDetailsWithCards]);

  const loadPageForRun = useCallback(async (
    run: TagFavoriteSourceRun,
    targetPageIndex: number,
    token: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun | null> => {
    let currentRun: TagFavoriteSourceRun | null = run;

    while (
      currentRun
      && currentRun.loadedPages <= targetPageIndex
      && currentRun.hasNextPage
      && token === tokenRef.current
    ) {
      currentRun = await loadNextPageForRun(currentRun, token, updateState);
    }

    return currentRun;
  }, [loadNextPageForRun]);

  const loadPageForRuns = useCallback(async (
    sourceRuns: TagFavoriteSourceRun[],
    token: number,
    targetPageIndex: number,
    updateState = true,
  ): Promise<TagFavoriteSourceRun[]> => {
    const loadedRuns: Array<TagFavoriteSourceRun | null> = Array.from({ length: sourceRuns.length }, () => null);

    await runWithConcurrency(
      sourceRuns.map((run, index) => async () => {
        loadedRuns[index] = await loadPageForRun(run, targetPageIndex, token, updateState);
      }),
      paceConfigRef.current.concurrency,
    );

    return loadedRuns.filter((run): run is TagFavoriteSourceRun => Boolean(run));
  }, [loadPageForRun]);

  const loadPage = useCallback(async (targetPageIndex: number, forceReset = false) => {
    if (!favorite) {
      setRuns([]);
      setPageIndex(0);
      setVisiblePageEndIndex(0);
      setMessage(null);
      setError(null);
      return;
    }

    const normalizedPageIndex = Math.max(0, Math.floor(targetPageIndex));
    const currentRuns = runsRef.current;
    const baseRuns = !forceReset && currentRuns.length
      ? currentRuns
      : favorite.sources.reduce<TagFavoriteSourceRun[]>((nextRuns, source) => {
        const scraper = scrapersById.get(source.scraperId);
        if (scraper) {
          nextRuns.push(buildInitialRun(source, scraper));
        }
        return nextRuns;
      }, []);
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    setRuns(baseRuns);
    setPageIndex(normalizedPageIndex);
    setVisiblePageEndIndex(normalizedPageIndex);
    setLoading(Boolean(baseRuns.length));
    setMessage(null);
    setError(baseRuns.length ? null : "Aucun scrapper disponible pour ce tag favori.");

    try {
      const loadedRuns = await loadPageForRuns(baseRuns, token, normalizedPageIndex);
      if (token !== tokenRef.current) {
        return;
      }

      setRuns(loadedRuns);
      setMessage(`Page ${normalizedPageIndex + 1} chargee pour les sources disponibles.`);
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [favorite, loadPageForRuns, scrapersById]);

  const start = useCallback(async () => {
    detailsCacheRef.current = createScraperCardDetailsCache();
    await loadPage(0, true);
  }, [loadPage]);

  const goToNextPage = useCallback(async () => {
    if (!canGoNext || loading) {
      return;
    }

    await loadPage(pageIndex + 1);
  }, [canGoNext, loadPage, loading, pageIndex]);

  const goToPreviousPage = useCallback(async () => {
    if (!canGoPrevious || loading) {
      return;
    }

    const previousPageIndex = Math.max(0, pageIndex - 1);
    setPageIndex(previousPageIndex);
    setVisiblePageEndIndex(previousPageIndex);
    setMessage(`Retour a la page ${pageIndex}.`);
  }, [canGoPrevious, loading, pageIndex]);

  const appendPages = useCallback(async (requestedPageCount: number) => {
    const currentRuns = runsRef.current;
    if (!favorite || loading || !currentRuns.length) {
      return;
    }

    const pageCount = Number.isFinite(requestedPageCount)
      ? Math.max(1, Math.floor(requestedPageCount))
      : 1;
    const currentVisibleEndIndex = visiblePageEndIndex;
    const targetPageIndex = currentVisibleEndIndex + pageCount;
    const token = tokenRef.current + 1;
    tokenRef.current = token;

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const loadedRuns = await loadPageForRuns(currentRuns, token, targetPageIndex);
      if (token !== tokenRef.current) {
        return;
      }

      const lastLoadedPageIndex = loadedRuns.reduce(
        (highestPageIndex, run) => Math.max(highestPageIndex, run.loadedPages - 1),
        currentVisibleEndIndex,
      );
      const nextVisibleEndIndex = Math.min(targetPageIndex, lastLoadedPageIndex);
      const addedPageCount = Math.max(0, nextVisibleEndIndex - currentVisibleEndIndex);

      setRuns(loadedRuns);
      setVisiblePageEndIndex(nextVisibleEndIndex);
      setMessage(addedPageCount > 0
        ? `${addedPageCount} page(s) supplementaire(s) scrapee(s) et ajoutee(s) a la vue fusionnee.`
        : "Aucune page supplementaire disponible.");
    } catch (loadError) {
      if (token === tokenRef.current) {
        setError(loadError instanceof Error
          ? loadError.message
          : "Echec temporaire du chargement des pages supplementaires.");
      }
    } finally {
      if (token === tokenRef.current) {
        setLoading(false);
      }
    }
  }, [favorite, loadPageForRuns, loading, visiblePageEndIndex]);

  return {
    runs,
    visibleSources,
    pageIndex,
    visiblePageEndIndex,
    loading,
    message,
    error,
    canGoPrevious,
    canGoNext,
    canAppendPages,
    start,
    reload: () => loadPage(pageIndex),
    goToPreviousPage,
    goToNextPage,
    appendPages,
  };
}
