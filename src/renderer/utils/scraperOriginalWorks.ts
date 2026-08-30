import type {
  ScraperRecord,
  ScraperSearchResultItem,
} from "@/shared/scraper";
import type {
  MultiSearchMergedResult,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import { buildFilteredMultiSearchMergedResult } from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import { getMultiSearchSourceLanguageValues } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import {
  hasScraperSourceDetection,
  isScraperResultOriginal,
} from "@/shared/scraper";

export { hasScraperSourceDetection, isScraperResultOriginal };

export const isMultiSearchSourceOriginal = (
  source: MultiSearchSourceResult,
): boolean => isScraperResultOriginal(source.scraper, source.result);

export const filterMultiSearchMergedResultsByOriginal = (
  results: MultiSearchMergedResult[],
  originalOnly: boolean,
): MultiSearchMergedResult[] => {
  if (!originalOnly) {
    return results;
  }

  return results.reduce<MultiSearchMergedResult[]>((filteredResults, result) => {
    const sources = result.sources.filter(isMultiSearchSourceOriginal);
    if (!sources.length) {
      return filteredResults;
    }

    if (sources.length === result.sources.length) {
      filteredResults.push(result);
      return filteredResults;
    }

    filteredResults.push(buildFilteredMultiSearchMergedResult(
      result,
      sources,
      getMultiSearchSourceLanguageValues,
    ));
    return filteredResults;
  }, []);
};
