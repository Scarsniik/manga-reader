import type {
  FetchScraperDocumentResult,
  ScraperCardListConfig,
  ScraperRecord,
  ScraperRequestConfig,
} from "@/shared/scraper";
import type { ScraperRequestDiagnosticContext } from "@/shared/scraperLatestDiagnostics";
import { appendScraperLatestDiagnosticEvent } from "@/renderer/utils/scraperLatestDiagnostics";
import {
  enrichScraperSearchPageWithDetails,
  type ScraperCardDetailsCache,
  type ScraperCardDetailsProgress,
} from "@/renderer/utils/scraperRuntime/cardDetailsEnrichment";
import { getScraperDetailsFeatureConfig, getScraperFeature } from "@/renderer/utils/scraperRuntime/featureConfig";
import {
  isScraperListingPaginationEndError,
  throwIfScraperListingPaginationEnded,
} from "@/renderer/utils/scraperRuntime/listingPagination";
import { extractScraperSearchPageFromDocumentWithImageFallbacks } from "@/renderer/utils/scraperRuntime/searchExtraction";
import type {
  ScraperDocumentFetcher,
  ScraperRuntimeSearchPageResult,
} from "@/renderer/utils/scraperRuntime/types";

export type ScraperListingDetailsOptions = {
  scrapeDetailsWithCards?: boolean;
  detailConcurrency?: number;
  diagnostics?: ScraperRequestDiagnosticContext;
  detailsCache?: ScraperCardDetailsCache;
  onProgress?: (progress: ScraperListingPageProgress) => void;
};

export type ScraperListingPageProgress =
  | { phase: "fetching" }
  | { phase: "extracting" }
  | ({ phase: "enriching" } & ScraperCardDetailsProgress);

export type FetchResolvedScraperListingPageOptions = ScraperListingDetailsOptions & {
  scraper: ScraperRecord;
  config: ScraperCardListConfig;
  targetUrl: string;
  pageIndex: number;
  usesTemplatePaging: boolean;
  requestConfig?: ScraperRequestConfig;
  responseLabel: string;
  failureMessage: string;
  fetchDocument?: ScraperDocumentFetcher;
};

export const attachScraperRequestDiagnostics = <Request extends object>(
  request: Request,
  diagnostics?: ScraperRequestDiagnosticContext,
  purpose?: string,
): Request & { diagnostics?: ScraperRequestDiagnosticContext } => ({
  ...request,
  ...(diagnostics
    ? {
      diagnostics: {
        ...diagnostics,
        purpose: purpose ?? diagnostics.purpose,
      },
    }
    : {}),
});

const getFetchScraperDocument = (): ScraperDocumentFetcher => {
  const fetchScraperDocument = (window as any).api?.fetchScraperDocument;
  if (typeof fetchScraperDocument !== "function") {
    throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
  }
  return fetchScraperDocument as ScraperDocumentFetcher;
};

export const fetchResolvedScraperListingPageLocally = async ({
  scraper,
  config,
  targetUrl,
  pageIndex,
  usesTemplatePaging,
  requestConfig,
  responseLabel,
  failureMessage,
  scrapeDetailsWithCards,
  detailConcurrency,
  diagnostics,
  detailsCache,
  onProgress,
  fetchDocument,
}: FetchResolvedScraperListingPageOptions): Promise<ScraperRuntimeSearchPageResult> => {
  const fetchScraperDocument = fetchDocument ?? getFetchScraperDocument();
  onProgress?.({ phase: "fetching" });
  const documentResult = await fetchScraperDocument(attachScraperRequestDiagnostics({
    scraperId: scraper.id,
    baseUrl: scraper.baseUrl,
    targetUrl,
    requestConfig,
  }, diagnostics)) as FetchScraperDocumentResult;

  if (!documentResult?.ok || !documentResult.html) {
    throwIfScraperListingPaginationEnded(documentResult, {
      pageIndex,
      targetUrl,
      usesTemplatePaging,
    });
    throw new Error(
      documentResult?.error
      || (typeof documentResult?.status === "number"
        ? `${responseLabel} a repondu avec le code HTTP ${documentResult.status}.`
        : failureMessage),
    );
  }

  onProgress?.({ phase: "extracting" });
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(documentResult.html, "text/html");
  const page = await extractScraperSearchPageFromDocumentWithImageFallbacks(documentNode, config, {
    requestedUrl: documentResult.requestedUrl,
    finalUrl: documentResult.finalUrl,
  }, async (request) => fetchScraperDocument(attachScraperRequestDiagnostics(
    { ...request, scraperId: request.scraperId ?? scraper.id },
    diagnostics,
    `${diagnostics?.purpose ?? "listing"}.asset`,
  )));

  return enrichScraperSearchPageWithDetails(page, {
    enabled: scrapeDetailsWithCards === true,
    scraper,
    detailsConfig: getScraperDetailsFeatureConfig(getScraperFeature(scraper, "details")),
    fetchDocument: async (request) => fetchScraperDocument(
      attachScraperRequestDiagnostics({ ...request, scraperId: request.scraperId ?? scraper.id }, diagnostics),
    ),
    concurrency: detailConcurrency,
    detailsCache,
    onProgress: (progress) => onProgress?.({
      phase: "enriching",
      ...progress,
    }),
  });
};

let nextListingPageWorkerExecutionId = 0;

export const fetchResolvedScraperListingPage = async (
  options: FetchResolvedScraperListingPageOptions,
): Promise<ScraperRuntimeSearchPageResult> => {
  const api = (window as unknown as {
    api?: {
      runSearchListingPageWorker?: (request: {
        executionId: string;
        options: unknown;
      }) => Promise<ScraperRuntimeSearchPageResult>;
      onSearchListingPageProgress?: (callback: (event: {
        executionId: string;
        progress: ScraperListingPageProgress;
      }) => void) => (() => void) | void;
    };
  }).api;
  if (options.fetchDocument || typeof api?.runSearchListingPageWorker !== "function") {
    return fetchResolvedScraperListingPageLocally(options);
  }

  nextListingPageWorkerExecutionId += 1;
  const executionId = `listing-page-${Date.now()}-${nextListingPageWorkerExecutionId}`;
  const unsubscribe = api.onSearchListingPageProgress?.((event) => {
    if (event.executionId === executionId) options.onProgress?.(event.progress);
  });
  const {
    detailsCache: _detailsCache,
    fetchDocument: _fetchDocument,
    onProgress: _onProgress,
    ...serializableOptions
  } = options;
  try {
    return await api.runSearchListingPageWorker({
      executionId,
      options: serializableOptions,
    });
  } finally {
    if (typeof unsubscribe === "function") unsubscribe();
  }
};

export type ScraperPageRetryOptions = {
  pageIndex: number;
  retryCount: number;
  pageDelayMs: number;
  loadPage: () => Promise<ScraperRuntimeSearchPageResult>;
  failureMessage: string;
  diagnostics?: ScraperRequestDiagnosticContext;
};

const wait = (delayMs: number): Promise<void> => (
  delayMs > 0
    ? new Promise((resolve) => window.setTimeout(resolve, delayMs))
    : Promise.resolve()
);

export const fetchScraperPageWithRetry = async ({
  pageIndex,
  retryCount,
  pageDelayMs,
  loadPage,
  failureMessage,
  diagnostics,
}: ScraperPageRetryOptions): Promise<ScraperRuntimeSearchPageResult> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      if (attempt > 0 || pageIndex > 0) {
        appendScraperLatestDiagnosticEvent(
          diagnostics ? { profileId: diagnostics.profileId } : null,
          "pace.wait",
          {
            pageIndex,
            attempt,
            delayMs: pageDelayMs,
            reason: attempt > 0 ? "retry-before-attempt" : "page-pacing",
          },
          diagnostics?.sourceKey,
        );
        await wait(pageDelayMs);
      }
      return await loadPage();
    } catch (error) {
      lastError = error;
      if (isScraperListingPaginationEndError(error)) throw error;
      if (attempt < retryCount) {
        appendScraperLatestDiagnosticEvent(
          diagnostics ? { profileId: diagnostics.profileId } : null,
          "pace.wait",
          {
            pageIndex,
            attempt,
            delayMs: pageDelayMs,
            reason: "retry-after-failure",
          },
          diagnostics?.sourceKey,
        );
        await wait(pageDelayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(failureMessage);
};
