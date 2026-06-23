import {
  normalizeScraperBaseUrl,
  type FetchScraperDocumentRequest,
  type ScraperRequestLimits,
} from "../../scraper";
import { readScrapersFile } from "./storage";

type ReleaseRequestSlot = () => void;

type PendingRequest = {
  limits: ScraperRequestLimits;
  resolve: (release: ReleaseRequestSlot) => void;
};

type ScraperRequestLimitState = {
  activeCount: number;
  lastStartedAt: number;
  queue: PendingRequest[];
  timer: NodeJS.Timeout | null;
};

type ScraperRequestLimitContext = {
  key: string;
  limits: ScraperRequestLimits;
};

const requestLimitStates = new Map<string, ScraperRequestLimitState>();
const releaseImmediately: ReleaseRequestSlot = () => undefined;

const hasActiveLimits = (limits: ScraperRequestLimits): boolean => (
  limits.minDelayMs > 0 || limits.maxConcurrentRequests > 0
);

const getOrCreateLimitState = (key: string): ScraperRequestLimitState => {
  const existingState = requestLimitStates.get(key);
  if (existingState) {
    return existingState;
  }

  const state: ScraperRequestLimitState = {
    activeCount: 0,
    lastStartedAt: 0,
    queue: [],
    timer: null,
  };
  requestLimitStates.set(key, state);
  return state;
};

const scheduleQueuedRequests = (key: string, state: ScraperRequestLimitState): void => {
  if (state.timer || !state.queue.length) {
    return;
  }

  while (state.queue.length) {
    const pendingRequest = state.queue[0];
    const concurrencyLimit = pendingRequest.limits.maxConcurrentRequests;
    if (concurrencyLimit > 0 && state.activeCount >= concurrencyLimit) {
      return;
    }

    const elapsedSinceLastStart = Date.now() - state.lastStartedAt;
    const remainingDelay = Math.max(0, pendingRequest.limits.minDelayMs - elapsedSinceLastStart);
    if (remainingDelay > 0) {
      state.timer = setTimeout(() => {
        state.timer = null;
        scheduleQueuedRequests(key, state);
      }, remainingDelay);
      return;
    }

    state.queue.shift();
    state.activeCount += 1;
    state.lastStartedAt = Date.now();
    let released = false;
    pendingRequest.resolve(() => {
      if (released) {
        return;
      }

      released = true;
      state.activeCount = Math.max(0, state.activeCount - 1);
      scheduleQueuedRequests(key, state);
    });
  }
};

const resolveRequestLimitContext = async (
  request: FetchScraperDocumentRequest,
): Promise<ScraperRequestLimitContext | null> => {
  try {
    const scrapers = await readScrapersFile();
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

export const acquireScraperRequestSlot = async (
  request: FetchScraperDocumentRequest,
): Promise<ReleaseRequestSlot> => {
  const context = await resolveRequestLimitContext(request);
  if (!context) {
    return releaseImmediately;
  }

  const state = getOrCreateLimitState(context.key);
  return new Promise<ReleaseRequestSlot>((resolve) => {
    state.queue.push({
      limits: context.limits,
      resolve,
    });
    scheduleQueuedRequests(context.key, state);
  });
};
