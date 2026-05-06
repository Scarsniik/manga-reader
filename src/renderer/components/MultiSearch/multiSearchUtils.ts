import { hasScraperFieldSelectorValue, ScraperRecord } from "@/shared/scraper";
import {
  detectLanguageCodesFromTitle,
  getLanguageFlagCode,
  getLanguageLabel,
} from "@/renderer/utils/languageDetection";
import {
  getScraperDetailsFeatureConfig,
  getScraperFeature,
  getScraperSearchFeatureConfig,
  isScraperFeatureConfigured,
} from "@/renderer/utils/scraperRuntime";
import type {
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  extractTentativeAuthorNamesFromTitle,
} from "@/renderer/components/MultiSearch/multiSearchTitleMerge";
import { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
export { UNKNOWN_MULTI_SEARCH_VALUE } from "@/renderer/components/MultiSearch/multiSearchConstants";
export {
  mergeMultiSearchResults,
  mergeMultiSearchSourceIntoGroups,
  sortMultiSearchMergedResults,
} from "@/renderer/components/MultiSearch/multiSearchMerge";

export type MultiSearchFilterOption = {
  label: string;
  value: string;
};

export const parseMultiSearchTerms = (query: string): string[] => {
  const seen = new Set<string>();

  return query
    .split(/[\n,;|]+/g)
    .map((term) => term.trim().replace(/\s+/g, " "))
    .filter((term) => {
      const key = term.toLowerCase();
      if (!term || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const normalizeListValue = (value: unknown): string => (
  String(value ?? "").trim().replace(/\s+/g, " ")
);

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.reduce<string[]>((items, entry) => {
    const normalized = normalizeListValue(entry);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return items;
    }

    seen.add(key);
    items.push(normalized);
    return items;
  }, []);
};

export const getScraperSourceLanguages = (scraper: ScraperRecord): string[] => (
  normalizeList(scraper.globalConfig.sourceLanguages).map((language) => language.toLowerCase())
);

export const getScraperContentTypes = (scraper: ScraperRecord): string[] => (
  normalizeList(scraper.globalConfig.contentTypes)
);

export {
  detectLanguageCodesFromTitle,
  getLanguageFlagCode,
  getLanguageLabel,
};

export const buildLanguageFilterOptions = (scrapers: ScraperRecord[]): MultiSearchFilterOption[] => {
  const values = new Set<string>();
  let hasUnknown = false;

  scrapers.forEach((scraper) => {
    const scraperLanguages = getScraperSourceLanguages(scraper);
    if (!scraperLanguages.length) {
      hasUnknown = true;
      return;
    }

    scraperLanguages.forEach((language) => values.add(language));
  });

  const options = Array.from(values)
    .sort((left, right) => getLanguageLabel(left).localeCompare(getLanguageLabel(right)))
    .map((value) => ({
      label: getLanguageLabel(value),
      value,
    }));

  if (hasUnknown) {
    options.push({
      label: getLanguageLabel(UNKNOWN_MULTI_SEARCH_VALUE),
      value: UNKNOWN_MULTI_SEARCH_VALUE,
    });
  }

  return options;
};

export const buildContentTypeFilterOptions = (scrapers: ScraperRecord[]): MultiSearchFilterOption[] => {
  const values = new Map<string, string>();
  let hasUnknown = false;

  scrapers.forEach((scraper) => {
    const contentTypes = getScraperContentTypes(scraper);
    if (!contentTypes.length) {
      hasUnknown = true;
      return;
    }

    contentTypes.forEach((contentType) => {
      values.set(contentType.toLowerCase(), contentType);
    });
  });

  const options = Array.from(values.values())
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({
      label: value,
      value,
    }));

  if (hasUnknown) {
    options.push({
      label: "Non renseigne",
      value: UNKNOWN_MULTI_SEARCH_VALUE,
    });
  }

  return options;
};

export const isSearchableScraper = (scraper: ScraperRecord): boolean => {
  const searchFeature = getScraperFeature(scraper, "search");
  const searchConfig = getScraperSearchFeatureConfig(searchFeature);

  return Boolean(
    isScraperFeatureConfigured(searchFeature)
    && searchConfig?.urlTemplate
    && searchConfig.resultItemSelector
    && hasScraperFieldSelectorValue(searchConfig.titleSelector),
  );
};

export const canOpenScraperDetails = (scraper: ScraperRecord): boolean => {
  const detailsFeature = getScraperFeature(scraper, "details");
  const detailsConfig = getScraperDetailsFeatureConfig(detailsFeature);

  return Boolean(
    isScraperFeatureConfigured(detailsFeature)
    && hasScraperFieldSelectorValue(detailsConfig?.titleSelector),
  );
};

export { extractTentativeAuthorNamesFromTitle };

export const matchesMultiSearchFilters = (
  scraper: ScraperRecord,
  filters: {
    selectedScraperIds: string[];
    selectedLanguageCodes: string[];
    selectedContentTypes: string[];
  },
): boolean => {
  if (filters.selectedScraperIds.length && !filters.selectedScraperIds.includes(scraper.id)) {
    return false;
  }

  const scraperLanguages = getScraperSourceLanguages(scraper);
  const languageValues = scraperLanguages.length ? scraperLanguages : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (
    filters.selectedLanguageCodes.length
    && !languageValues.some((language) => filters.selectedLanguageCodes.includes(language))
  ) {
    return false;
  }

  const scraperContentTypes = getScraperContentTypes(scraper);
  const contentTypeValues = scraperContentTypes.length ? scraperContentTypes : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (
    filters.selectedContentTypes.length
    && !contentTypeValues.some((contentType) => filters.selectedContentTypes.includes(contentType))
  ) {
    return false;
  }

  return true;
};

export const flattenMultiSearchSources = (
  runs: Array<{ results: MultiSearchSourceResult[] }>,
): MultiSearchSourceResult[] => (
  runs.flatMap((run) => run.results)
);
