import type {
  BackgroundSearchJob,
  BackgroundSearchProgress,
  ListingBackgroundInput,
  MultiSearchBackgroundInput,
} from "@/shared/backgroundSearch";
import type { VisualImageFingerprintRequest } from "@/shared/visualImageFingerprint";

export type ForegroundListingSearchKind =
  | "latestSources"
  | "scraperAuthor"
  | "latestAuthors"
  | "authorFavoriteRefresh"
  | "tagFavorites";

export type SearchWorkerExecutionMode =
  | "background"
  | "foregroundMultiSearch"
  | "foregroundListing"
  | "listingPage"
  | "backgroundAutomation"
  | "visualFingerprints";

export type SearchWorkerStartRequest = {
  type: "start";
  executionId: string;
  mode: SearchWorkerExecutionMode;
  job?: BackgroundSearchJob;
  input?: MultiSearchBackgroundInput;
  initialRuns?: unknown[];
  pageCount?: number | null;
  visualRequest?: VisualImageFingerprintRequest;
  listingKind?: ForegroundListingSearchKind;
  listingInput?: ListingBackgroundInput;
  appendToExistingResults?: boolean;
  listingPageOptions?: unknown;
  automationRequest?: {
    action:
      | "importLinkedAuthorSearchIntoManga"
      | "automaticallyReuseExistingAuthorSearch"
      | "refreshMangaSearchesUsingAuthor";
    options?: unknown;
    jobId?: string;
  };
};

export type SearchWorkerCancelRequest = {
  type: "cancel";
  executionId: string;
};

export type SearchWorkerCancelScraperRequest = {
  type: "cancelScraper";
  executionId: string;
  scraperId: string;
};

export type SearchWorkerRpcResponse = {
  type: "rpcResponse";
  requestId: number;
  value?: unknown;
  error?: string;
};

export type SearchWorkerParentMessage =
  | SearchWorkerStartRequest
  | SearchWorkerCancelRequest
  | SearchWorkerCancelScraperRequest
  | SearchWorkerRpcResponse;

export type SearchWorkerSnapshotMessage = {
  type: "snapshot";
  executionId: string;
  result?: unknown;
  progress: BackgroundSearchProgress;
};

export type SearchWorkerCompletedMessage = {
  type: "completed";
  executionId: string;
  result: unknown;
};

export type SearchWorkerFailedMessage = {
  type: "failed";
  executionId: string;
  error: string;
  cancelled: boolean;
};

export type SearchWorkerRpcRequest = {
  type: "rpc";
  requestId: number;
  method: string;
  args: unknown[];
};

export type SearchWorkerListingProgressMessage = {
  type: "listingProgress";
  executionId: string;
  progress: unknown;
};

export type SearchWorkerChildMessage =
  | SearchWorkerSnapshotMessage
  | SearchWorkerCompletedMessage
  | SearchWorkerFailedMessage
  | SearchWorkerListingProgressMessage
  | SearchWorkerRpcRequest;

export type ForegroundSearchSnapshotEvent = {
  executionId: string;
  result: unknown;
  progress: BackgroundSearchProgress;
};

export type RunForegroundMultiSearchRequest = {
  executionId: string;
  input: MultiSearchBackgroundInput;
  initialRuns?: unknown[];
  pageCount?: number | null;
};

export type RunForegroundListingSearchRequest = {
  executionId: string;
  kind: ForegroundListingSearchKind;
  input: ListingBackgroundInput;
  initialRuns?: unknown[];
  appendToExistingResults?: boolean;
};
