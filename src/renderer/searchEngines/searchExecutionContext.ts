import type {
  FetchScraperDocumentRequest,
  FetchScraperDocumentResult,
} from "@/shared/scraper";
import type { ScraperRequestDiagnosticContext } from "@/shared/scraperLatestDiagnostics";
import {
  createScraperCardDetailsCache,
  type ScraperCardDetailsCache,
  type ScraperDocumentFetcher,
} from "@/renderer/utils/scraperRuntime";
import {
  createScraperListingPagePrefetchCache,
  type ScraperListingPagePrefetchCache,
} from "@/renderer/utils/scraperLatestExecutionPlanning";
import { appendScraperLatestDiagnosticEvent } from "@/renderer/utils/scraperLatestDiagnostics";

export type SearchExecutionMode = "foreground" | "background";

export type SearchExecutionContext = {
  kind: string;
  mode: SearchExecutionMode;
  backgroundJobId?: string;
  detailsCache: ScraperCardDetailsCache;
  fetchDocument: ScraperDocumentFetcher;
  requestCache: Map<string, Promise<FetchScraperDocumentResult>>;
  getPagePrefetchCache: <Value>(namespace: string) => ScraperListingPagePrefetchCache<Value>;
  checkpointAdapter: SearchCheckpointAdapter;
  diagnostics?: ScraperRequestDiagnosticContext;
};

export type SearchCheckpointAdapter = {
  fingerprint: (input: unknown) => string;
  isCompatible: (fingerprint: string | null | undefined, input: unknown) => boolean;
};

export type CreateSearchExecutionContextOptions = {
  kind: string;
  mode?: SearchExecutionMode;
  backgroundJobId?: string;
  diagnostics?: ScraperRequestDiagnosticContext;
  persistDocuments?: boolean;
};

const buildRequestKey = (request: FetchScraperDocumentRequest): string => JSON.stringify({
  scraperId: request.scraperId ?? "",
  baseUrl: request.baseUrl,
  targetUrl: request.targetUrl,
  requestConfig: request.requestConfig ?? null,
  validateImage: request.validateImage === true,
});

const stableCheckpointValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableCheckpointValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, stableCheckpointValue(entry)]));
};

export const buildSearchCheckpointFingerprint = (kind: string, input: unknown): string => {
  const serialized = JSON.stringify(stableCheckpointValue(input));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `search1_${kind}_${(hash >>> 0).toString(36)}`;
};

export const createSearchExecutionContext = (
  options: CreateSearchExecutionContextOptions,
): SearchExecutionContext => {
  const requestCache = new Map<string, Promise<FetchScraperDocumentResult>>();
  const pagePrefetchCaches = new Map<string, ScraperListingPagePrefetchCache<unknown>>();
  const api = (window as unknown as {
    api?: { fetchScraperDocument?: ScraperDocumentFetcher };
  }).api;
  const fetchApi = api?.fetchScraperDocument;
  const checkpointAdapter: SearchCheckpointAdapter = {
    fingerprint: (input) => buildSearchCheckpointFingerprint(options.kind, input),
    isCompatible: (fingerprint, input) => Boolean(
      fingerprint && fingerprint === buildSearchCheckpointFingerprint(options.kind, input)
    ),
  };
  const fetchDocument: ScraperDocumentFetcher = async (request) => {
    if (typeof fetchApi !== "function") {
      throw new Error("Le runtime du scrapper n'est pas disponible dans cette version.");
    }
    const enrichedRequest: FetchScraperDocumentRequest = {
      ...request,
      ...(request.diagnostics || !options.diagnostics ? {} : { diagnostics: options.diagnostics }),
      ...(options.persistDocuments && options.backgroundJobId && !request.validateImage ? {
        searchCache: {
          scopeId: options.backgroundJobId,
          ttlMs: 24 * 60 * 60 * 1000,
        },
      } : {}),
    };
    const requestKey = buildRequestKey(enrichedRequest);
    const cached = requestCache.get(requestKey);
    if (cached) {
      appendScraperLatestDiagnosticEvent(
        options.diagnostics ? { profileId: options.diagnostics.profileId } : null,
        "cache.memory-hit",
        { targetUrl: request.targetUrl },
        options.diagnostics?.sourceKey,
      );
      return cached;
    }
    appendScraperLatestDiagnosticEvent(
      options.diagnostics ? { profileId: options.diagnostics.profileId } : null,
      "cache.memory-miss",
      { targetUrl: request.targetUrl },
      options.diagnostics?.sourceKey,
    );

    const pending = fetchApi(enrichedRequest);
    requestCache.set(requestKey, pending);
    try {
      const result = await pending;
      if (!result.ok) requestCache.delete(requestKey);
      return result;
    } catch (error) {
      if (requestCache.get(requestKey) === pending) requestCache.delete(requestKey);
      throw error;
    }
  };

  return {
    kind: options.kind,
    mode: options.mode ?? "foreground",
    backgroundJobId: options.backgroundJobId,
    detailsCache: createScraperCardDetailsCache(),
    fetchDocument,
    requestCache,
    getPagePrefetchCache: <Value,>(namespace: string): ScraperListingPagePrefetchCache<Value> => {
      const existing = pagePrefetchCaches.get(namespace);
      if (existing) return existing as ScraperListingPagePrefetchCache<Value>;
      const cache = createScraperListingPagePrefetchCache<Value>((event) => {
        appendScraperLatestDiagnosticEvent(
          options.diagnostics ? { profileId: options.diagnostics.profileId } : null,
          `prefetch.${event.type}`,
          {
            namespace,
            requestKey: event.requestKey,
            replacedRequestKey: event.replacedRequestKey,
            entryCount: event.entryCount,
          },
          event.sourceKey,
        );
      });
      pagePrefetchCaches.set(namespace, cache as ScraperListingPagePrefetchCache<unknown>);
      return cache;
    },
    checkpointAdapter,
    diagnostics: options.diagnostics,
  };
};

export const getOrCreateSearchExecutionContext = (
  existing: SearchExecutionContext | undefined,
  options: CreateSearchExecutionContextOptions,
): SearchExecutionContext => existing ?? createSearchExecutionContext(options);
