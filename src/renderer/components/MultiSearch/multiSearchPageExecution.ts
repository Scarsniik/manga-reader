import type { ScraperRecord } from "@/shared/scraper";
import type {
  ScraperCardDetailsCache,
  ScraperDocumentFetcher,
} from "@/renderer/utils/scraperRuntime";
import {
  fetchSearchPageWithRetry,
  getSearchConfig,
  resolveHasNextPage,
  type PaceConfig,
} from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { keepNewSourceResults } from "@/renderer/components/MultiSearch/multiSearchRunState";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";
import { processScraperListingPage } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import { enrichScraperListingSourcesWithCardDetails } from "@/renderer/components/MultiSearch/listingSourcePageProcessing";
import {
  doesScraperCardNeedMetadata,
  SCRAPER_METADATA_REQUIREMENTS_BY_PHASE,
} from "@/renderer/utils/scraperRuntime";
import {
  hasScraperSourceDetection,
  isMultiSearchSourceOriginal,
} from "@/renderer/utils/scraperOriginalWorks";

export type ExecuteMultiSearchTermPageOptions = {
  scraper: ScraperRecord;
  term: string;
  pageIndex: number;
  nextPageUrl?: string;
  existingResults: MultiSearchSourceResult[];
  paceConfig: PaceConfig;
  includedLanguageCodes: string[];
  scrapeDetailsWithCards: boolean;
  originalOnly?: boolean;
  detailsCache?: ScraperCardDetailsCache;
  fetchDocument?: ScraperDocumentFetcher;
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
  originalOnly = false,
  detailsCache,
  fetchDocument,
}: ExecuteMultiSearchTermPageOptions): Promise<ExecuteMultiSearchTermPageResult> => {
  const searchConfig = getSearchConfig(scraper);
  const page = await fetchSearchPageWithRetry(
    scraper,
    searchConfig,
    term,
    pageIndex,
    nextPageUrl,
    paceConfig,
    { scrapeDetailsWithCards, detailsCache, fetchDocument },
  );
  const { includedSources } = await processScraperListingPage({
    scraper,
    page,
    pageIndex,
    searchTerm: term,
    includedLanguageCodes,
  });
  const mustResolveSources = originalOnly && hasScraperSourceDetection(scraper);
  const sourceIndexesToEnrich = mustResolveSources
    ? includedSources.flatMap((source, index) => (
      doesScraperCardNeedMetadata(
        source.result,
        SCRAPER_METADATA_REQUIREMENTS_BY_PHASE.originalFiltering,
      ) ? [index] : []
    ))
    : [];
  const enrichedSources = sourceIndexesToEnrich.length
    ? await enrichScraperListingSourcesWithCardDetails(
      scraper,
      sourceIndexesToEnrich.map((index) => includedSources[index]),
      { scrapeDetailsWithCards: true, detailsCache, fetchDocument },
    )
    : [];
  const enrichedByIndex = new Map(sourceIndexesToEnrich.map((sourceIndex, resultIndex) => (
    [sourceIndex, enrichedSources[resultIndex] ?? includedSources[sourceIndex]]
  )));
  const pageResults = includedSources
    .map((source, index) => enrichedByIndex.get(index) ?? source)
    .filter((source) => !originalOnly || isMultiSearchSourceOriginal(source));
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
