import {
  buildScraperLatestCheckpointId,
  buildScraperViewHistoryCardId,
  type ResetScraperLatestCheckpointsRequest,
  type ResetScraperLatestCheckpointsResult,
  type SaveScraperLatestCheckpointRequest,
  type ScraperLatestCheckpointKey,
  type ScraperLatestCheckpointModule,
  type ScraperLatestCheckpointRecord,
  type ScraperLatestQuotaUnavailableReason,
  type ScraperRecord,
  type ScraperSearchResultItem,
} from "@/shared/scraper";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

export const SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS = 24 * 60 * 60 * 1000;

export const resolveScraperLatestCheckpointQuotaUnavailableReason = (
  checkpoint: ScraperLatestCheckpointRecord | null | undefined,
  now = Date.now(),
): ScraperLatestQuotaUnavailableReason | null => {
  if (
    checkpoint?.quotaUnavailableReason !== "languageRejectLimit"
    && checkpoint?.quotaUnavailableReason !== "pageLimitWithoutResults"
  ) {
    return null;
  }

  const unavailableUntil = Date.parse(checkpoint.quotaUnavailableUntil ?? "");
  return Number.isFinite(unavailableUntil) && unavailableUntil > now
    ? checkpoint.quotaUnavailableReason
    : null;
};

export const resolveScraperLatestCheckpointCursor = (
  checkpoint: ScraperLatestCheckpointRecord | null | undefined,
): { loadedPages: number; currentPageUrl?: string; nextPageUrl?: string } | null => {
  if (!checkpoint) return null;
  const usesExactCursor = checkpoint.cursorVersion === 2
    && Number.isFinite(Number(checkpoint.nextPageIndex));
  return {
    loadedPages: usesExactCursor
      ? Math.max(0, Math.floor(Number(checkpoint.nextPageIndex) || 0))
      : Math.max(0, Math.floor(Number(checkpoint.pageIndex) || 0)),
    currentPageUrl: checkpoint.currentPageUrl,
    nextPageUrl: usesExactCursor ? checkpoint.nextPageUrl : checkpoint.currentPageUrl,
  };
};

export const getScraperLatestCheckpoints = async (
  scraperId?: string | null,
): Promise<ScraperLatestCheckpointRecord[]> => {
  const api = getApi();

  if (!api || typeof api.getScraperLatestCheckpoints !== "function") {
    return [];
  }

  const checkpoints = await api.getScraperLatestCheckpoints(scraperId ?? null);
  return Array.isArray(checkpoints) ? checkpoints as ScraperLatestCheckpointRecord[] : [];
};

export const saveScraperLatestCheckpoint = async (
  request: SaveScraperLatestCheckpointRequest,
): Promise<ScraperLatestCheckpointRecord | null> => {
  const api = getApi();

  if (!api || typeof api.saveScraperLatestCheckpoint !== "function") {
    return null;
  }

  return api.saveScraperLatestCheckpoint(request) as Promise<ScraperLatestCheckpointRecord>;
};

export const resetScraperLatestCheckpoints = async (
  request: ResetScraperLatestCheckpointsRequest,
): Promise<ResetScraperLatestCheckpointsResult> => {
  const api = getApi();

  if (!api || typeof api.resetScraperLatestCheckpoints !== "function") {
    throw new Error("Le reset des scans profonds n'est pas disponible dans cette version.");
  }

  return api.resetScraperLatestCheckpoints(request) as Promise<ResetScraperLatestCheckpointsResult>;
};

export const getScraperLatestCheckpointForKey = (
  checkpoints: ScraperLatestCheckpointRecord[],
  key: ScraperLatestCheckpointKey,
  scraperUpdatedAt?: string,
): ScraperLatestCheckpointRecord | null => {
  const id = buildScraperLatestCheckpointId(key);
  if (!id) {
    return null;
  }

  const checkpoint = checkpoints.find((record) => record.id === id) ?? null;
  if (!checkpoint) {
    return null;
  }

  if (checkpoint.scraperUpdatedAt && scraperUpdatedAt && checkpoint.scraperUpdatedAt !== scraperUpdatedAt) {
    return null;
  }

  return checkpoint;
};

export const buildScraperLatestCheckpointRequest = (options: {
  scraper: ScraperRecord;
  module: ScraperLatestCheckpointModule;
  query?: string | null;
  includedLanguageCodes?: string[];
  pageIndex: number;
  page: ScraperRuntimeSearchPageResult;
  result: ScraperSearchResultItem;
}): SaveScraperLatestCheckpointRequest | null => {
  const anchorIdentity = buildSearchResultViewHistoryIdentity(options.scraper.id, options.result);
  const anchorCardId = buildScraperViewHistoryCardId(anchorIdentity);

  if (!anchorCardId) {
    return null;
  }

  return {
    scraperId: options.scraper.id,
    module: options.module,
    query: options.module === "homepage" ? "" : options.query ?? "",
    includedLanguageCodes: options.includedLanguageCodes ?? [],
    scraperUpdatedAt: options.scraper.updatedAt,
    pageIndex: Math.max(0, Math.floor(options.pageIndex)),
    currentPageUrl: options.page.currentPageUrl,
    nextPageUrl: options.page.nextPageUrl,
    anchorCardId,
    anchorIdentity,
  };
};

export const buildScraperLatestCursorCheckpointRequest = (options: {
  scraper: ScraperRecord;
  module: ScraperLatestCheckpointModule;
  query?: string | null;
  includedLanguageCodes?: string[];
  pageIndex: number;
  page: ScraperRuntimeSearchPageResult;
  quotaUnavailableReason?: ScraperLatestQuotaUnavailableReason | null;
  reachedEnd?: boolean;
  now?: number;
}): SaveScraperLatestCheckpointRequest => ({
  scraperId: options.scraper.id,
  module: options.module,
  query: options.module === "homepage" ? "" : options.query ?? "",
  includedLanguageCodes: options.includedLanguageCodes ?? [],
  scraperUpdatedAt: options.scraper.updatedAt,
  pageIndex: Math.max(0, Math.floor(options.pageIndex)),
  cursorVersion: 2,
  nextPageIndex: Math.max(0, Math.floor(options.pageIndex)) + 1,
  currentPageUrl: options.page.currentPageUrl,
  nextPageUrl: options.page.nextPageUrl,
  anchorCardId: null,
  anchorIdentity: null,
  reachedEnd: options.reachedEnd === true,
  ...(options.quotaUnavailableReason ? {
    quotaUnavailableReason: options.quotaUnavailableReason,
    quotaUnavailableUntil: new Date(
      (Number.isFinite(options.now) ? Number(options.now) : Date.now())
      + SCRAPER_LATEST_QUOTA_UNAVAILABLE_TTL_MS,
    ).toISOString(),
  } : {}),
});

export const saveScraperLatestCheckpointFromResult = async (options: {
  scraper: ScraperRecord;
  module: ScraperLatestCheckpointModule;
  query?: string | null;
  includedLanguageCodes?: string[];
  pageIndex: number;
  page: ScraperRuntimeSearchPageResult;
  result: ScraperSearchResultItem;
}): Promise<void> => {
  const request = buildScraperLatestCheckpointRequest(options);
  if (!request) {
    return;
  }

  await saveScraperLatestCheckpoint(request);
};
