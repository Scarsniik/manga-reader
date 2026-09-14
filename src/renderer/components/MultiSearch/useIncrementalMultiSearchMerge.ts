import { useEffect, useRef, useState } from "react";
import type {
  MultiSearchMergeOptions,
  MultiSearchMergeProgress,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import type {
  BackendMultiSearchMergeResponse,
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  areMultiSearchMergeOptionsEqual,
  normalizeMultiSearchMergeOptions,
} from "@/renderer/components/MultiSearch/multiSearchMerge";
import useVisualMultiSearchMerge from "@/renderer/components/MultiSearch/useVisualMultiSearchMerge";

type MergeCache = {
  sourceCount: number;
  sourceRefs: WeakSet<MultiSearchSourceResult>;
  refreshKey: number;
  options: MultiSearchMergeOptions;
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

const buildMergeCache = (
  sources: MultiSearchSourceResult[],
  refreshKey: number,
  options: MultiSearchMergeOptions,
): MergeCache => {
  const sourceRefs = new WeakSet<MultiSearchSourceResult>();
  sources.forEach((source) => sourceRefs.add(source));
  return {
    sourceCount: sources.length,
    sourceRefs,
    refreshKey,
    options,
  };
};

const shouldRebuildMergeCache = (
  cache: MergeCache,
  sources: MultiSearchSourceResult[],
  refreshKey: number,
  options: MultiSearchMergeOptions,
): boolean => (
  cache.refreshKey !== refreshKey
  || !areMultiSearchMergeOptionsEqual(cache.options, options)
  || sources.length < cache.sourceCount
  || (
    sources.length > 0
    && cache.sourceCount > 0
    && sources.every((source) => !cache.sourceRefs.has(source))
  )
);

let nextMergeSessionId = 0;

export default function useIncrementalMultiSearchMerge(
  sources: MultiSearchSourceResult[],
  refreshKey: number,
  optionsInput?: Partial<MultiSearchMergeOptions> | null,
  visualCoverMatchingEnabled = false,
): IncrementalMultiSearchMergeResult {
  const options = normalizeMultiSearchMergeOptions(optionsInput);
  const preferredTitleLanguageCodesKey = options.preferredTitleLanguageCodes.join("|");
  const cacheRef = useRef<MergeCache>(buildMergeCache([], refreshKey, options));
  const sessionIdRef = useRef("");
  if (!sessionIdRef.current) {
    nextMergeSessionId += 1;
    sessionIdRef.current = `multi-search-merge-${Date.now()}-${nextMergeSessionId}`;
  }
  const requestIdRef = useRef(0);
  const responseHandlerRef = useRef<(response: MultiSearchMergeWorkerResponse) => void>(() => undefined);
  const [mergedResults, setMergedResults] = useState<MultiSearchMergedResult[]>([]);
  const [mergeProgress, setMergeProgress] = useState<MultiSearchMergeProgress>(buildIdleMergeProgress());

  responseHandlerRef.current = (response) => {
    if (response.refreshKey !== cacheRef.current.refreshKey) return;
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
    if (response.requestId !== requestIdRef.current) return;
    setMergedResults(response.mergedResults);
    setMergeProgress(buildIdleMergeProgress(
      response.sourceCount,
      response.mergedResults.length,
      response.durationMs,
    ));
  };

  useEffect(() => {
    const unsubscribe = window.api?.onMultiSearchMergeWorkerProgress?.((
      message: BackendMultiSearchMergeResponse,
    ) => {
      if (
        message.sessionId === sessionIdRef.current
        && (message.response.type === "progress" || message.response.type === "merged")
      ) {
        responseHandlerRef.current(message.response);
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
      void window.api?.disposeMultiSearchMergeWorker?.(sessionIdRef.current);
    };
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    const shouldClear = sources.length === 0;
    const shouldReset = shouldClear || shouldRebuildMergeCache(cache, sources, refreshKey, options);
    const newSources = shouldReset
      ? sources
      : sources.filter((source) => !cache.sourceRefs.has(source));
    const startsFreshMerge = shouldReset || (
      cache.sourceCount === 0
      && newSources.length === sources.length
    );
    if (!shouldReset && !newSources.length && cache.sourceCount === sources.length) return;
    if (startsFreshMerge) setMergedResults([]);

    const previousSourceCount = shouldReset ? 0 : cache.sourceCount;
    const nextCache = shouldReset
      ? buildMergeCache(newSources, refreshKey, options)
      : cache;
    if (!shouldReset) {
      newSources.forEach((source) => nextCache.sourceRefs.add(source));
      nextCache.sourceCount = sources.length;
      nextCache.refreshKey = refreshKey;
      nextCache.options = options;
    }
    cacheRef.current = nextCache;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setMergeProgress((currentProgress) => shouldClear
      ? buildIdleMergeProgress()
      : {
        isActive: true,
        phase: "queued",
        processedSourceCount: Math.min(previousSourceCount, sources.length),
        totalSourceCount: sources.length,
        sourceCount: Math.min(previousSourceCount, sources.length),
        mergedGroupCount: shouldReset ? 0 : currentProgress.mergedGroupCount,
      }
    );

    const request: MultiSearchMergeWorkerRequest = shouldClear
      ? {
        type: "clear",
        requestId,
        refreshKey,
        options,
      }
      : {
        type: shouldReset ? "reset" : "append",
        sources: newSources,
        requestId,
        refreshKey,
        options,
      };

    void window.api?.runMultiSearchMergeWorker?.(sessionIdRef.current, request)
      .then((response: MultiSearchMergeWorkerResponse) => {
        responseHandlerRef.current(response);
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return;
        console.warn("Failed to merge multi-search results in the backend worker", error);
        setMergeProgress((current) => buildIdleMergeProgress(
          sources.length,
          current.mergedGroupCount,
        ));
      });
  }, [
    options.assumeSameAuthor,
    options.enableRomajiPhoneticMerge,
    preferredTitleLanguageCodesKey,
    refreshKey,
    sources,
  ]);

  const visualMerge = useVisualMultiSearchMerge(
    sources.length ? mergedResults : [],
    options,
    visualCoverMatchingEnabled,
  );

  return {
    mergedResults: visualMerge.mergedResults,
    mergeProgress,
  };
}
