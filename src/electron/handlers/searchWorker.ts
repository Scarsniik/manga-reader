import path from "node:path";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type {
  BackgroundSearchJob,
  BackgroundSearchProgress,
} from "@/shared/backgroundSearch";
import type {
  RunForegroundMultiSearchRequest,
  RunForegroundListingSearchRequest,
  SearchWorkerChildMessage,
  SearchWorkerExecutionMode,
  SearchWorkerParentMessage,
  SearchWorkerStartRequest,
} from "@/shared/searchWorker";
import type {
  VisualImageFingerprint,
  VisualImageFingerprintInput,
  VisualImageFingerprintRequest,
  VisualImageFingerprintResponse,
  VisualImageFingerprintResult,
} from "@/shared/visualImageFingerprint";
import * as backgroundSearch from "./backgroundSearch";
import * as params from "./params";
import * as scrapers from "./scrapers";
import * as authorCorrespondenceSessionCache from "./authorCorrespondenceSessionCache";
import type { BackgroundSearchExecutionResult } from "@/renderer/backgroundSearch/types";

type SearchWorkerExecution = {
  worker: Worker;
  mode: SearchWorkerExecutionMode;
  event: IpcMainInvokeEvent;
  snapshotChain: Promise<void>;
  settled: boolean;
};

type SnapshotHandler = (
  result: unknown | undefined,
  progress: BackgroundSearchProgress,
) => Promise<void>;

type ListingProgressHandler = (progress: unknown) => void;

const activeExecutions = new Map<string, SearchWorkerExecution>();
const visualFingerprintCache = new Map<string, VisualImageFingerprint>();
const MAX_VISUAL_FINGERPRINT_CACHE_ENTRIES = 5_000;

const notifyScraperAuthorFavoritesUpdated = (): void => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send("scraper-author-favorites-updated");
  });
};

const getCompletedProgress = (result: BackgroundSearchExecutionResult): BackgroundSearchProgress => {
  if ("runs" in result) {
    return {
      completedUnits: result.runs.length,
      totalUnits: result.runs.length,
      resultCount: result.runs.reduce((count, run) => count + run.results.length, 0),
      excludedResultCount: result.runs.reduce(
        (count, run) => count
          + ("excludedByBlacklistedTagCount" in run
            ? run.excludedByBlacklistedTagCount ?? 0
            : 0)
          + ("excludedByOriginalCount" in run
            ? run.excludedByOriginalCount ?? 0
            : 0),
        0,
      ),
    };
  }
  const completedUnits = "searchedNames" in result
    ? result.searchedNames.length
    : result.searchedTitles.length + result.searchedAuthors.length;
  return {
    completedUnits,
    totalUnits: completedUnits,
    resultCount: result.matches.length,
  };
};

const getWorkerEntryPath = (): string => (
  path.join(__dirname, "../workers/searchExecutionWorker.js")
);

const toErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const callWorkerService = async (
  execution: SearchWorkerExecution,
  method: string,
  args: unknown[],
): Promise<unknown> => {
  const firstArgument = args[0];
  switch (method) {
    case "fetchScraperDocument":
      return scrapers.fetchScraperDocument(execution.event, firstArgument as never);
    case "getSettings":
      return params.getSettings();
    case "getScraperViewHistory":
      return scrapers.getScraperViewHistory(execution.event, firstArgument as string | null | undefined);
    case "getScraperLatestCheckpoints":
      return scrapers.getScraperLatestCheckpoints(
        execution.event,
        firstArgument as string | null | undefined,
      );
    case "saveScraperLatestCheckpoint":
      return scrapers.saveScraperLatestCheckpoint(execution.event, firstArgument as never);
    case "getScraperAuthorFavoriteCache":
      return scrapers.getScraperAuthorFavoriteCache(execution.event, firstArgument as string);
    case "saveScraperAuthorFavoriteCache": {
      const saved = await scrapers.saveScraperAuthorFavoriteCache(execution.event, firstArgument as never);
      notifyScraperAuthorFavoritesUpdated();
      return saved;
    }
    case "getScraperTagListCache":
      return scrapers.getScraperTagListCache(firstArgument as string);
    case "getScraperEntityListCache":
      return scrapers.getScraperEntityListCache(firstArgument as never);
    case "addScraperTagListCacheItems":
      return scrapers.addScraperTagListCacheItems(firstArgument as never);
    case "addScraperEntityListCacheItems":
      return scrapers.addScraperEntityListCacheItems(firstArgument as never);
    case "getScraperAuthorFavorites":
      return scrapers.getScraperAuthorFavorites();
    case "getScrapers":
      return scrapers.getScrapers();
    case "startScraperLatestDiagnostics":
      return scrapers.startScraperLatestDiagnostics(execution.event, firstArgument as never);
    case "appendScraperLatestDiagnosticEvent":
      return scrapers.appendScraperLatestDiagnosticEvent(execution.event, firstArgument as never);
    case "finishScraperLatestDiagnostics":
      return scrapers.finishScraperLatestDiagnostics(execution.event, firstArgument as never);
    case "getAuthorCorrespondenceSessionCache":
      return authorCorrespondenceSessionCache.loadAuthorCorrespondenceSessionCache(firstArgument);
    case "setAuthorCorrespondenceSessionCache":
      return authorCorrespondenceSessionCache.persistAuthorCorrespondenceSessionCache(
        firstArgument,
        args[1],
      );
    case "getBackgroundSearchQueue":
      return backgroundSearch.getBackgroundSearchQueue();
    case "getBackgroundSearchJob":
      return backgroundSearch.getBackgroundSearchJob(firstArgument as string);
    case "updateBackgroundSearchRelation":
      return backgroundSearch.updateBackgroundSearchRelation(firstArgument as never);
    case "replayBackgroundSearch":
      return backgroundSearch.replayBackgroundSearch(firstArgument as never);
    default:
      throw new Error(`Search worker service is not allowed to call ${method}.`);
  }
};

const runWorker = (
  event: IpcMainInvokeEvent,
  request: SearchWorkerStartRequest,
  onSnapshot: SnapshotHandler,
  onListingProgress: ListingProgressHandler = () => undefined,
): Promise<unknown> => new Promise((resolve, reject) => {
  if (activeExecutions.has(request.executionId)) {
    reject(new Error("A search with this identifier is already running."));
    return;
  }

  const worker = new Worker(getWorkerEntryPath());
  const execution: SearchWorkerExecution = {
    worker,
    mode: request.mode,
    event,
    snapshotChain: Promise.resolve(),
    settled: false,
  };
  activeExecutions.set(request.executionId, execution);

  const settle = async (error?: Error, result?: unknown): Promise<void> => {
    if (execution.settled) return;
    execution.settled = true;
    activeExecutions.delete(request.executionId);
    await execution.snapshotChain.catch(() => undefined);
    await worker.terminate().catch(() => undefined);
    if (error) reject(error);
    else resolve(result);
  };

  worker.on("message", (message: SearchWorkerChildMessage) => {
    if (message.type === "snapshot") {
      execution.snapshotChain = execution.snapshotChain
        .then(() => onSnapshot(message.result, message.progress))
        .catch((error) => {
          console.warn("Failed to persist a search worker snapshot", error);
        });
      return;
    }
    if (message.type === "listingProgress") {
      onListingProgress(message.progress);
      return;
    }
    if (message.type === "rpc") {
      void callWorkerService(execution, message.method, message.args)
        .then((value) => {
          worker.postMessage({
            type: "rpcResponse",
            requestId: message.requestId,
            value,
          } satisfies SearchWorkerParentMessage);
        })
        .catch((error) => {
          worker.postMessage({
            type: "rpcResponse",
            requestId: message.requestId,
            error: toErrorMessage(error),
          } satisfies SearchWorkerParentMessage);
        });
      return;
    }
    if (message.type === "completed") {
      void settle(undefined, message.result);
      return;
    }
    if (message.type === "failed") {
      void settle(new Error(message.cancelled ? "Search cancelled." : message.error));
    }
  });
  worker.once("error", (error) => void settle(error));
  worker.once("exit", (code) => {
    if (!execution.settled && code !== 0) {
      void settle(new Error(`Search worker stopped with exit code ${code}.`));
    }
  });
  worker.postMessage(request satisfies SearchWorkerParentMessage);
});

export const runBackgroundSearchWorker = async (
  event: IpcMainInvokeEvent,
  jobId: string,
): Promise<unknown> => {
  const job = await backgroundSearch.getBackgroundSearchJob(jobId);
  if (!job || job.metadata.status !== "running") {
    throw new Error("The background search is not available or was not claimed.");
  }
  try {
    const result = await runWorker(event, {
      type: "start",
      executionId: jobId,
      mode: "background",
      job: job as BackgroundSearchJob,
    }, async (snapshot, progress) => {
      await backgroundSearch.updateBackgroundSearch({
        jobId,
        progress,
        ...(snapshot === undefined ? {} : { result: snapshot }),
      });
    }) as BackgroundSearchExecutionResult;
    if (
      "runs" in result
      && result.runs.length > 0
      && result.runs.every((run) => run.status === "error")
    ) {
      throw new Error(result.runs.find((run) => run.error)?.error || "Toutes les sources ont échoué.");
    }
    await backgroundSearch.completeBackgroundSearch({
      jobId,
      result,
      progress: getCompletedProgress(result),
    });
    return true;
  } catch (error) {
    const currentJob = await backgroundSearch.getBackgroundSearchJob(jobId);
    if (currentJob?.metadata.status === "running") {
      await backgroundSearch.failBackgroundSearch(jobId, toErrorMessage(error));
    }
    throw error;
  }
};

export const runForegroundMultiSearchWorker = (
  event: IpcMainInvokeEvent,
  request: RunForegroundMultiSearchRequest,
): Promise<unknown> => runWorker(event, {
  type: "start",
  mode: "foregroundMultiSearch",
  ...request,
}, async (result, progress) => {
  if (result === undefined || event.sender.isDestroyed()) return;
  event.sender.send("search-worker-snapshot", {
    executionId: request.executionId,
    result,
    progress,
  });
});

export const runForegroundListingSearchWorker = (
  event: IpcMainInvokeEvent,
  request: RunForegroundListingSearchRequest,
): Promise<unknown> => runWorker(event, {
  type: "start",
  mode: "foregroundListing",
  executionId: request.executionId,
  listingKind: request.kind,
  listingInput: request.input,
  initialRuns: request.initialRuns,
  appendToExistingResults: request.appendToExistingResults,
}, async (result, progress) => {
  if (result === undefined || event.sender.isDestroyed()) return;
  event.sender.send("search-worker-snapshot", {
    executionId: request.executionId,
    result,
    progress,
  });
});

export const runListingPageWorker = (
  event: IpcMainInvokeEvent,
  request: { executionId: string; options: unknown },
): Promise<unknown> => runWorker(event, {
  type: "start",
  mode: "listingPage",
  executionId: request.executionId,
  listingPageOptions: request.options,
}, async () => undefined, (progress) => {
  if (!event.sender.isDestroyed()) {
    event.sender.send("search-listing-page-progress", {
      executionId: request.executionId,
      progress,
    });
  }
});

export const runBackgroundSearchAutomationWorker = (
  event: IpcMainInvokeEvent,
  request: NonNullable<SearchWorkerStartRequest["automationRequest"]>,
): Promise<unknown> => runWorker(event, {
  type: "start",
  mode: "backgroundAutomation",
  executionId: `background-automation-${randomUUID()}`,
  automationRequest: request,
}, async () => undefined);

export const cancelSearchWorker = (executionId: string): boolean => {
  const execution = activeExecutions.get(executionId);
  if (!execution) return false;
  execution.worker.postMessage({
    type: "cancel",
    executionId,
  } satisfies SearchWorkerParentMessage);
  return true;
};

export const cancelSearchWorkerScraper = (executionId: string, scraperId: string): boolean => {
  const execution = activeExecutions.get(executionId);
  if (!execution || execution.mode !== "foregroundMultiSearch") return false;
  execution.worker.postMessage({
    type: "cancelScraper",
    executionId,
    scraperId,
  } satisfies SearchWorkerParentMessage);
  return true;
};

const getVisualFingerprintCacheKey = (input: VisualImageFingerprintInput): string => (
  `${input.url.trim()}\n${String(input.refererUrl ?? "").trim()}`
);

export const runVisualFingerprintWorker = async (
  event: IpcMainInvokeEvent,
  request: VisualImageFingerprintRequest,
): Promise<VisualImageFingerprintResponse> => {
  const images = Array.isArray(request?.images) ? request.images.slice(0, 2_000) : [];
  const cachedResults = new Map<number, VisualImageFingerprintResult>();
  const missingImages: VisualImageFingerprintInput[] = [];
  const missingIndexes: number[] = [];
  images.forEach((input, index) => {
    const fingerprint = visualFingerprintCache.get(getVisualFingerprintCacheKey(input));
    if (fingerprint) cachedResults.set(index, { key: input.key, fingerprint });
    else {
      missingImages.push(input);
      missingIndexes.push(index);
    }
  });
  if (missingImages.length) {
    const response = await runWorker(event, {
      type: "start",
      executionId: request.executionId || `visual-fingerprint-${randomUUID()}`,
      mode: "visualFingerprints",
      visualRequest: { images: missingImages },
    }, async () => undefined) as VisualImageFingerprintResponse;
    response.results.forEach((result, resultIndex) => {
      const input = missingImages[resultIndex];
      if (result.fingerprint) {
        if (visualFingerprintCache.size >= MAX_VISUAL_FINGERPRINT_CACHE_ENTRIES) {
          const oldestKey = visualFingerprintCache.keys().next().value;
          if (oldestKey) visualFingerprintCache.delete(oldestKey);
        }
        visualFingerprintCache.set(getVisualFingerprintCacheKey(input), result.fingerprint);
      }
      cachedResults.set(missingIndexes[resultIndex], { ...result, key: input.key });
    });
  }
  return {
    results: images.map((input, index) => cachedResults.get(index) ?? {
      key: input.key,
      error: "Image fingerprinting did not return a result.",
    }),
  };
};
