import {
  buildScraperLatestCheckpointId,
  buildScraperViewHistoryCardId,
  type SaveScraperLatestCheckpointRequest,
  type ScraperLatestCheckpointKey,
  type ScraperLatestCheckpointModule,
  type ScraperLatestCheckpointRecord,
  type ScraperRecord,
  type ScraperSearchResultItem,
} from "@/shared/scraper";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime";
import { buildSearchResultViewHistoryIdentity } from "@/renderer/utils/scraperViewHistory";

const getApi = (): any => (
  typeof window !== "undefined" ? (window as any).api : null
);

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
