import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MultiSearchBackgroundInput } from "@/shared/backgroundSearch";
import type { MultiSearchScraperRun } from "@/renderer/components/MultiSearch/types";
import {
  buildInitialRun,
  cancelMultiSearchRun,
  isMultiSearchRunActive,
} from "@/renderer/components/MultiSearch/multiSearchRunState";
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";
import { createScraperCardDetailsCache } from "@/renderer/utils/scraperRuntime";
import { runMultiSearchEngine } from "@/renderer/searchEngines/multiSearchEngine";

type RunSearchOptions = MultiSearchBackgroundInput;

const replaceRunsByScraper = (
  currentRuns: MultiSearchScraperRun[],
  incomingRuns: MultiSearchScraperRun[],
): MultiSearchScraperRun[] => {
  const incomingByScraperId = new Map(incomingRuns.map((run) => [run.scraper.id, run]));
  return currentRuns.map((run) => incomingByScraperId.get(run.scraper.id) ?? run);
};

export default function useMultiSearch(scrapeDetailsWithCards: boolean) {
  const [runs, setRuns] = useState<MultiSearchScraperRun[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTokenRef = useRef(0);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const cancelledScraperIdsRef = useRef(new Set<string>());
  const lastInputRef = useRef<MultiSearchBackgroundInput | null>(null);
  const detailsCacheRef = useRef(createScraperCardDetailsCache());
  const canLoadMore = useMemo(
    () => runs.some((run) => run.hasNextPage && run.status !== "loading"),
    [runs],
  );
  const hasActiveRuns = useMemo(
    () => runs.some(isMultiSearchRunActive),
    [runs],
  );
  const canStopSearch = hasActiveRuns;

  useEffect(() => {
    if (!hasActiveRuns) setIsSearching(false);
  }, [hasActiveRuns]);

  useEffect(() => () => searchAbortControllerRef.current?.abort(), []);

  const beginExecution = useCallback(() => {
    searchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    return { controller, token };
  }, []);

  const restoreRuns = useCallback((
    restoredRuns: MultiSearchScraperRun[],
    paceMode: MultiSearchBackgroundInput["paceMode"],
    includedLanguageCodes: string[],
    restoredScrapeDetailsWithCards: boolean,
    restoredOriginalOnly = false,
  ) => {
    searchAbortControllerRef.current?.abort();
    searchTokenRef.current += 1;
    cancelledScraperIdsRef.current.clear();
    lastInputRef.current = {
      query: restoredRuns[0]?.searchTerms.map((term) => term.term).join(", ") ?? "",
      scrapers: restoredRuns.map((run) => run.scraper),
      maxPages: 1,
      paceMode,
      includedLanguageCodes,
      scrapeDetailsWithCards: restoredScrapeDetailsWithCards,
      originalOnly: restoredOriginalOnly,
      viewMode: "merged",
    };
    setRuns(restoredRuns.map((run) => (
      isMultiSearchRunActive(run) ? cancelMultiSearchRun(run) : run
    )));
    setIsSearching(false);
    setError(null);
    setMessage(restoredRuns.length ? "Recherche multi-sources restauree." : null);
  }, []);

  const replaceRuns = useCallback((nextRuns: MultiSearchScraperRun[]) => {
    searchAbortControllerRef.current?.abort();
    searchTokenRef.current += 1;
    cancelledScraperIdsRef.current.clear();
    setRuns(nextRuns);
    setIsSearching(nextRuns.some(isMultiSearchRunActive));
    setError(null);
    setMessage(null);
  }, []);

  const runSearch = useCallback(async (input: RunSearchOptions) => {
    const searchTerms = parseMultiSearchTerms(input.query);
    if (!searchTerms.length) {
      setError("Saisis une recherche avant de lancer le multi-search.");
      return;
    }
    if (!input.scrapers.length) {
      setError("Aucun scrapper compatible n'est selectionne.");
      setRuns([]);
      return;
    }

    const { controller, token } = beginExecution();
    cancelledScraperIdsRef.current.clear();
    detailsCacheRef.current = createScraperCardDetailsCache();
    lastInputRef.current = input;
    setRuns(input.scrapers.map((scraper) => buildInitialRun(scraper, searchTerms)));
    setIsSearching(true);
    setError(null);
    setMessage(null);

    try {
      await runMultiSearchEngine(input, controller.signal, async (result) => {
        if (token === searchTokenRef.current) setRuns(result.runs);
      }, {
        detailsCache: detailsCacheRef.current,
        shouldContinueScraper: (scraperId) => !cancelledScraperIdsRef.current.has(scraperId),
      });
      if (token === searchTokenRef.current) {
        setMessage("Recherche multi-sources terminee sur les pages chargees.");
      }
    } catch (runError) {
      if (token === searchTokenRef.current && !controller.signal.aborted) {
        setError(runError instanceof Error ? runError.message : "Echec temporaire de la recherche.");
      }
    } finally {
      if (token === searchTokenRef.current) setIsSearching(false);
    }
  }, [beginExecution]);

  const stopSearch = useCallback(() => {
    searchAbortControllerRef.current?.abort();
    searchTokenRef.current += 1;
    cancelledScraperIdsRef.current.clear();
    setRuns((currentRuns) => currentRuns.map((run) => (
      isMultiSearchRunActive(run) ? cancelMultiSearchRun(run) : run
    )));
    setIsSearching(false);
    setError(null);
    setMessage("Recherche multi-sources arretee.");
  }, []);

  const stopScraperSearch = useCallback((scraperId: string) => {
    cancelledScraperIdsRef.current.add(scraperId);
    setRuns((currentRuns) => currentRuns.map((run) => (
      run.scraper.id === scraperId && isMultiSearchRunActive(run)
        ? cancelMultiSearchRun(run)
        : run
    )));
    setError(null);
    setMessage("Recherche arretee pour ce scrapper.");
  }, []);

  const loadRuns = useCallback(async (
    sourceRuns: MultiSearchScraperRun[],
    query: string,
    successMessage: string,
  ) => {
    if (!sourceRuns.length) return;
    const previousInput = lastInputRef.current;
    if (!previousInput) return;
    const { controller, token } = beginExecution();
    cancelledScraperIdsRef.current.clear();
    setIsSearching(true);
    setError(null);
    setMessage(null);
    const input: MultiSearchBackgroundInput = {
      ...previousInput,
      query,
      scrapers: sourceRuns.map((run) => run.scraper),
      maxPages: 1,
      scrapeDetailsWithCards,
    };

    try {
      await runMultiSearchEngine(input, controller.signal, async (result) => {
        if (token === searchTokenRef.current) {
          setRuns((currentRuns) => replaceRunsByScraper(currentRuns, result.runs));
        }
      }, {
        initialRuns: sourceRuns,
        pageCount: 1,
        detailsCache: detailsCacheRef.current,
        shouldContinueScraper: (scraperId) => !cancelledScraperIdsRef.current.has(scraperId),
      });
      if (token === searchTokenRef.current) setMessage(successMessage);
    } catch (loadError) {
      if (token === searchTokenRef.current && !controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (token === searchTokenRef.current) setIsSearching(false);
    }
  }, [beginExecution, scrapeDetailsWithCards]);

  const loadMoreForScraper = useCallback(async (scraperId: string, query: string) => {
    const run = runs.find((candidate) => candidate.scraper.id === scraperId);
    if (!run?.hasNextPage || run.status === "loading") return;
    await loadRuns([run], query, "Page supplementaire chargee pour ce scrapper.");
  }, [loadRuns, runs]);

  const loadMoreForAll = useCallback(async (query: string) => {
    const loadableRuns = runs.filter((run) => run.hasNextPage && run.status !== "loading");
    await loadRuns(loadableRuns, query, "Pages supplementaires chargees pour les scrappers disponibles.");
  }, [loadRuns, runs]);

  return {
    runs,
    isSearching,
    message,
    error,
    canLoadMore,
    canStopSearch,
    restoreRuns,
    replaceRuns,
    runSearch,
    stopSearch,
    stopScraperSearch,
    loadMoreForAll,
    loadMoreForScraper,
  };
}
