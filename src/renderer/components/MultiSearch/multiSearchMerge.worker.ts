import type {
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  createMultiSearchMergeState,
  mergeMultiSearchSourceIntoState,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";

const PROGRESS_INTERVAL_MS = 120;

type WorkerScope = {
  postMessage: (message: MultiSearchMergeWorkerResponse) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<MultiSearchMergeWorkerRequest>) => void,
  ) => void;
};

const workerScope = self as unknown as WorkerScope;
let mergeState = createMultiSearchMergeState();
let sourceCount = 0;
let currentRefreshKey = 0;

const getTimestamp = (): number => (
  typeof performance === "undefined" ? Date.now() : performance.now()
);

const resetMergeState = (): void => {
  mergeState = createMultiSearchMergeState();
  sourceCount = 0;
};

const postMergeProgress = (
  request: MultiSearchMergeWorkerRequest,
  phase: "merging" | "sorting",
  processedSourceCount: number,
  totalSourceCount: number,
): void => {
  workerScope.postMessage({
    type: "progress",
    requestId: request.requestId,
    refreshKey: request.refreshKey,
    phase,
    processedSourceCount,
    totalSourceCount,
    sourceCount: processedSourceCount,
    mergedGroupCount: mergeState.groups.length,
  });
};

const postMergedResults = (
  request: MultiSearchMergeWorkerRequest,
  startedAt: number,
): void => {
  workerScope.postMessage({
    type: "merged",
    requestId: request.requestId,
    refreshKey: request.refreshKey,
    mergedResults: sortMultiSearchMergedResults(mergeState.groups),
    sourceCount,
    durationMs: Math.round(getTimestamp() - startedAt),
  });
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  const startedAt = getTimestamp();

  if (request.type === "clear") {
    resetMergeState();
    currentRefreshKey = request.refreshKey;
    postMergedResults(request, startedAt);
    return;
  }

  if (request.type === "reset" || request.refreshKey !== currentRefreshKey) {
    resetMergeState();
    currentRefreshKey = request.refreshKey;
  }

  const startingSourceCount = sourceCount;
  const totalSourceCount = startingSourceCount + request.sources.length;
  let lastProgressAt = 0;

  if (request.sources.length) {
    postMergeProgress(request, "merging", startingSourceCount, totalSourceCount);
  }

  request.sources.forEach((source, index) => {
    mergeMultiSearchSourceIntoState(mergeState, source);
    const nextSourceCount = startingSourceCount + index + 1;
    const now = getTimestamp();

    if (now - lastProgressAt >= PROGRESS_INTERVAL_MS || index === request.sources.length - 1) {
      lastProgressAt = now;
      postMergeProgress(request, "merging", nextSourceCount, totalSourceCount);
    }
  });

  sourceCount = totalSourceCount;
  postMergeProgress(request, "sorting", sourceCount, sourceCount);
  postMergedResults(request, startedAt);
});
