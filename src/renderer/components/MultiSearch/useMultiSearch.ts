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
  MultiSearchSourceResult,
  MultiSearchTermRun,
} from "@/renderer/components/MultiSearch/types";

type RunSearchOptions = {
  query: string;
  scrapers: ScraperRecord[];
  maxPages: number;
  paceMode: MultiSearchPaceMode;
};

const buildInitialTermRun = (term: string): MultiSearchTermRun => ({
  term,
  loadedPages: 0,
  hasNextPage: true,
});

const summarizeTermRuns = (
  searchTerms: MultiSearchTermRun[],
): Pick<MultiSearchScraperRun, "loadedPages" | "hasNextPage" | "currentPageUrl" | "nextPageUrl"> => {
  const activeNextTerm = searchTerms.find((termRun) => termRun.hasNextPage);
  const lastLoadedTerm = [...searchTerms].reverse().find((termRun) => termRun.currentPageUrl);

  return {
    loadedPages: searchTerms.reduce((total, termRun) => total + termRun.loadedPages, 0),
    hasNextPage: Boolean(activeNextTerm),
    currentPageUrl: lastLoadedTerm?.currentPageUrl,
    nextPageUrl: activeNextTerm?.nextPageUrl,
  };
};

const buildInitialRun = (scraper: ScraperRecord, searchTerms: string[]): MultiSearchScraperRun => ({
  scraper,
  status: "waiting",
  results: [],
  searchTerms: searchTerms.map(buildInitialTermRun),
  loadedPages: 0,
  hasNextPage: searchTerms.length > 0,
});

const ensureRunSearchTerms = (
  run: MultiSearchScraperRun,
  fallbackTerms: string[],
): MultiSearchTermRun[] => {
  if (run.searchTerms.length) {
    return run.searchTerms;
  }

  return fallbackTerms.map((term, index) => ({
    term,
    loadedPages: index === 0 ? run.loadedPages : 0,
    hasNextPage: index === 0 ? run.hasNextPage : false,
    currentPageUrl: index === 0 ? run.currentPageUrl : undefined,
    nextPageUrl: index === 0 ? run.nextPageUrl : undefined,
  }));
};

const upsertTermRun = (
  searchTerms: MultiSearchTermRun[],
  nextTermRun: MultiSearchTermRun,
): MultiSearchTermRun[] => {
  const existingIndex = searchTerms.findIndex((termRun) => termRun.term === nextTermRun.term);
  if (existingIndex === -1) {
    return [...searchTerms, nextTermRun];
  }

  return searchTerms.map((termRun, index) => (
    index === existingIndex ? nextTermRun : termRun
  ));
};

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
    termRun: MultiSearchTermRun,
    paceConfig: PaceConfig,
    token: number,
  ): Promise<MultiSearchScraperRun | null> => {
    const scraperId = run.scraper.id;
    const searchTerm = termRun.term.trim();

    if (!searchTerm) {
      return run;
    }

    patchRun(token, scraperId, (currentRun) => ({
      ...currentRun,
      status: "loading",
      error: undefined,
    }));

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

      patchRun(token, scraperId, () => nextRun);
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

        patchRun(token, scraperId, () => partialRun);
        return partialRun;
      }

      const failedRun: MultiSearchScraperRun = {
        ...run,
        status: "error",
        searchTerms: nextSearchTerms,
        ...paginationSummary,
        error: loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.",
      };

      patchRun(token, scraperId, () => failedRun);
      return failedRun;
    }
  }, [patchRun]);

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
      setError("Aucun scrapper compatible n'est selectionne.");
      setRuns([]);
      return;
    }

    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    lastPaceModeRef.current = paceMode;
    const paceConfig = getPaceConfig(paceMode);
    const pageLimit = Math.max(1, maxPages);

    setRuns(scrapers.map((scraper) => buildInitialRun(scraper, searchTerms)));
    setIsSearching(true);
    setError(null);
    setMessage(null);

    const tasks = scrapers.map((scraper) => async () => {
      let currentRun = buildInitialRun(scraper, searchTerms);

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
  }, [loadNextPagesForRun]);

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
  }, [loadNextPagesForRun, runs]);

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
          await loadNextPagesForRun(run, searchTerms, paceConfig, token);
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
  }, [loadNextPagesForRun, runs]);

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
