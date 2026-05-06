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
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import type {
  MultiSearchPaceMode,
  MultiSearchScraperRun,
  MultiSearchTermRun,
} from "@/renderer/components/MultiSearch/types";
import useMultiSearchRunBatcher from "@/renderer/components/MultiSearch/useMultiSearchRunBatcher";
import {
  buildInitialRun,
  ensureRunSearchTerms,
  keepNewSourceResults,
  summarizeTermRuns,
  upsertTermRun,
} from "@/renderer/components/MultiSearch/multiSearchRunState";

type RunSearchOptions = {
  query: string;
  scrapers: ScraperRecord[];
  maxPages: number;
  paceMode: MultiSearchPaceMode;
};

export default function useMultiSearch() {
  const [runs, setRuns] = useState<MultiSearchScraperRun[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTokenRef = useRef(0);
  const lastPaceModeRef = useRef<MultiSearchPaceMode>("fast");
  const {
    clearRunUpdates,
    flushRunUpdates,
    queueRunUpdate,
  } = useMultiSearchRunBatcher({
    searchTokenRef,
    setRuns,
  });
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );

  const restoreRuns = useCallback((
    restoredRuns: MultiSearchScraperRun[],
    paceMode: MultiSearchPaceMode,
  ) => {
    clearRunUpdates();
    searchTokenRef.current += 1;
    lastPaceModeRef.current = paceMode;
    setRuns(restoredRuns);
    setIsSearching(false);
    setError(null);
    setMessage(restoredRuns.length ? "Recherche multi-sources restauree." : null);
  }, [clearRunUpdates]);

  const loadNextPageForRun = useCallback(async (
    run: MultiSearchScraperRun,
    termRun: MultiSearchTermRun,
    paceConfig: PaceConfig,
    token: number,
  ): Promise<MultiSearchScraperRun | null> => {
    const searchTerm = termRun.term.trim();

    if (!searchTerm) {
      return run;
    }

    queueRunUpdate(token, {
      ...run,
      status: "loading",
      error: undefined,
    });

    try {
      const searchConfig = getSearchConfig(run.scraper);
      const pageIndex = termRun.loadedPages;
      const page = await fetchSearchPageWithRetry(
        run.scraper,
        searchConfig,
        searchTerm,
        pageIndex,
        termRun.nextPageUrl,
        paceConfig,
      );
      const pageResults = buildSourceResults(run.scraper, page, pageIndex, searchTerm);
      const newPageResults = keepNewSourceResults(run.results, pageResults);
      const hasOnlyDuplicateUrls = pageResults.length > 0 && newPageResults.length === 0;
      const nextTermRun: MultiSearchTermRun = {
        ...termRun,
        loadedPages: pageIndex + 1,
        hasNextPage: !hasOnlyDuplicateUrls && resolveHasNextPage(searchConfig, page),
        currentPageUrl: page.currentPageUrl,
        nextPageUrl: page.nextPageUrl,
      };
      const nextSearchTerms = upsertTermRun(run.searchTerms, nextTermRun);
      const paginationSummary = summarizeTermRuns(nextSearchTerms);
      const nextRun: MultiSearchScraperRun = {
        ...run,
        status: "done",
        results: [...run.results, ...newPageResults],
        searchTerms: nextSearchTerms,
        ...paginationSummary,
        error: undefined,
      };

      queueRunUpdate(token, nextRun, newPageResults.length, !nextRun.hasNextPage);
      return nextRun;
    } catch (loadError) {
      const hasPartialResults = run.loadedPages > 0 || run.results.length > 0;
      const failedTermRun: MultiSearchTermRun = {
        ...termRun,
        hasNextPage: false,
      };
      const nextSearchTerms = upsertTermRun(run.searchTerms, failedTermRun);
      const paginationSummary = summarizeTermRuns(nextSearchTerms);

      if (hasPartialResults) {
        const partialRun: MultiSearchScraperRun = {
          ...run,
          status: "done",
          searchTerms: nextSearchTerms,
          ...paginationSummary,
          error: undefined,
        };

        queueRunUpdate(token, partialRun, 0, true);
        return partialRun;
      }

      const failedRun: MultiSearchScraperRun = {
        ...run,
        status: "error",
        searchTerms: nextSearchTerms,
        ...paginationSummary,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      queueRunUpdate(token, failedRun, 0, true);
      return failedRun;
    }
  }, [queueRunUpdate]);

  const loadNextPagesForRun = useCallback(async (
    run: MultiSearchScraperRun,
    fallbackTerms: string[],
    paceConfig: PaceConfig,
    token: number,
  ): Promise<MultiSearchScraperRun | null> => {
    let currentRun: MultiSearchScraperRun = {
      ...run,
      searchTerms: ensureRunSearchTerms(run, fallbackTerms),
    };
    const loadableTerms = currentRun.searchTerms.filter((termRun) => termRun.hasNextPage);

    if (!loadableTerms.length) {
      return currentRun;
    }

    for (const termRun of loadableTerms) {
      if (token !== searchTokenRef.current) {
        return null;
      }

      const currentTermRun = currentRun.searchTerms.find((candidate) => candidate.term === termRun.term);
      if (!currentTermRun?.hasNextPage) {
        continue;
      }

      const nextRun = await loadNextPageForRun(currentRun, currentTermRun, paceConfig, token);
      if (!nextRun) {
        return null;
      }

      currentRun = nextRun;
    }

    return currentRun;
  }, [loadNextPageForRun]);

  const runSearch = useCallback(async ({
    query,
    scrapers,
    maxPages,
    paceMode,
  }: RunSearchOptions) => {
    const searchTerms = parseMultiSearchTerms(query);
    if (!searchTerms.length) {
      setError("Saisis une recherche avant de lancer le multi-search.");
      return;
    }

    if (!scrapers.length) {
      clearRunUpdates();
      setError("Aucun scrapper compatible n'est selectionne.");
      setRuns([]);
      return;
    }

    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    lastPaceModeRef.current = paceMode;
    clearRunUpdates();
    const paceConfig = getPaceConfig(paceMode);
    const pageLimit = Math.max(1, maxPages);

    setRuns(scrapers.map((scraper) => buildInitialRun(scraper, searchTerms)));
    setIsSearching(true);
    setError(null);
    setMessage(null);

    const tasks = scrapers.map((scraper) => async () => {
      let currentRun = buildInitialRun(scraper, searchTerms);

      try {
        for (let pageOffset = 0; pageOffset < pageLimit; pageOffset += 1) {
          if (token !== searchTokenRef.current) {
            return;
          }

          const loadedPagesBefore = currentRun.loadedPages;
          const nextRun = await loadNextPagesForRun(currentRun, searchTerms, paceConfig, token);

          if (!nextRun) {
            return;
          }

          currentRun = nextRun;
          if (currentRun.loadedPages === loadedPagesBefore || !currentRun.hasNextPage) {
            return;
          }
        }
      } finally {
        flushRunUpdates(token);
      }
    });

    try {
      await runWithConcurrency(tasks, paceConfig.concurrency);
      if (token === searchTokenRef.current) {
        flushRunUpdates(token);
        setMessage("Recherche multi-sources terminee sur les pages chargees.");
      }
    } finally {
      if (token === searchTokenRef.current) {
        flushRunUpdates(token);
        setIsSearching(false);
      }
    }
  }, [clearRunUpdates, flushRunUpdates, loadNextPagesForRun]);

  const loadMoreForScraper = useCallback(async (scraperId: string, query: string) => {
    const run = runs.find((candidate) => candidate.scraper.id === scraperId);
    const searchTerms = parseMultiSearchTerms(query);
    if (!run || !run.hasNextPage || !searchTerms.length) {
      return;
    }

    const token = searchTokenRef.current;
    setError(null);
    setMessage(null);
    await loadNextPagesForRun(run, searchTerms, getPaceConfig(lastPaceModeRef.current), token);
    flushRunUpdates(token);
  }, [flushRunUpdates, loadNextPagesForRun, runs]);

  const loadMoreForAll = useCallback(async (query: string) => {
    const searchTerms = parseMultiSearchTerms(query);
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    if (!searchTerms.length || !loadableRuns.length) {
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
          try {
            await loadNextPagesForRun(run, searchTerms, paceConfig, token);
          } finally {
            flushRunUpdates(token);
          }
        }),
        paceConfig.concurrency,
      );
      if (token === searchTokenRef.current) {
        flushRunUpdates(token);
        setMessage("Pages supplementaires chargees pour les scrappers disponibles.");
      }
    } finally {
      if (token === searchTokenRef.current) {
        flushRunUpdates(token);
        setIsSearching(false);
      }
    }
  }, [flushRunUpdates, loadNextPagesForRun, runs]);

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
