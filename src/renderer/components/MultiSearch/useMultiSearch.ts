import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MultiSearchBackgroundInput } from "@/shared/backgroundSearch";
import type { ForegroundSearchSnapshotEvent } from "@/shared/searchWorker";
import type { MultiSearchScraperRun } from "@/renderer/components/MultiSearch/types";
import {
  buildInitialRun,
  cancelMultiSearchRun,
  isMultiSearchRunActive,
} from "@/renderer/components/MultiSearch/multiSearchRunState";
import { parseMultiSearchTerms } from "@/renderer/components/MultiSearch/multiSearchUtils";

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
  const activeExecutionIdRef = useRef<string | null>(null);
  const cancelledScraperIdsRef = useRef(new Set<string>());
  const lastInputRef = useRef<MultiSearchBackgroundInput | null>(null);
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

  useEffect(() => () => {
    const executionId = activeExecutionIdRef.current;
    if (executionId) void window.api?.cancelSearchWorker?.(executionId);
  }, []);

  const beginExecution = useCallback(() => {
    const previousExecutionId = activeExecutionIdRef.current;
    if (previousExecutionId) void window.api?.cancelSearchWorker?.(previousExecutionId);
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    const executionId = `foreground-multi-${Date.now()}-${token}`;
    activeExecutionIdRef.current = executionId;
    return { executionId, token };
  }, []);

  const restoreRuns = useCallback((
    restoredRuns: MultiSearchScraperRun[],
    paceMode: MultiSearchBackgroundInput["paceMode"],
    includedLanguageCodes: string[],
    restoredScrapeDetailsWithCards: boolean,
    restoredOriginalOnly = false,
  ) => {
    const executionId = activeExecutionIdRef.current;
    if (executionId) void window.api?.cancelSearchWorker?.(executionId);
    activeExecutionIdRef.current = null;
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
    const executionId = activeExecutionIdRef.current;
    if (executionId) void window.api?.cancelSearchWorker?.(executionId);
    activeExecutionIdRef.current = null;
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

    const { executionId, token } = beginExecution();
    cancelledScraperIdsRef.current.clear();
    lastInputRef.current = input;
    setRuns(input.scrapers.map((scraper) => buildInitialRun(scraper, searchTerms)));
    setIsSearching(true);
    setError(null);
    setMessage(null);

    const unsubscribe = window.api?.onSearchWorkerSnapshot?.((event: ForegroundSearchSnapshotEvent) => {
      if (event.executionId !== executionId || token !== searchTokenRef.current) return;
      const result = event.result as { runs?: MultiSearchScraperRun[] };
      if (Array.isArray(result.runs)) setRuns(result.runs);
    });
    try {
      const result = await window.api.runForegroundMultiSearchWorker({
        executionId,
        input,
      }) as { runs?: MultiSearchScraperRun[] };
      if (token === searchTokenRef.current) {
        if (Array.isArray(result.runs)) setRuns(result.runs);
        setMessage("Recherche multi-sources terminee sur les pages chargees.");
      }
    } catch (runError) {
      if (token === searchTokenRef.current) {
        setError(runError instanceof Error ? runError.message : "Echec temporaire de la recherche.");
      }
    } finally {
      if (typeof unsubscribe === "function") unsubscribe();
      if (token === searchTokenRef.current) {
        activeExecutionIdRef.current = null;
        setIsSearching(false);
      }
    }
  }, [beginExecution]);

  const stopSearch = useCallback(() => {
    const executionId = activeExecutionIdRef.current;
    if (executionId) void window.api?.cancelSearchWorker?.(executionId);
    activeExecutionIdRef.current = null;
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
    const executionId = activeExecutionIdRef.current;
    if (executionId) void window.api?.cancelSearchWorkerScraper?.(executionId, scraperId);
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
    const { executionId, token } = beginExecution();
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

    const unsubscribe = window.api?.onSearchWorkerSnapshot?.((event: ForegroundSearchSnapshotEvent) => {
      if (event.executionId !== executionId || token !== searchTokenRef.current) return;
      const result = event.result as { runs?: MultiSearchScraperRun[] };
      if (Array.isArray(result.runs)) {
        setRuns((currentRuns) => replaceRunsByScraper(currentRuns, result.runs!));
      }
    });
    try {
      const result = await window.api.runForegroundMultiSearchWorker({
        executionId,
        input,
        initialRuns: sourceRuns,
        pageCount: 1,
      }) as { runs?: MultiSearchScraperRun[] };
      if (token === searchTokenRef.current) {
        if (Array.isArray(result.runs)) {
          setRuns((currentRuns) => replaceRunsByScraper(currentRuns, result.runs!));
        }
        setMessage(successMessage);
      }
    } catch (loadError) {
      if (token === searchTokenRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Echec temporaire du chargement.");
      }
    } finally {
      if (typeof unsubscribe === "function") unsubscribe();
      if (token === searchTokenRef.current) {
        activeExecutionIdRef.current = null;
        setIsSearching(false);
      }
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
