import type { BackendMultiSearchListFilters } from "@/renderer/components/MultiSearch/multiSearchMergeWorkerProtocol";
import {
  filterMultiSearchMergedResultsByLanguage,
  filterMultiSearchRunsByLanguage,
  getMultiSearchSourceLanguageValues,
} from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  filterMultiSearchMergedResultsByReadingStatus,
  filterMultiSearchRunsByReadingStatus,
} from "@/renderer/components/MultiSearch/multiSearchReadingStatusFilters";
import {
  filterMultiSearchMergedResultsByText,
  filterMultiSearchRunsByText,
} from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import {
  countBlacklistedMultiSearchResults,
  filterBlacklistedMultiSearchResults,
} from "@/renderer/components/MultiSearch/multiSearchTagBlacklist";
import type {
  MultiSearchMergedResult,
  MultiSearchScraperRun,
} from "@/renderer/components/MultiSearch/types";
import { filterMultiSearchMergedResultsByOriginal } from "@/renderer/utils/scraperOriginalWorks";
import {
  buildSearchResultViewHistoryIdentity,
  filterByScraperViewHistoryNewState,
  sortByScraperViewHistoryNewState,
} from "@/renderer/utils/scraperViewHistory";
import { applyManualMultiSearchSplits } from "@/renderer/components/MultiSearch/multiSearchManualSplit";

export type ProcessedMultiSearchLists = {
  results: MultiSearchMergedResult[];
  runs: MultiSearchScraperRun[];
  blacklistedResultCount: number;
  splitResultCount: number;
  languageResultCount: number;
  originalResultCount: number;
};

const getHistoryIdentities = (result: MultiSearchMergedResult) => result.sources.map((source) => (
  buildSearchResultViewHistoryIdentity(source.scraper.id, source.result)
));

export const processMultiSearchLists = (
  results: MultiSearchMergedResult[],
  runs: MultiSearchScraperRun[],
  filters: BackendMultiSearchListFilters,
): ProcessedMultiSearchLists => {
  const display = filters.display;
  const splitResults = display?.splitResultIds?.size
    ? applyManualMultiSearchSplits(results, display.splitResultIds)
    : results;
  const languageResults = filterMultiSearchMergedResultsByLanguage(
    splitResults,
    filters.languageFilterModes,
  );
  const textResults = filterMultiSearchMergedResultsByText(
    filterMultiSearchMergedResultsByReadingStatus(
      languageResults,
      filters.readingStatusFilters,
      filters.readingStatusContext,
    ),
    filters.textFilter,
    getMultiSearchSourceLanguageValues,
  );
  const sortedResults = display
    ? sortByScraperViewHistoryNewState(
      textResults,
      getHistoryIdentities,
      display.viewHistoryRecordsById,
      display.newViewHistoryIds,
      display.showUnseenFirst,
    )
    : textResults;
  const originalResults = display
    ? filterMultiSearchMergedResultsByOriginal(sortedResults, display.originalOnly)
    : sortedResults;
  const blacklistedResultCount = display
    ? countBlacklistedMultiSearchResults(originalResults, display.tagBlacklistByScraper)
    : 0;
  const visibleResults = display
    ? filterByScraperViewHistoryNewState(
      filterBlacklistedMultiSearchResults(
        originalResults,
        display.tagBlacklistByScraper,
        display.hideBlacklistedCards,
      ),
      getHistoryIdentities,
      display.viewHistoryRecordsById,
      display.newViewHistoryIds,
      display.showUnseenOnly,
    )
    : originalResults;

  const filteredRuns = filterMultiSearchRunsByText(
      filterMultiSearchRunsByReadingStatus(
        filterMultiSearchRunsByLanguage(runs, filters.languageFilterModes),
        filters.readingStatusFilters,
        filters.readingStatusContext,
      ),
      filters.textFilter,
    );
  return {
    results: visibleResults,
    runs: filteredRuns,
    blacklistedResultCount,
    splitResultCount: splitResults.length,
    languageResultCount: languageResults.length,
    originalResultCount: originalResults.length,
  };
};
