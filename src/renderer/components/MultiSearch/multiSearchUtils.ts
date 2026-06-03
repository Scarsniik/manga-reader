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
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";
import {
  NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  NO_MULTI_SEARCH_LANGUAGES_VALUE,
  NO_MULTI_SEARCH_SCRAPERS_VALUE,
  UNKNOWN_MULTI_SEARCH_VALUE,
} from "@/renderer/components/MultiSearch/multiSearchConstants";
export {
  NO_MULTI_SEARCH_CONTENT_TYPES_VALUE,
  NO_MULTI_SEARCH_LANGUAGES_VALUE,
  NO_MULTI_SEARCH_SCRAPERS_VALUE,
  UNKNOWN_MULTI_SEARCH_VALUE,
} from "@/renderer/components/MultiSearch/multiSearchConstants";
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
  if (filters.selectedScraperIds.includes(NO_MULTI_SEARCH_SCRAPERS_VALUE)) {
    return false;
  }

  const selectedScraperIds = filters.selectedScraperIds.filter((scraperId) => (
    scraperId !== NO_MULTI_SEARCH_SCRAPERS_VALUE
  ));
  const scraperFilterValues = splitIncludeFilterValues(selectedScraperIds);
  if (scraperFilterValues.excludedValues.includes(scraper.id)) {
    return false;
  }

  if (scraperFilterValues.includedValues.length && !scraperFilterValues.includedValues.includes(scraper.id)) {
    return false;
  }

  if (filters.selectedLanguageCodes.includes(NO_MULTI_SEARCH_LANGUAGES_VALUE)) {
    return false;
  }

  const selectedLanguageCodes = filters.selectedLanguageCodes.filter((languageCode) => (
    languageCode !== NO_MULTI_SEARCH_LANGUAGES_VALUE
  ));
  const languageFilterValues = splitIncludeFilterValues(selectedLanguageCodes);
  const scraperLanguages = getScraperSourceLanguages(scraper);
  const languageValues = scraperLanguages.length ? scraperLanguages : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (languageValues.some((language) => languageFilterValues.excludedValues.includes(language))) {
    return false;
  }

  if (
    languageFilterValues.includedValues.length
    && !languageValues.some((language) => languageFilterValues.includedValues.includes(language))
  ) {
    return false;
  }

  if (filters.selectedContentTypes.includes(NO_MULTI_SEARCH_CONTENT_TYPES_VALUE)) {
    return false;
  }

  const selectedContentTypes = filters.selectedContentTypes.filter((contentType) => (
    contentType !== NO_MULTI_SEARCH_CONTENT_TYPES_VALUE
  ));
  const contentTypeFilterValues = splitIncludeFilterValues(selectedContentTypes);
  const scraperContentTypes = getScraperContentTypes(scraper);
  const contentTypeValues = scraperContentTypes.length ? scraperContentTypes : [UNKNOWN_MULTI_SEARCH_VALUE];
  if (contentTypeValues.some((contentType) => contentTypeFilterValues.excludedValues.includes(contentType))) {
    return false;
  }

  if (
    contentTypeFilterValues.includedValues.length
    && !contentTypeValues.some((contentType) => contentTypeFilterValues.includedValues.includes(contentType))
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
