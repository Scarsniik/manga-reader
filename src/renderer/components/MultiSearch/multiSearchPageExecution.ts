import type { ScraperRecord } from "@/shared/scraper";
import type { ScraperCardDetailsCache } from "@/renderer/utils/scraperRuntime";
import {
  fetchSearchPageWithRetry,
  getSearchConfig,
  resolveHasNextPage,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { keepNewSourceResults } from "@/renderer/components/MultiSearch/multiSearchRunState";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { processScraperListingPage } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";

export type ExecuteMultiSearchTermPageOptions = {
  scraper: ScraperRecord;
  term: string;
  pageIndex: number;
  nextPageUrl?: string;
  existingResults: MultiSearchSourceResult[];
  paceConfig: PaceConfig;
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  detailsCache?: ScraperCardDetailsCache;
};

export type ExecuteMultiSearchTermPageResult = {
  pageResults: MultiSearchSourceResult[];
  newPageResults: MultiSearchSourceResult[];
  loadedPages: number;
  hasNextPage: boolean;
  currentPageUrl: string;
  nextPageUrl?: string;
};

export const executeMultiSearchTermPage = async ({
  scraper,
  term,
  pageIndex,
  nextPageUrl,
  existingResults,
  paceConfig,
  includedLanguageCodes,
  scrapeDetailsWithCards,
  detailsCache,
}: ExecuteMultiSearchTermPageOptions): Promise<ExecuteMultiSearchTermPageResult> => {
  const searchConfig = getSearchConfig(scraper);
  const page = await fetchSearchPageWithRetry(
    scraper,
    searchConfig,
    term,
    pageIndex,
    nextPageUrl,
    paceConfig,
    { scrapeDetailsWithCards, detailsCache },
  );
  const { includedSources: pageResults } = await processScraperListingPage({
    scraper,
    page,
    pageIndex,
    searchTerm: term,
    includedLanguageCodes,
  });
  const newPageResults = keepNewSourceResults(existingResults, pageResults);
  const hasOnlyDuplicateResults = pageResults.length > 0 && newPageResults.length === 0;
  return {
    pageResults,
    newPageResults,
    loadedPages: pageIndex + 1,
    hasNextPage: !hasOnlyDuplicateResults && resolveHasNextPage(searchConfig, page),
    currentPageUrl: page.currentPageUrl,
    nextPageUrl: page.nextPageUrl,
  };
};
