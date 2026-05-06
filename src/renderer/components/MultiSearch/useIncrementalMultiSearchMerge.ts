import { useEffect, useRef, useState } from "react";
import type {
  MultiSearchMergeProgress,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type {
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  createMultiSearchMergeState,
  mergeMultiSearchSourceIntoState,
  sortMultiSearchMergedResults,
  type MultiSearchMergeState,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import MergeWorker from "@/renderer/components/MultiSearch/multiSearchMerge.worker?worker";

type MergeCache = {
  mergeState: MultiSearchMergeState;
  sourceCount: number;
  sourceRefs: WeakSet<MultiSearchSourceResult>;
  refreshKey: number;
};

type IncrementalMultiSearchMergeResult = {
  mergedResults: MultiSearchMergedResult[];
  mergeProgress: MultiSearchMergeProgress;
};

const buildIdleMergeProgress = (
  sourceCount = 0,
  mergedGroupCount = 0,
  durationMs?: number,
): MultiSearchMergeProgress => ({
  isActive: false,
  phase: "idle",
  processedSourceCount: sourceCount,
  totalSourceCount: sourceCount,
  sourceCount,
  mergedGroupCount,
  durationMs,
});

const buildEmptyMergeCache = (refreshKey: number): MergeCache => ({
  mergeState: createMultiSearchMergeState(),
  sourceCount: 0,
  sourceRefs: new WeakSet<MultiSearchSourceResult>(),
  refreshKey,
});

const buildMergeCache = (
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): MergeCache => {
  const cache = buildEmptyMergeCache(refreshKey);

  sources.forEach((source) => {
    mergeMultiSearchSourceIntoState(cache.mergeState, source);
    cache.sourceRefs.add(source);
  });
  cache.sourceCount = sources.length;

  return cache;
};

const shouldRebuildMergeCache = (
  cache: MergeCache,
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): boolean => (
  cache.refreshKey !== refreshKey
  || sources.length < cache.sourceCount
  || (
    sources.length > 0
    && cache.sourceCount > 0
    && sources.every((source) => !cache.sourceRefs.has(source))
  )
);

const createMergeWorker = (): Worker | null => {
  if (typeof Worker === "undefined") {
    return null;
  }

  try {
    return new MergeWorker();
  } catch {
    return null;
  }
};

export default function useIncrementalMultiSearchMerge(
  sources: MultiSearchSourceResult[],
  refreshKey: number,
): IncrementalMultiSearchMergeResult {
  const cacheRef = useRef<MergeCache>(buildEmptyMergeCache(refreshKey));
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [mergedResults, setMergedResults] = useState<MultiSearchMergedResult[]>([]);
  const [mergeProgress, setMergeProgress] = useState<MultiSearchMergeProgress>(buildIdleMergeProgress());

  useEffect(() => {
    workerRef.current = createMergeWorker();
    const worker = workerRef.current;
    if (!worker) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent<MultiSearchMergeWorkerResponse>) => {
      const response = event.data;
      if (
        response.refreshKey !== cacheRef.current.refreshKey
      ) {
        return;
      }

      if (response.type === "progress") {
        setMergeProgress({
          isActive: true,
          phase: response.phase,
          processedSourceCount: response.processedSourceCount,
          totalSourceCount: Math.max(response.totalSourceCount, cacheRef.current.sourceCount),
          sourceCount: response.sourceCount,
          mergedGroupCount: response.mergedGroupCount,
        });
        return;
      }

      if (response.requestId !== requestIdRef.current) {
        return;
      }

      setMergedResults(response.mergedResults);
      setMergeProgress(buildIdleMergeProgress(
        response.sourceCount,
        response.mergedResults.length,
        response.durationMs,
      ));
    };

    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    const worker = workerRef.current;
    const shouldClear = sources.length === 0;
    const shouldReset = shouldClear || shouldRebuildMergeCache(cache, sources, refreshKey);
    const newSources = shouldReset
      ? sources
      : sources.filter((source) => !cache.sourceRefs.has(source));
    const startsFreshMerge = shouldReset || (
      cache.sourceCount === 0
      && newSources.length === sources.length
    );

    if (!shouldReset && !newSources.length && cache.sourceCount === sources.length) {
      return;
    }

    if (!worker) {
      const startedAt = Date.now();
      const nextCache = shouldReset
        ? buildMergeCache(sources, refreshKey)
        : cache;

      if (!shouldReset) {
        newSources.forEach((source) => {
          mergeMultiSearchSourceIntoState(nextCache.mergeState, source);
          nextCache.sourceRefs.add(source);
        });
        nextCache.sourceCount = sources.length;
      }

      cacheRef.current = nextCache;
      const nextMergedResults = sortMultiSearchMergedResults(nextCache.mergeState.groups);
      setMergedResults(nextMergedResults);
      setMergeProgress(buildIdleMergeProgress(
        nextCache.sourceCount,
        nextMergedResults.length,
        Date.now() - startedAt,
      ));
      return;
    }

    if (startsFreshMerge) {
      setMergedResults([]);
    }

    const previousSourceCount = shouldReset ? 0 : cache.sourceCount;
    const nextCache = shouldReset
      ? buildEmptyMergeCache(refreshKey)
      : cache;

    newSources.forEach((source) => nextCache.sourceRefs.add(source));
    nextCache.sourceCount = sources.length;
    nextCache.refreshKey = refreshKey;
    cacheRef.current = nextCache;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setMergeProgress((currentProgress) => (
      shouldClear
        ? buildIdleMergeProgress()
        : {
          isActive: true,
          phase: "queued",
          processedSourceCount: Math.min(previousSourceCount, sources.length),
          totalSourceCount: sources.length,
          sourceCount: Math.min(previousSourceCount, sources.length),
          mergedGroupCount: shouldReset ? 0 : currentProgress.mergedGroupCount,
        }
    ));

    const request: MultiSearchMergeWorkerRequest = shouldClear
      ? {
        type: "clear",
        requestId,
        refreshKey,
      }
      : {
        type: shouldReset ? "reset" : "append",
        sources: newSources,
        requestId,
        refreshKey,
      };

    worker.postMessage(request);
  }, [refreshKey, sources]);

  return {
    mergedResults: sources.length ? mergedResults : [],
    mergeProgress,
  };
}
