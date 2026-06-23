import {
  UNKNOWN_MULTI_SEARCH_VALUE,
  getLanguageLabel,
} from "@/renderer/components/MultiSearch/multiSearchUtils";
import {
  buildFilteredMultiSearchMergedResult,
  uniqueMultiSearchFilterValues,
} from "@/renderer/components/MultiSearch/multiSearchResultFilters";
import type {
  MultiSearchLanguageFilterMode,
  MultiSearchLanguageFilterModes,
  MultiSearchMergedResult,
  MultiSearchScraperRun,
  MultiSearchSourceResult,
} from "@/renderer/components/MultiSearch/types";
import {
  detectLanguageCodesFromTitle,
  uniqueLanguageCodes,
} from "@/renderer/utils/languageDetection";
import { splitIncludeFilterValues } from "@/renderer/components/IncludeFilterBar/includeFilterValues";

const isLanguageFilterMode = (
  mode: MultiSearchLanguageFilterMode | undefined,
): mode is MultiSearchLanguageFilterMode => (
  mode === "only" || mode === "without" || mode === "default"
);

const normalizeLanguageFilterValues = (values: string[]): string[] => (
  uniqueMultiSearchFilterValues(values.flatMap((value) => {
    const canonicalCodes = uniqueLanguageCodes([value]);
    if (canonicalCodes.length) {
      return canonicalCodes;
    }

    const normalizedValue = String(value ?? "").trim().toLowerCase();
    return normalizedValue ? [normalizedValue] : [];
  }))
);

export const getMultiSearchSourceLanguageValues = (source: MultiSearchSourceResult): string[] => {
  const titleLanguageCodes = normalizeLanguageFilterValues(
    detectLanguageCodesFromTitle(source.result.title),
  );
  if (titleLanguageCodes.length) {
    return titleLanguageCodes;
  }

  const sourceLanguageCodes = normalizeLanguageFilterValues([
    ...source.sourceLanguageCodes,
    ...source.detectedLanguageCodes,
  ]);
  return sourceLanguageCodes.length ? sourceLanguageCodes : [UNKNOWN_MULTI_SEARCH_VALUE];
};

export const doesMultiSearchSourceMatchIncludedLanguages = (
  source: MultiSearchSourceResult,
  includedLanguageCodes: string[],
): boolean => {
  const { includedValues, excludedValues } = splitIncludeFilterValues(includedLanguageCodes);
  const normalizedIncludedValues = normalizeLanguageFilterValues(includedValues);
  const normalizedExcludedValues = normalizeLanguageFilterValues(excludedValues);
  const sourceLanguageCodes = getMultiSearchSourceLanguageValues(source);

  if (sourceLanguageCodes.some((languageCode) => normalizedExcludedValues.includes(languageCode))) {
    return false;
  }

  return !normalizedIncludedValues.length
    || sourceLanguageCodes.some((languageCode) => normalizedIncludedValues.includes(languageCode));
};

export const getMultiSearchLanguageFilterMode = (
  modes: MultiSearchLanguageFilterModes,
  languageCode: string,
): MultiSearchLanguageFilterMode => {
  const mode = modes[languageCode];
  return isLanguageFilterMode(mode) ? mode : "default";
};

export const hasActiveMultiSearchLanguageFilter = (
  modes: MultiSearchLanguageFilterModes,
): boolean => (
  Object.values(modes).some((mode) => mode === "only" || mode === "without")
);

export const toggleMultiSearchLanguageFilterMode = (
  mode: MultiSearchLanguageFilterMode,
  toggledMode: Exclude<MultiSearchLanguageFilterMode, "default">,
): MultiSearchLanguageFilterMode => {
  return mode === toggledMode ? "default" : toggledMode;
};

const getLanguageCodesByFilterMode = (
  modes: MultiSearchLanguageFilterModes,
  expectedMode: MultiSearchLanguageFilterMode,
): string[] => (
  normalizeLanguageFilterValues(Object.entries(modes)
    .filter(([, mode]) => mode === expectedMode)
    .map(([languageCode]) => languageCode))
);

const doesSourceMatchLanguageFilter = (
  source: MultiSearchSourceResult,
  modes: MultiSearchLanguageFilterModes,
): boolean => {
  const onlyLanguageCodes = getLanguageCodesByFilterMode(modes, "only");
  const withoutLanguageCodes = getLanguageCodesByFilterMode(modes, "without");
  const sourceLanguageCodes = getMultiSearchSourceLanguageValues(source);

  if (withoutLanguageCodes.some((languageCode) => sourceLanguageCodes.includes(languageCode))) {
    return false;
  }

  if (
    onlyLanguageCodes.length
    && !onlyLanguageCodes.some((languageCode) => sourceLanguageCodes.includes(languageCode))
  ) {
    return false;
  }

  return true;
};

export const filterMultiSearchMergedResultsByLanguage = (
  results: MultiSearchMergedResult[],
  modes: MultiSearchLanguageFilterModes,
): MultiSearchMergedResult[] => {
  if (!hasActiveMultiSearchLanguageFilter(modes)) {
    return results;
  }

  return results.reduce<MultiSearchMergedResult[]>((visibleResults, result) => {
    const visibleSources = result.sources.filter((source) => doesSourceMatchLanguageFilter(source, modes));
    if (!visibleSources.length) {
      return visibleResults;
    }

    visibleResults.push(
      buildFilteredMultiSearchMergedResult(result, visibleSources, getMultiSearchSourceLanguageValues),
    );
    return visibleResults;
  }, []);
};

export const filterMultiSearchRunsByLanguage = (
  runs: MultiSearchScraperRun[],
  modes: MultiSearchLanguageFilterModes,
): MultiSearchScraperRun[] => {
  if (!hasActiveMultiSearchLanguageFilter(modes)) {
    return runs;
  }

  return runs.map((run) => ({
    ...run,
    results: run.results.filter((source) => doesSourceMatchLanguageFilter(source, modes)),
  }));
};

export const buildMultiSearchResultLanguageFilterCodes = (
  sources: MultiSearchSourceResult[],
): string[] => (
  uniqueMultiSearchFilterValues(sources.flatMap(getMultiSearchSourceLanguageValues))
    .sort((left, right) => getLanguageLabel(left).localeCompare(getLanguageLabel(right)))
);
