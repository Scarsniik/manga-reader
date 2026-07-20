import {
  normalizeScraperBaseUrl,
  type FetchScraperDocumentRequest,
  type ScraperRecord,
  type ScraperRequestLimits,
} from "../../scraper";
import { readScrapersFile } from "./storage";
import { getSettings } from "../params";
import { AdjustableRequestScheduler } from "../../utils/adjustableRequestScheduler";
import type { IpcMainInvokeEvent } from "electron";

type ReleaseRequestSlot = () => void;

type ScraperRequestLimitContext = {
  key: string;
  limits: ScraperRequestLimits;
};

let cachedScrapers: ScraperRecord[] | null = null;
let cachedScrapersPromise: Promise<ScraperRecord[]> | null = null;
let scraperCacheRevision = 0;
const DEFAULT_GLOBAL_CONCURRENCY = 2;
const MAX_GLOBAL_CONCURRENCY = 128;
let globalInitialization: Promise<void> | null = null;
let globalConcurrencyRevision = 0;
const requestScheduler = new AdjustableRequestScheduler(DEFAULT_GLOBAL_CONCURRENCY);
const BACKGROUND_REQUEST_PRIORITY = 0;
const INTERACTIVE_REQUEST_PRIORITY = 10;

const normalizeGlobalConcurrency = (value: unknown): number => (
  Math.min(MAX_GLOBAL_CONCURRENCY, Math.max(1, Math.floor(Number(value) || DEFAULT_GLOBAL_CONCURRENCY)))
);

export const setGlobalScraperRequestConcurrency = (value: unknown): void => {
  globalConcurrencyRevision += 1;
  requestScheduler.setLimit(normalizeGlobalConcurrency(value));
};

const ensureGlobalConcurrencyInitialized = async (): Promise<void> => {
  if (!globalInitialization) {
    const initializationRevision = globalConcurrencyRevision;
    globalInitialization = getSettings()
      .then((settings) => {
        if (globalConcurrencyRevision === initializationRevision) {
          requestScheduler.setLimit(normalizeGlobalConcurrency(settings.scraperLatestConcurrency));
        }
      })
      .catch((error) => {
        console.warn("Failed to initialize global scraper concurrency", error);
      });
  }
  await globalInitialization;
};

const hasActiveLimits = (limits: ScraperRequestLimits): boolean => (
  limits.minDelayMs > 0 || limits.maxConcurrentRequests > 0
);

export const invalidateScraperRequestLimitCache = (): void => {
  scraperCacheRevision += 1;
  cachedScrapers = null;
  cachedScrapersPromise = null;
};

const getScrapersForRequestLimits = async (): Promise<ScraperRecord[]> => {
  if (cachedScrapers) return cachedScrapers;
  if (!cachedScrapersPromise) {
    const revision = scraperCacheRevision;
    const loadingPromise = readScrapersFile().then((scrapers) => {
      if (scraperCacheRevision === revision) cachedScrapers = scrapers;
      return scrapers;
    }).finally(() => {
      if (cachedScrapersPromise === loadingPromise) cachedScrapersPromise = null;
    });
    cachedScrapersPromise = loadingPromise;
  }
  return cachedScrapersPromise;
};

const resolveRequestLimitContext = async (
  request: FetchScraperDocumentRequest,
): Promise<ScraperRequestLimitContext | null> => {
  try {
    const scrapers = await getScrapersForRequestLimits();
    const normalizedBaseUrl = normalizeScraperBaseUrl(request.baseUrl);
    const requestedOrigin = new URL(normalizedBaseUrl).origin;
    const scraper = (
      request.scraperId
        ? scrapers.find((candidate) => candidate.id === request.scraperId)
        : undefined
    )
      ?? scrapers.find((candidate) => candidate.baseUrl === normalizedBaseUrl)
      ?? scrapers.find((candidate) => new URL(candidate.baseUrl).origin === requestedOrigin);

    if (!scraper || !hasActiveLimits(scraper.globalConfig.requestLimits)) {
      return null;
    }

    return {
      key: scraper.id,
      limits: scraper.globalConfig.requestLimits,
    };
  } catch (error) {
    console.warn("Failed to resolve scraper request limits", error);
    return null;
  }
};

const isBackgroundSearchRequest = (event: IpcMainInvokeEvent): boolean => {
  try {
    return event.sender.getURL().includes("#/background-search-runner");
  } catch {
    return false;
  }
};

export const acquireScraperRequestSlot = async (
  event: IpcMainInvokeEvent,
  request: FetchScraperDocumentRequest,
): Promise<ReleaseRequestSlot> => {
  const [, context] = await Promise.all([
    ensureGlobalConcurrencyInitialized(),
    resolveRequestLimitContext(request),
  ]);
  return requestScheduler.acquire({
    groupKey: context?.key,
    groupMaxConcurrent: context?.limits.maxConcurrentRequests,
    minDelayMs: context?.limits.minDelayMs,
    priority: isBackgroundSearchRequest(event)
      ? BACKGROUND_REQUEST_PRIORITY
      : INTERACTIVE_REQUEST_PRIORITY,
  });
};
