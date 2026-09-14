import { parentPort } from "node:worker_threads";
import type {
  BackgroundSearchProgress,
  ListingBackgroundInput,
  MultiSearchBackgroundInput,
} from "@/shared/backgroundSearch";
import type {
  SearchWorkerChildMessage,
  SearchWorkerParentMessage,
  SearchWorkerRpcResponse,
  SearchWorkerStartRequest,
} from "@/shared/searchWorker";
import type { MultiSearchScraperRun } from "@/renderer/components/MultiSearch/types";
import { executeBackgroundSearch } from "@/renderer/searchEngines/searchEngineRegistry";
import { runMultiSearchEngine } from "@/renderer/searchEngines/multiSearchEngine";
import {
  runAuthorFavoriteRefreshSearchEngine,
  runLatestAuthorsSearchEngine,
  runScraperAuthorSearchEngine,
  runScraperLatestSearch,
  runTagFavoriteSearchEngine,
} from "@/renderer/searchEngines/listingSearchEngine";
import { romanizeJapaneseTexts } from "@/electron/handlers/japaneseRomanization";
import sharp from "sharp";
import type {
  VisualImageFingerprint,
  VisualImageFingerprintInput,
  VisualImageFingerprintResponse,
  VisualImageFingerprintResult,
} from "@/shared/visualImageFingerprint";
import type {
  BackgroundSearchExecutionResult,
  ListingBackgroundResult,
} from "@/renderer/backgroundSearch/types";
import type { ScraperAuthorFavoriteCacheRecord } from "@/shared/scraper";
import {
  buildCompleteAuthorFavoriteCache,
  buildLatestAuthorCacheUpdates,
  mergeAuthorFavoriteCacheUpdate,
} from "@/renderer/utils/scraperAuthorFavoriteCache";
import {
  fetchResolvedScraperListingPageLocally,
  type FetchResolvedScraperListingPageOptions,
} from "@/renderer/utils/scraperRuntime/listingPageExecution";
import {
  automaticallyReuseExistingAuthorSearch,
  importLinkedAuthorSearchIntoManga,
  refreshMangaSearchesUsingAuthor,
} from "@/renderer/backgroundSearch/linkedAuthorSearchOrchestration";

const { DOMParser, Document, Element } = require("linkedom") as {
  DOMParser: typeof globalThis.DOMParser;
  Document: typeof globalThis.Document;
  Element: typeof globalThis.Element;
};

declare global {
  interface Window {
    api: any;
  }
}

const workerParentPort = parentPort;
if (!workerParentPort) {
  throw new Error("The search execution worker requires a parent port.");
}

type PendingRpc = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const controllers = new Map<string, AbortController>();
const cancelledScrapers = new Map<string, Set<string>>();
const pendingRpcs = new Map<number, PendingRpc>();
let nextRpcRequestId = 0;
const VISUAL_FINGERPRINT_SIZE = 24;
const MAX_VISUAL_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_VISUAL_IMAGE_COUNT = 2_000;
const VISUAL_FINGERPRINT_CONCURRENCY = 6;

const postMessage = (message: SearchWorkerChildMessage): void => {
  workerParentPort.postMessage(message);
};

const callMainProcess = (method: string, args: unknown[]): Promise<unknown> => {
  const requestId = nextRpcRequestId + 1;
  nextRpcRequestId = requestId;
  return new Promise((resolve, reject) => {
    pendingRpcs.set(requestId, { resolve, reject });
    postMessage({ type: "rpc", requestId, method, args });
  });
};

const workerApi = new Proxy<Record<string, (...args: unknown[]) => Promise<unknown>>>({
  romanizeJapaneseTexts: async (request: unknown) => romanizeJapaneseTexts(request as never),
}, {
  get(target, property) {
    if (typeof property !== "string") return undefined;
    // A search already running in this worker must execute listing extraction
    // locally instead of trying to spawn a nested search worker through preload.
    if (property === "runSearchListingPageWorker" || property === "onSearchListingPageProgress") {
      return undefined;
    }
    return target[property] ?? ((...args: unknown[]) => callMainProcess(property, args));
  },
});

const workerGlobal = globalThis as typeof globalThis & {
  window: typeof globalThis & { api: typeof workerApi };
  DOMParser: typeof globalThis.DOMParser;
  Document: typeof globalThis.Document;
  Element: typeof globalThis.Element;
};
workerGlobal.window = Object.assign(globalThis, { api: workerApi }) as unknown as typeof workerGlobal.window;
workerGlobal.DOMParser = DOMParser;
workerGlobal.Document = Document;
workerGlobal.Element = Element;

const createSnapshotEmitter = (executionId: string, mode: SearchWorkerStartRequest["mode"]) => {
  let lastProgressAt = 0;
  let lastResultAt = 0;

  return async (result: unknown, progress: BackgroundSearchProgress): Promise<void> => {
    const now = Date.now();
    const progressIntervalMs = mode === "background" ? 1_000 : 500;
    const resultIntervalMs = mode === "background" ? 30_000 : 2_000;
    const includeResult = now - lastResultAt >= resultIntervalMs;
    if (!includeResult && now - lastProgressAt < progressIntervalMs) return;

    lastProgressAt = now;
    if (includeResult) lastResultAt = now;
    postMessage({
      type: "snapshot",
      executionId,
      ...(includeResult ? { result } : {}),
      progress,
    });
  };
};

const createVisualImageFingerprint = async (imageBuffer: Buffer): Promise<VisualImageFingerprint> => {
  const sourceImage = sharp(imageBuffer).rotate();
  const metadata = await sourceImage.metadata();
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (!width || !height) throw new Error("Image dimensions are unavailable.");
  const luminance = await sourceImage
    .resize(VISUAL_FINGERPRINT_SIZE, VISUAL_FINGERPRINT_SIZE, { fit: "fill" })
    .grayscale()
    .blur(1)
    .normalize()
    .raw()
    .toBuffer();
  return {
    version: 1,
    width: VISUAL_FINGERPRINT_SIZE,
    height: VISUAL_FINGERPRINT_SIZE,
    luminanceBase64: luminance.toString("base64"),
    aspectRatio: width / height,
  };
};

const loadVisualImage = async (
  input: VisualImageFingerprintInput,
  signal: AbortSignal,
): Promise<Buffer> => {
  const sourceUrl = new URL(input.url);
  if (sourceUrl.protocol !== "http:" && sourceUrl.protocol !== "https:") {
    throw new Error("Unsupported image URL.");
  }
  const response = await fetch(sourceUrl, {
    signal,
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...(input.refererUrl ? { Referer: input.refererUrl } : {}),
    },
  });
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!response.ok || contentLength > MAX_VISUAL_IMAGE_BYTES) {
    throw new Error(response.ok ? "Remote image is too large." : "Remote URL did not return an image.");
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length > MAX_VISUAL_IMAGE_BYTES) throw new Error("Remote image is too large.");
  return imageBuffer;
};

const runVisualFingerprinting = async (
  request: SearchWorkerStartRequest,
  signal: AbortSignal,
): Promise<VisualImageFingerprintResponse> => {
  const images = request.visualRequest?.images.slice(0, MAX_VISUAL_IMAGE_COUNT) ?? [];
  const results = new Array<VisualImageFingerprintResult>(images.length);
  let nextIndex = 0;
  const processImages = async (): Promise<void> => {
    while (nextIndex < images.length && !signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      const input = images[index];
      try {
        results[index] = {
          key: input.key,
          fingerprint: await createVisualImageFingerprint(await loadVisualImage(input, signal)),
        };
      } catch (error) {
        results[index] = {
          key: input.key,
          error: error instanceof Error ? error.message : "Image fingerprinting failed.",
        };
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(VISUAL_FINGERPRINT_CONCURRENCY, images.length) },
    processImages,
  ));
  if (signal.aborted) throw new Error("Search cancelled.");
  return { results };
};

const runForegroundListingSearch = async (
  request: SearchWorkerStartRequest,
  signal: AbortSignal,
  emitSnapshot: ReturnType<typeof createSnapshotEmitter>,
): Promise<unknown> => {
  if (!request.listingInput || !request.listingKind) {
    throw new Error("Foreground listing search input is missing.");
  }
  const options = {
    mode: "foreground" as const,
    initialRuns: request.initialRuns as never,
    appendToExistingResults: request.appendToExistingResults,
  };
  switch (request.listingKind) {
    case "latestSources":
      return runScraperLatestSearch(request.listingInput, signal, emitSnapshot, options);
    case "scraperAuthor":
      return runScraperAuthorSearchEngine(request.listingInput, signal, emitSnapshot, options);
    case "latestAuthors":
      return runLatestAuthorsSearchEngine(request.listingInput, signal, emitSnapshot, options);
    case "authorFavoriteRefresh":
      return runAuthorFavoriteRefreshSearchEngine(request.listingInput, signal, emitSnapshot, options);
    case "tagFavorites":
      return runTagFavoriteSearchEngine(request.listingInput, signal, emitSnapshot, options);
  }
};

const runListingPage = (request: SearchWorkerStartRequest): Promise<unknown> => {
  if (!request.listingPageOptions) throw new Error("Listing page options are missing.");
  return fetchResolvedScraperListingPageLocally({
    ...request.listingPageOptions as FetchResolvedScraperListingPageOptions,
    onProgress: (progress) => {
      postMessage({
        type: "listingProgress",
        executionId: request.executionId,
        progress,
      });
    },
  });
};

const runBackgroundAutomation = (request: SearchWorkerStartRequest): Promise<unknown> => {
  const automation = request.automationRequest;
  if (!automation) throw new Error("Background search automation request is missing.");
  switch (automation.action) {
    case "importLinkedAuthorSearchIntoManga":
      return importLinkedAuthorSearchIntoManga(automation.options as never);
    case "automaticallyReuseExistingAuthorSearch":
      return automaticallyReuseExistingAuthorSearch(String(automation.jobId ?? ""));
    case "refreshMangaSearchesUsingAuthor":
      return refreshMangaSearchesUsingAuthor(String(automation.jobId ?? ""));
  }
};

const persistAuthorFavoriteCache = async (
  request: SearchWorkerStartRequest,
  result: BackgroundSearchExecutionResult,
): Promise<void> => {
  const job = request.job;
  if (
    !job
    || (job.metadata.kind !== "authorFavoriteRefresh" && job.metadata.kind !== "latestAuthors")
    || !("runs" in result)
  ) return;
  const input = job.input as ListingBackgroundInput;
  const listingResult = result as ListingBackgroundResult;
  if (job.metadata.kind === "authorFavoriteRefresh") {
    const cache = buildCompleteAuthorFavoriteCache(input, listingResult);
    if (cache) {
      await workerApi.saveScraperAuthorFavoriteCache({ favoriteId: cache.favoriteId, cache });
    }
    return;
  }
  const updates = buildLatestAuthorCacheUpdates(input, listingResult);
  await Promise.all(Array.from(updates.entries()).map(async ([favoriteId, update]) => {
    const existingCache = await workerApi.getScraperAuthorFavoriteCache(
      favoriteId,
    ) as ScraperAuthorFavoriteCacheRecord | null;
    await workerApi.saveScraperAuthorFavoriteCache({
      favoriteId,
      cache: mergeAuthorFavoriteCacheUpdate(existingCache, update),
    });
  }));
};

const runExecution = async (request: SearchWorkerStartRequest): Promise<void> => {
  const controller = new AbortController();
  controllers.set(request.executionId, controller);
  const cancelledScraperIds = new Set<string>();
  cancelledScrapers.set(request.executionId, cancelledScraperIds);
  const emitSnapshot = createSnapshotEmitter(request.executionId, request.mode);

  try {
    const result = request.mode === "background"
      ? await executeBackgroundSearch(
        request.job ?? (() => { throw new Error("Background search job is missing."); })(),
        controller.signal,
        emitSnapshot,
      )
      : request.mode === "foregroundMultiSearch"
        ? await runMultiSearchEngine(
        request.input as MultiSearchBackgroundInput,
        controller.signal,
        emitSnapshot,
        {
          initialRuns: request.initialRuns as MultiSearchScraperRun[] | undefined,
          pageCount: request.pageCount,
          shouldContinueScraper: (scraperId) => !cancelledScraperIds.has(scraperId),
        },
        )
        : request.mode === "foregroundListing"
          ? await runForegroundListingSearch(request, controller.signal, emitSnapshot)
          : request.mode === "listingPage"
            ? await runListingPage(request)
            : request.mode === "backgroundAutomation"
              ? await runBackgroundAutomation(request)
              : await runVisualFingerprinting(request, controller.signal);

    if (request.mode === "background") {
      await persistAuthorFavoriteCache(request, result as BackgroundSearchExecutionResult);
    }
    postMessage({
      type: "completed",
      executionId: request.executionId,
      result,
    });
  } catch (error) {
    postMessage({
      type: "failed",
      executionId: request.executionId,
      error: error instanceof Error ? error.message : String(error),
      cancelled: controller.signal.aborted,
    });
  } finally {
    controllers.delete(request.executionId);
    cancelledScrapers.delete(request.executionId);
  }
};

const resolveRpc = (message: SearchWorkerRpcResponse): void => {
  const pending = pendingRpcs.get(message.requestId);
  if (!pending) return;
  pendingRpcs.delete(message.requestId);
  if (message.error) {
    pending.reject(new Error(message.error));
  } else {
    pending.resolve(message.value);
  }
};

workerParentPort.on("message", (message: SearchWorkerParentMessage) => {
  if (message.type === "rpcResponse") {
    resolveRpc(message);
    return;
  }
  if (message.type === "cancel") {
    controllers.get(message.executionId)?.abort();
    return;
  }
  if (message.type === "cancelScraper") {
    cancelledScrapers.get(message.executionId)?.add(message.scraperId);
    return;
  }
  if (message.type === "start") {
    void runExecution(message);
  }
});
