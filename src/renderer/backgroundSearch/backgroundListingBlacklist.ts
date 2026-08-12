import type { ListingBackgroundInput } from "@/shared/backgroundSearch";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import {
  getBlacklistedScraperTags,
  getScraperTagBlacklistEntries,
} from "@/renderer/utils/scraperTagBlacklist";

export type FilteredBackgroundListingSources = {
  accepted: MultiSearchSourceResult[];
  excludedCount: number;
};

export const BACKGROUND_LISTING_MAX_STAGNANT_BACKFILL_PAGES = 3;

export const isBackgroundListingBackfillPage = ({
  pageIndex,
  executionStartPageIndex,
  configuredMaxPages,
}: {
  pageIndex: number;
  executionStartPageIndex: number;
  configuredMaxPages: number;
}): boolean => (
  Math.max(0, Math.floor(pageIndex) - Math.max(0, Math.floor(executionStartPageIndex)))
  >= Math.max(1, Math.floor(configuredMaxPages))
);

export const buildBackgroundListingPaginationUrlKey = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
};

export const isBackgroundListingPaginationStalled = (
  requestedPageUrl: string | undefined,
  nextPageUrl: string | undefined,
): boolean => Boolean(
  requestedPageUrl
  && nextPageUrl
  && buildBackgroundListingPaginationUrlKey(requestedPageUrl)
    === buildBackgroundListingPaginationUrlKey(nextPageUrl),
);

export const isBackgroundListingRedirectedToVisitedPage = (
  requestedPageUrl: string | undefined,
  currentPageUrl: string | undefined,
  visitedPageUrlKeys: ReadonlySet<string>,
): boolean => {
  if (!requestedPageUrl || !currentPageUrl) return false;
  const requestedPageUrlKey = buildBackgroundListingPaginationUrlKey(requestedPageUrl);
  const currentPageUrlKey = buildBackgroundListingPaginationUrlKey(currentPageUrl);
  return requestedPageUrlKey !== currentPageUrlKey && visitedPageUrlKeys.has(currentPageUrlKey);
};

export const resolveBackgroundListingAcceptedTarget = (
  rawResultCount: number,
  resultLimit: number,
): number => resultLimit > 0
  ? Math.min(resultLimit, Math.max(0, rawResultCount))
  : Math.max(0, rawResultCount);

export const shouldContinueBackgroundBlacklistBackfill = ({
  sourceHasNextPage,
  nextPageIndex,
  configuredMaxPages,
  resultLimit,
  acceptedResultTarget,
  storedResultCount,
}: {
  sourceHasNextPage: boolean;
  nextPageIndex: number;
  configuredMaxPages: number;
  resultLimit: number;
  acceptedResultTarget: number;
  storedResultCount: number;
}): boolean => sourceHasNextPage && (
  (nextPageIndex < configuredMaxPages && (resultLimit === 0 || acceptedResultTarget < resultLimit))
  || storedResultCount < acceptedResultTarget
);

export const filterBackgroundListingSourcesByBlacklist = (
  sources: MultiSearchSourceResult[],
  input: Pick<ListingBackgroundInput, "excludeBlacklistedTagCards" | "tagBlacklistByScraper">,
): FilteredBackgroundListingSources => {
  if (input.excludeBlacklistedTagCards !== true) {
    return { accepted: sources, excludedCount: 0 };
  }

  let excludedCount = 0;
  const accepted = sources.filter((source) => {
    const matches = getBlacklistedScraperTags(
      getScraperTagBlacklistEntries(input.tagBlacklistByScraper, source.scraper.id),
      source.result.tags,
      source.result.tagUrls,
    );
    if (!matches.length) return true;
    excludedCount += 1;
    return false;
  });

  return { accepted, excludedCount };
};
