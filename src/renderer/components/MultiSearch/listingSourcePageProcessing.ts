import type { ScraperRecord } from "@/shared/scraper";
import type { ScraperRuntimeSearchPageResult } from "@/renderer/utils/scraperRuntime";
import { appendScraperSearchResultTagToItems } from "@/renderer/utils/scraperSearchResultTags";
import { buildSourceResults } from "@/renderer/components/MultiSearch/multiSearchRuntime";
import { doesMultiSearchSourceMatchIncludedLanguages } from "@/renderer/components/MultiSearch/multiSearchLanguageFilters";
import { enrichSourceResultsWithJapaneseRomanization } from "@/renderer/components/MultiSearch/multiSearchSourceRomanization";
import type { MultiSearchSourceResult } from "@/renderer/components/MultiSearch/types";

export type ProcessScraperListingPageOptions = {
  scraper: ScraperRecord;
  page: ScraperRuntimeSearchPageResult;
  pageIndex: number;
  searchTerm: string;
  contextualAuthorNames?: string[];
  includedLanguageCodes?: string[];
  resultTag?: { name: string; url?: string } | null;
};

export type ProcessScraperListingPageResult = {
  page: ScraperRuntimeSearchPageResult;
  sources: MultiSearchSourceResult[];
  includedSources: MultiSearchSourceResult[];
};

export const processScraperListingPage = async ({
  scraper,
  page,
  pageIndex,
  searchTerm,
  contextualAuthorNames = [],
  includedLanguageCodes,
  resultTag,
}: ProcessScraperListingPageOptions): Promise<ProcessScraperListingPageResult> => {
  const taggedPage = resultTag
    ? {
      ...page,
      items: appendScraperSearchResultTagToItems(page.items, resultTag.name, resultTag.url),
    }
    : page;
  const sources = await enrichSourceResultsWithJapaneseRomanization(buildSourceResults(
    scraper,
    taggedPage,
    pageIndex,
    searchTerm,
    contextualAuthorNames,
  ));
  return {
    page: taggedPage,
    sources,
    includedSources: includedLanguageCodes
      ? sources.filter((source) => doesMultiSearchSourceMatchIncludedLanguages(source, includedLanguageCodes))
      : sources,
  };
};
