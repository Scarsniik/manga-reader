import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackendMultiSearchListFilters,
  BackendMultiSearchListResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  buildMultiSearchSourceIdentityKey,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { processMultiSearchLists } from "@/renderer/components/MultiSearch/multiSearchListProcessing";

const LIST_WORKER_RESULT_THRESHOLD = 400;
const LIST_WORKER_FRAME_BUDGET_MS = 10;
const EMPTY_MULTI_SEARCH_RUNS: MultiSearchScraperRun[] = [];

type ProcessedLists = {
  results: MultiSearchMergedResult[];
  runs: MultiSearchScraperRun[];
  loading: boolean;
  workerActive: boolean;
  blacklistedResultCount: number;
  splitResultCount: number;
  languageResultCount: number;
  originalResultCount: number;
};

const buildSourceIndex = (
  results: MultiSearchMergedResult[],
  runs: MultiSearchScraperRun[],
): Map<string, MultiSearchSourceResult> => {
  const index = new Map<string, MultiSearchSourceResult>();
  results.forEach((result) => result.sources.forEach((source) => {
    index.set(buildMultiSearchSourceIdentityKey(source), source);
  }));
  runs.forEach((run) => run.results.forEach((source) => {
    index.set(buildMultiSearchSourceIdentityKey(source), source);
  }));
  return index;
};

const restoreWorkerResponse = (
  response: BackendMultiSearchListResponse,
  results: MultiSearchMergedResult[],
  runs: MultiSearchScraperRun[],
  sourceIndex: Map<string, MultiSearchSourceResult>,
): Omit<ProcessedLists, "loading" | "workerActive"> => {
  const restoredResults = response.results.map(({ sourceKeys, ...result }) => ({
    ...result,
    sources: sourceKeys
      .map((sourceKey) => sourceIndex.get(sourceKey))
      .filter((source): source is MultiSearchSourceResult => Boolean(source)),
  }));
  const runReferences = new Map(response.runs.map((run) => [run.scraperId, new Set(run.sourceKeys)]));
  const restoredRuns = runs.map((run) => {
    const visibleSourceKeys = runReferences.get(run.scraper.id);
    return {
      ...run,
      results: visibleSourceKeys
        ? run.results.filter((source) => visibleSourceKeys.has(buildMultiSearchSourceIdentityKey(source)))
        : [],
    };
  });
  return {
    results: restoredResults.filter((result) => result.sources.length > 0),
    runs: restoredRuns,
    blacklistedResultCount: response.blacklistedResultCount,
    splitResultCount: response.splitResultCount,
    languageResultCount: response.languageResultCount,
    originalResultCount: response.originalResultCount,
  };
};

let nextListSessionId = 0;

export default function useAdaptiveMultiSearchListProcessing(
  results: MultiSearchMergedResult[],
  runs: MultiSearchScraperRun[],
  filters: BackendMultiSearchListFilters,
): ProcessedLists {
  // Callers that only process merged cards naturally pass `[]`. JSX commonly
  // creates that array inline, so comparing its reference would manufacture a
  // new data revision on every render. A worker response would then cause the
  // next render/request forever. Canonicalize the empty value at this boundary.
  const stableRuns = runs.length ? runs : EMPTY_MULTI_SEARCH_RUNS;
  const sessionIdRef = useRef("");
  if (!sessionIdRef.current) {
    nextListSessionId += 1;
    sessionIdRef.current = `multi-search-list-${Date.now()}-${nextListSessionId}`;
  }
  const dataRef = useRef({ results, runs: stableRuns, revision: 0 });
  if (dataRef.current.results !== results || dataRef.current.runs !== stableRuns) {
    dataRef.current = { results, runs: stableRuns, revision: dataRef.current.revision + 1 };
  }
  const requestIdRef = useRef(0);
  const sentRevisionRef = useRef(-1);
  const lastLocalDurationRef = useRef(0);
  const sourceCount = useMemo(
    () => stableRuns.reduce((count, run) => count + run.results.length, 0),
    [stableRuns],
  );
  const workerAvailable = typeof window.api?.runMultiSearchListWorker === "function";
  const workerActive = workerAvailable && (
    results.length >= LIST_WORKER_RESULT_THRESHOLD
    || sourceCount >= LIST_WORKER_RESULT_THRESHOLD
    || lastLocalDurationRef.current > LIST_WORKER_FRAME_BUDGET_MS
  );
  const localLists = useMemo(() => {
    if (workerActive) return null;
    const startedAt = performance.now();
    const processed = processMultiSearchLists(results, stableRuns, filters);
    lastLocalDurationRef.current = performance.now() - startedAt;
    return processed;
  }, [filters, results, stableRuns, workerActive]);
  const sourceIndex = useMemo(
    () => buildSourceIndex(results, stableRuns),
    [results, stableRuns],
  );
  const [workerState, setWorkerState] = useState<{
    revision: number;
    results: MultiSearchMergedResult[];
    runs: MultiSearchScraperRun[];
    loading: boolean;
    blacklistedResultCount: number;
    splitResultCount: number;
    languageResultCount: number;
    originalResultCount: number;
  }>({
    revision: -1,
    results: [],
    runs: [],
    loading: false,
    blacklistedResultCount: 0,
    splitResultCount: 0,
    languageResultCount: 0,
    originalResultCount: 0,
  });

  useEffect(() => {
    if (!workerActive) return;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const dataRevision = dataRef.current.revision;
    const sendsData = sentRevisionRef.current !== dataRevision;
    setWorkerState((current) => ({ ...current, loading: true }));
    void window.api.runMultiSearchListWorker(sessionIdRef.current, {
      type: "listProcess",
      requestId,
      dataRevision,
      ...(sendsData ? { results, runs: stableRuns } : {}),
      filters,
    }).then((response: BackendMultiSearchListResponse) => {
      if (requestId !== requestIdRef.current || response.dataRevision !== dataRef.current.revision) return;
      sentRevisionRef.current = dataRevision;
      const restored = restoreWorkerResponse(response, results, stableRuns, sourceIndex);
      setWorkerState({ revision: dataRevision, ...restored, loading: false });
    }).catch((error: unknown) => {
      if (requestId !== requestIdRef.current) return;
      sentRevisionRef.current = -1;
      console.warn("Failed to process the result list in the backend worker", error);
      const fallback = processMultiSearchLists(results, stableRuns, filters);
      setWorkerState({ revision: dataRevision, ...fallback, loading: false });
    });
  }, [filters, results, stableRuns, sourceIndex, workerActive]);

  useEffect(() => () => {
    void window.api?.disposeMultiSearchMergeWorker?.(sessionIdRef.current);
  }, []);

  if (!workerActive && localLists) {
    return { ...localLists, loading: false, workerActive: false };
  }
  const hasCurrentData = workerState.revision === dataRef.current.revision;
  return {
    // Keep the last complete list visible while a new base revision is being
    // processed. Visual merging can publish a new array after fingerprinting;
    // clearing here made both the cards and series views incorrectly report
    // that no result matched until the shared worker became available again.
    results: hasCurrentData || workerState.revision >= 0 ? workerState.results : results,
    runs: hasCurrentData || workerState.revision >= 0 ? workerState.runs : stableRuns,
    loading: workerState.loading || !hasCurrentData,
    workerActive: true,
    blacklistedResultCount: hasCurrentData ? workerState.blacklistedResultCount : 0,
    splitResultCount: hasCurrentData ? workerState.splitResultCount : 0,
    languageResultCount: hasCurrentData ? workerState.languageResultCount : 0,
    originalResultCount: hasCurrentData ? workerState.originalResultCount : 0,
  };
}
