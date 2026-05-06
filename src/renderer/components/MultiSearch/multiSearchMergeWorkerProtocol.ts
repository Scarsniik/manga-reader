import type {
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
};

export type MultiSearchMergeWorkerResponse = {
  type: "merged";
  requestId: number;
  refreshKey: number;
  mergedResults: MultiSearchMergedResult[];
  sourceCount: number;
};
