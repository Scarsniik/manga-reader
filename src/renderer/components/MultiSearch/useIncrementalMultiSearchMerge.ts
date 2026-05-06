import { useEffect, useRef, useState } from "react";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type {
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  mergeMultiSearchSourceIntoGroups,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import MergeWorker from "@/renderer/components/MultiSearch/multiSearchMerge.worker?worker";

type MergeCache = {
  groups: MultiSearchMergedResult[];
  sourceCount: number;
  sourceRefs: WeakSet<MultiSearchSourceResult>;
  refreshKey: number;
};

const buildEmptyMergeCache = (refreshKey: number): MergeCache => ({
  groups: [],
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
    mergeMultiSearchSourceIntoGroups(cache.groups, source);
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
): MultiSearchMergedResult[] {
  const cacheRef = useRef<MergeCache>(buildEmptyMergeCache(refreshKey));
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [mergedResults, setMergedResults] = useState<MultiSearchMergedResult[]>([]);

  useEffect(() => {
    workerRef.current = createMergeWorker();
    const worker = workerRef.current;
    if (!worker) {
      return undefined;
    }

    const handleMessage = (event: MessageEvent<MultiSearchMergeWorkerResponse>) => {
      const response = event.data;
      if (
        response.type !== "merged"
        || response.requestId !== requestIdRef.current
        || response.refreshKey !== cacheRef.current.refreshKey
      ) {
        return;
      }

      setMergedResults(response.mergedResults);
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
      const nextCache = shouldReset
        ? buildMergeCache(sources, refreshKey)
        : cache;

      if (!shouldReset) {
        newSources.forEach((source) => {
          mergeMultiSearchSourceIntoGroups(nextCache.groups, source);
          nextCache.sourceRefs.add(source);
        });
        nextCache.sourceCount = sources.length;
      }

      cacheRef.current = nextCache;
      setMergedResults(sortMultiSearchMergedResults(nextCache.groups));
      return;
    }

    if (startsFreshMerge) {
      setMergedResults([]);
    }

    const nextCache = shouldReset
      ? buildEmptyMergeCache(refreshKey)
      : cache;

    newSources.forEach((source) => nextCache.sourceRefs.add(source));
    nextCache.sourceCount = sources.length;
    nextCache.refreshKey = refreshKey;
    cacheRef.current = nextCache;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

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

  return sources.length ? mergedResults : [];
}
