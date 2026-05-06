import type {
  MultiSearchMergeWorkerRequest,
  MultiSearchMergeWorkerResponse,
} from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import type { MultiSearchMergedResult } from "@/renderer/components/MultiSearch/types";
import {
  mergeMultiSearchSourceIntoGroups,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";

type WorkerScope = {
  postMessage: (message: MultiSearchMergeWorkerResponse) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<MultiSearchMergeWorkerRequest>) => void,
  ) => void;
};

const workerScope = self as unknown as WorkerScope;
let groups: MultiSearchMergedResult[] = [];
let sourceCount = 0;
let currentRefreshKey = 0;

const postMergedResults = (request: MultiSearchMergeWorkerRequest) => {
  workerScope.postMessage({
    type: "merged",
    requestId: request.requestId,
    refreshKey: request.refreshKey,
    mergedResults: sortMultiSearchMergedResults(groups),
    sourceCount,
  });
};

workerScope.addEventListener("message", (event) => {
  const request = event.data;

  if (request.type === "clear") {
    groups = [];
    sourceCount = 0;
    currentRefreshKey = request.refreshKey;
    postMergedResults(request);
    return;
  }

  if (request.type === "reset" || request.refreshKey !== currentRefreshKey) {
    groups = [];
    sourceCount = 0;
    currentRefreshKey = request.refreshKey;
  }

  request.sources.forEach((source) => {
    mergeMultiSearchSourceIntoGroups(groups, source);
  });

  sourceCount += request.sources.length;
  postMergedResults(request);
});
