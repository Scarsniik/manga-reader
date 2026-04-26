import { useCallback, useMemo, useRef, useState } from "react";
import type { ScraperRecord } from "@/shared/scraper";
import {
  buildSourceResults,
  fetchSearchPageWithRetry,
  getPaceConfig,
  getSearchConfig,
  resolveHasNextPage,
  runWithConcurrency,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import type {
  MultiSearchPaceMode,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

type RunSearchOptions = {
  query: string;
  scrapers: ScraperRecord[];
  maxPages: number;
  paceMode: MultiSearchPaceMode;
};

const buildInitialRun = (scraper: ScraperRecord): MultiSearchScraperRun => ({
  scraper,
  status: "waiting",
  results: [],
  loadedPages: 0,
  hasNextPage: false,
});

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

export default function useMultiSearch() {
  const [runs, setRuns] = useState<MultiSearchScraperRun[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTokenRef = useRef(0);
  const lastPaceModeRef = useRef<MultiSearchPaceMode>("fast");
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  const restoreRuns = useCallback((
    restoredRuns: MultiSearchScraperRun[],
    paceMode: MultiSearchPaceMode,
  ) => {
    searchTokenRef.current += 1;
    lastPaceModeRef.current = paceMode;
    setRuns(restoredRuns);
    setIsSearching(false);
    setError(null);
    setMessage(restoredRuns.length ? "Recherche multi-sources restauree." : null);
  }, []);

  const patchRun = useCallback((
    token: number,
    scraperId: string,
    updater: (run: MultiSearchScraperRun) => MultiSearchScraperRun,
  ) => {
    if (token !== searchTokenRef.current) {
      return;
    }

    setRuns((currentRuns) => currentRuns.map((run) => (
      run.scraper.id === scraperId ? updater(run) : run
    )));
  }, []);

  const loadNextPageForRun = useCallback(async (
    run: MultiSearchScraperRun,
    query: string,
    paceConfig: PaceConfig,
    token: number,
  ): Promise<MultiSearchScraperRun | null> => {
    const scraperId = run.scraper.id;

    patchRun(token, scraperId, (currentRun) => ({
      ...currentRun,
      status: "loading",
      error: undefined,
    }));

    try {
      const searchConfig = getSearchConfig(run.scraper);
      const pageIndex = run.loadedPages;
      const page = await fetchSearchPageWithRetry(
        run.scraper,
        searchConfig,
        query,
        pageIndex,
        run.nextPageUrl,
        paceConfig,
      );
      const pageResults = buildSourceResults(run.scraper, page, pageIndex);
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextRun: MultiSearchScraperRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        loadedPages: pageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextPage(searchConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
        error: undefined,
      };

      patchRun(token, scraperId, () => nextRun);
      return nextRun;
    } catch (loadError) {
      const hasPartialResults = run.loadedPages > 0 || run.results.length > 0;
      if (hasPartialResults) {
        const partialRun: MultiSearchScraperRun = {
          ...run,
          status: "done",
          hasNextPage: false,
          error: undefined,
        };

        patchRun(token, scraperId, (currentRun) => ({
          ...currentRun,
          status: "done",
          hasNextPage: false,
          error: undefined,
        }));
        return partialRun;
      }

      const failedRun: MultiSearchScraperRun = {
        ...run,
        status: "error",
        hasNextPage: false,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      patchRun(token, scraperId, (currentRun) => ({
        ...currentRun,
        status: "error",
        hasNextPage: false,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      }));
      return failedRun;
    }
  }, [patchRun]);

  const runSearch = useCallback(async ({
    query,
    scrapers,
    maxPages,
    paceMode,
  }: RunSearchOptions) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError("Saisis une recherche avant de lancer le multi-search.");
      return;
    }

    if (!scrapers.length) {
      setError("Aucun scrapper compatible n'est selectionne.");
      setRuns([]);
      return;
    }

    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    lastPaceModeRef.current = paceMode;
    const paceConfig = getPaceConfig(paceMode);
    const pageLimit = Math.max(1, maxPages);

    setRuns(scrapers.map(buildInitialRun));
    setIsSearching(true);
    setError(null);
    setMessage(null);

    const tasks = scrapers.map((scraper) => async () => {
      let currentRun = buildInitialRun(scraper);

      for (let pageOffset = 0; pageOffset < pageLimit; pageOffset += 1) {
        if (token !== searchTokenRef.current) {
          return;
        }

        const nextRun = await loadNextPageForRun(currentRun, trimmedQuery, paceConfig, token);

        if (!nextRun || nextRun.status === "error" || !nextRun.hasNextPage) {
          return;
        }

        currentRun = nextRun;
      }
    });

    try {
      await runWithConcurrency(tasks, paceConfig.concurrency);
      if (token === searchTokenRef.current) {
        setMessage("Recherche multi-sources terminee sur les pages chargees.");
      }
    } finally {
      if (token === searchTokenRef.current) {
        setIsSearching(false);
      }
    }
  }, [loadNextPageForRun]);

  const loadMoreForScraper = useCallback(async (scraperId: string, query: string) => {
    const run = runs.find((candidate) => candidate.scraper.id === scraperId);
    const trimmedQuery = query.trim();
    if (!run || !run.hasNextPage || !trimmedQuery) {
      return;
    }

    const token = searchTokenRef.current;
    setError(null);
    setMessage(null);
    await loadNextPageForRun(run, trimmedQuery, getPaceConfig(lastPaceModeRef.current), token);
  }, [loadNextPageForRun, runs]);

  const loadMoreForAll = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    if (!trimmedQuery || !loadableRuns.length) {
      return;
    }

    const paceConfig = getPaceConfig(lastPaceModeRef.current);
    const token = searchTokenRef.current;
    setError(null);
    setMessage(null);
    setIsSearching(true);

    try {
      await runWithConcurrency(
        loadableRuns.map((run) => async () => {
          await loadNextPageForRun(run, trimmedQuery, paceConfig, token);
        }),
        paceConfig.concurrency,
      );
      if (token === searchTokenRef.current) {
        setMessage("Pages supplementaires chargees pour les scrappers disponibles.");
      }
    } finally {
      if (token === searchTokenRef.current) {
        setIsSearching(false);
      }
    }
  }, [loadNextPageForRun, runs]);

  return {
    runs,
    isSearching,
    message,
    error,
    canLoadMore,
    restoreRuns,
    runSearch,
    loadMoreForAll,
    loadMoreForScraper,
  };
}
