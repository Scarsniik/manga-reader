import type {
  MultiSearchMergePhase,
  MultiSearchMergeOptions,
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";

export type MultiSearchMergeWorkerRequest = (
  | {
    type: "reset";
    sources: MultiSearchSourceResult[];
  }
  | {
    type: "append";
    sources: MultiSearchSourceResult[];
  }
  | {
    type: "clear";
  }
) & {
  requestId: number;
  refreshKey: number;
  options: MultiSearchMergeOptions;
};

export type MultiSearchMergeWorkerProgressResponse = {
  type: "progress";
  requestId: number;
  refreshKey: number;
  phase: Exclude<MultiSearchMergePhase, "idle" | "queued">;
  processedSourceCount: number;
  totalSourceCount: number;
  sourceCount: number;
  mergedGroupCount: number;
};

export type MultiSearchMergeWorkerMergedResponse = {
  type: "merged";
  requestId: number;
  refreshKey: number;
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
  durationMs: number;
};

export type MultiSearchMergeWorkerResponse =
  | MultiSearchMergeWorkerProgressResponse
  | MultiSearchMergeWorkerMergedResponse;
